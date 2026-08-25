import {
  appendAuditEvent,
  DatabaseConfigurationError,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";
import { PaymentConfigurationError, verifyRazorpayWebhook } from "@/server/payments/razorpay-test-adapter";
import { sha256 } from "@/server/security/canonical-json";

export const runtime = "nodejs";

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  status?: string;
  captured?: boolean;
  error_code?: string;
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    order?: { entity?: RazorpayEntity };
  };
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");
  const rawBody = await request.text();
  if (!signature || !eventId || eventId.length > 160) {
    return Response.json({ error: "WEBHOOK_HEADERS_REQUIRED" }, { status: 400 });
  }

  try {
    if (!verifyRazorpayWebhook(rawBody, signature)) {
      return Response.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 });
    }
    const body = JSON.parse(rawBody) as RazorpayWebhookBody;
    const eventType = body.event;
    if (!eventType || eventType.length > 100) return Response.json({ error: "INVALID_WEBHOOK_EVENT" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { error: eventInsertError } = await admin.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      payload_hash: sha256(rawBody),
      verified: true,
      processing_status: "received",
    });
    if (eventInsertError) {
      if (eventInsertError.code === "23505") return Response.json({ received: true, duplicate: true });
      throw eventInsertError;
    }

    const payment = body.payload?.payment?.entity;
    const order = body.payload?.order?.entity;
    const razorpayOrderId = payment?.order_id ?? order?.id;
    if (!razorpayOrderId) {
      await finishEvent(eventId, "ignored", null, "ORDER_ID_MISSING");
      return Response.json({ received: true, applied: false });
    }

    const { data, error: lookupError } = await admin
      .from("payment_records")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const record = data as StoredPaymentRecord | null;
    if (!record) {
      await finishEvent(eventId, "ignored", null, "PAYMENT_RECORD_NOT_FOUND");
      return Response.json({ received: true, applied: false });
    }

    const result = transitionForEvent(record, eventType, payment, order);
    if (!result.reconciled) {
      await finishEvent(eventId, "failed", record.payment_record_id, result.reasonCode);
      await appendAuditEvent({
        traceId: record.payment_record_id,
        eventType: "payment.webhook_reconciliation_failed",
        actorType: "payment_provider",
        outcome: "failure",
        reasonCode: result.reasonCode,
        resourceId: record.payment_record_id,
        evidence: { eventId, eventType, fulfilmentAuthorized: false },
      });
      return Response.json({ received: true, applied: false });
    }

    const { error: updateError } = await admin
      .from("payment_records")
      .update({ ...result.update, updated_at: new Date().toISOString() })
      .eq("payment_record_id", record.payment_record_id);
    if (updateError) throw updateError;
    await admin.from("payment_transitions").insert({
      payment_record_id: record.payment_record_id,
      from_state: record.state,
      to_state: result.update.state ?? record.state,
      trigger: eventType,
      source: "verified_webhook",
      applied: result.applied,
      reason_code: result.reasonCode,
    });
    await finishEvent(eventId, result.applied ? "applied" : "ignored", record.payment_record_id, null);
    await appendAuditEvent({
      traceId: record.payment_record_id,
      eventType: `payment.webhook_${result.applied ? "applied" : "ignored"}`,
      actorType: "payment_provider",
      outcome: "success",
      reasonCode: result.reasonCode,
      resourceId: record.payment_record_id,
      evidence: {
        eventId,
        eventType,
        captureConfirmed: result.update.capture_confirmed ?? record.capture_confirmed,
        fulfilmentAuthorized: result.update.fulfilment_authorized ?? record.fulfilment_authorized,
      },
    });
    return Response.json({ received: true, applied: result.applied });
  } catch (error) {
    if (error instanceof PaymentConfigurationError) return Response.json({ error: "WEBHOOK_SETUP_REQUIRED" }, { status: 503 });
    if (error instanceof DatabaseConfigurationError) return Response.json({ error: "WEBHOOK_STORAGE_UNAVAILABLE" }, { status: 503 });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 503 });
  }
}

