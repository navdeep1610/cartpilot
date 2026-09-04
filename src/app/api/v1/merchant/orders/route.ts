import type { MerchantOrdersResponse } from "@/domain/orders/merchant-order";
import { guardMerchantApi } from "@/server/auth/merchant-authorization";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import {
  DatabaseConfigurationError,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";
import {
  toMerchantOrder,
  type StoredAuditEvent,
} from "@/server/orders/merchant-order-mapper";
import { expireStaleUnpaidPaymentRecords } from "@/server/payments/payment-timeout";

export const runtime = "nodejs";

export async function GET() {
  const authError = await guardMerchantApi();
  if (authError) return authError;

  try {
    await expireStaleUnpaidPaymentRecords();
    const admin = getSupabaseAdmin();
    const { data: recordData, error: recordError } = await admin
      .from("payment_records")
      .select("*")
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (recordError) throw recordError;

    const records = (recordData ?? []) as StoredPaymentRecord[];
    const traceIds = records.map((record) => record.trace_id);
    let auditEvents: StoredAuditEvent[] = [];
    if (traceIds.length > 0) {
      const { data: auditData, error: auditError } = await admin
        .from("audit_events")
        .select("audit_event_id,trace_id,sequence_number,event_type,outcome,reason_code,created_at,schema_version,idempotency_key,previous_event_hash,payload_hash,event_hash,canonical_payload,event_payload")
        .in("trace_id", traceIds)
        .order("sequence_number", { ascending: true })
        .limit(1_000);
      if (auditError) throw auditError;
      auditEvents = (auditData ?? []) as StoredAuditEvent[];
    }

    const decisionIds = [...new Set(records.map((record) => record.decision_id))];
    const decisions = new Map<string, unknown>();
    if (decisionIds.length > 0) {
      const { data: decisionData, error: decisionError } = await admin
        .from("offer_decisions")
        .select("decision_id,decision_payload")
        .in("decision_id", decisionIds);
      if (decisionError) throw decisionError;
      for (const row of decisionData ?? []) decisions.set(row.decision_id as string, row.decision_payload);
    }

    const catalog = await getCatalogSnapshot();
    const response: MerchantOrdersResponse = {
      orders: records.map((record) => toMerchantOrder(record, auditEvents, catalog, decisions.get(record.decision_id))),
      generatedAt: new Date().toISOString(),
      storage: "supabase",
      testMode: true,
    };
    return Response.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "SUPABASE_SETUP_REQUIRED", message: "Supabase order storage is not connected." },
        { status: 503, headers: noStoreHeaders() },
      );
    }
    return Response.json(
      { error: "ORDER_LIST_UNAVAILABLE", message: "Orders could not be loaded from Supabase just now." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
