import { guardMerchantApi } from "@/server/auth/merchant-authorization";
import { verifyAuditChain, type StoredAuditEnvelope } from "@/server/audit/audit-chain";
import { DatabaseConfigurationError, getSupabaseAdmin } from "@/server/database/supabase-admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  const authError = await guardMerchantApi();
  if (authError) return authError;

  const { traceId } = await context.params;
  if (!/^TRACE-[A-Z0-9-]{8,80}$/.test(traceId)) {
    return Response.json({ error: "INVALID_TRACE_ID" }, { status: 400, headers: noStoreHeaders() });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: record, error: recordError } = await admin
      .from("payment_records")
      .select("payment_record_id,internal_order_id,decision_id,trace_id,state,fulfilment_authorized")
      .eq("trace_id", traceId)
      .maybeSingle();
    if (recordError) throw recordError;
    if (!record) {
      return Response.json({ error: "TRACE_NOT_FOUND" }, { status: 404, headers: noStoreHeaders() });
    }

    const { data: eventData, error: eventError } = await admin
      .from("audit_events")
      .select("audit_event_id,trace_id,sequence_number,event_type,outcome,reason_code,created_at,schema_version,idempotency_key,previous_event_hash,payload_hash,event_hash,canonical_payload,event_payload")
      .eq("trace_id", traceId)
      .eq("schema_version", "1.0.0")
      .order("sequence_number", { ascending: true });
    if (eventError) throw eventError;
    const events = (eventData ?? []) as StoredAuditEnvelope[];
    const integrity = verifyAuditChain(events);

    const { data: decision, error: decisionError } = await admin
      .from("offer_decisions")
      .select("catalog_version,policy_version,selected_candidate_id,customer_total_paise,cart_hash,decision_payload")
      .eq("decision_id", record.decision_id)
      .maybeSingle();
    if (decisionError) throw decisionError;

    return Response.json({
      schemaVersion: "1.0.0",
      traceId,
      generatedAt: new Date().toISOString(),
      integrity,
      subject: record,
      decisionEvidence: decision?.decision_payload?.auditDecision ?? null,
      events: events.map((event) => ({
        sequence: event.sequence_number,
        id: event.audit_event_id,
        eventName: event.event_type,
        outcome: event.outcome,
        reasonCode: event.reason_code,
        previousEventHash: event.previous_event_hash,
        payloadHash: event.payload_hash,
        eventHash: event.event_hash,
        payload: event.event_payload,
      })),
    }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json({ error: "SUPABASE_SETUP_REQUIRED" }, { status: 503, headers: noStoreHeaders() });
    }
    return Response.json(
      { error: "AUDIT_TRACE_UNAVAILABLE", message: "The audit trace could not be verified just now." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