function transitionForEvent(
  record: StoredPaymentRecord,
  eventType: string,
  payment?: RazorpayEntity,
  order?: RazorpayEntity,
): {
  reconciled: boolean;
  applied: boolean;
  reasonCode: string;
  update: Record<string, unknown>;
} {
  const paymentMatches =
    !payment ||
    (payment.order_id === record.razorpay_order_id &&
      payment.amount === record.amount_paise &&
      payment.currency === record.currency);
  const orderMatches =
    !order ||
    (order.id === record.razorpay_order_id &&
      order.amount === record.amount_paise &&
      (!order.currency || order.currency === record.currency));
  if (!paymentMatches || !orderMatches) {
    return { reconciled: false, applied: false, reasonCode: "WEBHOOK_AMOUNT_OR_ORDER_MISMATCH", update: {} };
  }

  if (record.capture_confirmed && ["payment.failed", "payment.authorized"].includes(eventType)) {
    return { reconciled: true, applied: false, reasonCode: "MONOTONIC_STATE_PROTECTED", update: {} };
  }

  if (eventType === "payment.failed") {
    return {
      reconciled: true,
      applied: true,
      reasonCode: "TEST_PAYMENT_FAILED_SAFELY",
      update: {
        state: "payment_failed",
        razorpay_payment_id: payment?.id ?? record.razorpay_payment_id,
        failure_code: payment?.error_code ?? "PAYMENT_FAILED",
        fulfilment_authorized: false,
      },
    };
  }

  if (eventType === "payment.authorized") {
    return {
      reconciled: true,
      applied: true,
      reasonCode: "PAYMENT_AUTHORIZED_CAPTURE_PENDING",
      update: {
        state: "payment_authorized",
        razorpay_payment_id: payment?.id ?? record.razorpay_payment_id,
        failure_code: null,
        fulfilment_authorized: false,
      },
    };
  }

  if (eventType === "payment.captured") {
    if (!payment || payment.status !== "captured" || payment.captured !== true) {
      return { reconciled: false, applied: false, reasonCode: "CAPTURE_EVIDENCE_INCOMPLETE", update: {} };
    }
    const orderPaid = order?.status === "paid" && order.amount_due === 0 || record.razorpay_order_status === "paid";
    return {
      reconciled: true,
      applied: true,
      reasonCode: orderPaid ? "CAPTURE_AND_ORDER_RECONCILED" : "CAPTURE_CONFIRMED_ORDER_STATUS_PENDING",
      update: {
        state: "payment_captured",
        razorpay_payment_id: payment.id,
        razorpay_order_status: order?.status ?? record.razorpay_order_status,
        capture_confirmed: true,
        capture_confirmation_source: "verified_webhook",
        fulfilment_authorized: orderPaid,
        failure_code: null,
      },
    };
  }

  if (eventType === "order.paid") {
    if (!order || order.status !== "paid" || order.amount_due !== 0 || order.amount_paid !== record.amount_paise) {
      return { reconciled: false, applied: false, reasonCode: "ORDER_PAID_EVIDENCE_INCOMPLETE", update: {} };
    }
    return {
      reconciled: true,
      applied: true,
      reasonCode: record.capture_confirmed ? "CAPTURE_AND_ORDER_RECONCILED" : "ORDER_PAID_CAPTURE_PENDING",
      update: {
        state: record.capture_confirmed ? "payment_captured" : record.state,
        razorpay_order_status: "paid",
        fulfilment_authorized: record.capture_confirmed,
        failure_code: null,
      },
    };
  }

  return { reconciled: true, applied: false, reasonCode: "EVENT_NOT_APPLICABLE", update: {} };
}

async function finishEvent(
  eventId: string,
  processingStatus: "applied" | "ignored" | "failed",
  paymentRecordId: string | null,
  failureCode: string | null,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("webhook_events")
    .update({
      processing_status: processingStatus,
      payment_record_id: paymentRecordId,
      failure_code: failureCode,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) throw error;
}
