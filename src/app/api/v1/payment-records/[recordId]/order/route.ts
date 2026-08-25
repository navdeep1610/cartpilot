import {
  appendAuditEvent,
  DatabaseConfigurationError,
  findPaymentRecord,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";
import {
  createRazorpayTestOrder,
  getRazorpayPublicKey,
  PaymentConfigurationError,
} from "@/server/payments/razorpay-test-adapter";
import { getShoppingSessionId } from "@/server/session/shopping-session";
import { markPaymentTimedOut, PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/v1/payment-records/[recordId]/order">) {
  const { recordId } = await context.params;
  if (!/^PAYREC-[A-Z0-9-]{8,80}$/.test(recordId)) return safeError("INVALID_PAYMENT_RECORD", "Invalid checkout reference.", 400, false);
  const sessionId = getShoppingSessionId(request);
  if (!sessionId) return safeError("SESSION_REQUIRED", "Your checkout session expired. Please confirm the cart again.", 401, true);

  let record: StoredPaymentRecord | null = null;
  try {
    record = await findPaymentRecord(recordId, sessionId);
    if (!record) return safeError("PAYMENT_RECORD_NOT_FOUND", "This confirmed checkout could not be found.", 404, false);
    record = await markPaymentTimedOut(record);
    if (record.failure_code === PAYMENT_TIMEOUT_REASON) {
      return safeError("ORDER_EXPIRED", "This checkout expired after one hour without payment. Confirm the cart again to create a new test order.", 409, true);
    }
    if (record.fulfilment_authorized || record.state === "payment_captured") {
      return safeError("ORDER_ALREADY_PAID", "This order is already paid and cannot be opened again.", 409, false);
    }
    if (record.razorpay_order_id) return Response.json(toCheckoutResponse(record));

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("payment_records")
      .update({ state: "order_creation_pending", order_creation_claimed_at: now, updated_at: now })
      .eq("payment_record_id", recordId)
      .eq("session_id", sessionId)
      .eq("state", "customer_confirmed")
      .is("razorpay_order_id", null)
      .is("order_creation_claimed_at", null)
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return safeError("ORDER_CREATION_IN_PROGRESS", "Checkout is already being prepared. Please wait before retrying.", 409, true);
    record = claimed as StoredPaymentRecord;

    const order = await createRazorpayTestOrder({
      amountPaise: record.amount_paise,
      receipt: record.internal_order_id,
      paymentRecordId: record.payment_record_id,
      decisionId: record.decision_id,
    });
    if (Number(order.amount) !== record.amount_paise || order.currency !== "INR") {
      throw new Error("Razorpay order reconciliation failed");
    }

    const { data: stored, error: storeError } = await admin
      .from("payment_records")
      .update({
        state: "order_created",
        razorpay_order_id: order.id,
        razorpay_order_status: order.status,
        order_receipt: order.receipt ?? record.internal_order_id,
        failure_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("payment_record_id", recordId)
      .eq("session_id", sessionId)
      .select("*")
      .single();
    if (storeError) throw storeError;
    const storedRecord = stored as StoredPaymentRecord;
    await admin.from("payment_transitions").insert({
      payment_record_id: recordId,
      from_state: "customer_confirmed",
      to_state: "order_created",
      trigger: "razorpay_order_created",
      source: "server_api",
      applied: true,
      reason_code: "TEST_ORDER_CREATED",
    });
    await appendAuditEvent({
      traceId: recordId,
      eventType: "payment.order_created",
      actorType: "system",
      outcome: "success",
      reasonCode: "TEST_ORDER_CREATED",
      resourceId: recordId,
      evidence: { razorpayOrderId: order.id, amountPaise: record.amount_paise, currency: "INR" },
    });
    return Response.json(toCheckoutResponse(storedRecord), { status: 201 });
  } catch (error) {
    if (record?.payment_record_id) {
      try {
        await getSupabaseAdmin()
          .from("payment_records")
          .update({ state: "order_creation_unknown", failure_code: "ORDER_PROVIDER_UNAVAILABLE", updated_at: new Date().toISOString() })
          .eq("payment_record_id", record.payment_record_id)
          .is("razorpay_order_id", null);
      } catch {
        // Preserve the original safe provider error response.
      }
    }
    if (error instanceof PaymentConfigurationError) {
      return safeError("RAZORPAY_SETUP_REQUIRED", "Razorpay Test Mode is not connected yet. No payment was started.", 503, true);
    }
    if (error instanceof DatabaseConfigurationError) {
      return safeError("SUPABASE_SETUP_REQUIRED", "Secure checkout storage is not connected yet.", 503, true);
    }
    return safeError("ORDER_CREATION_UNKNOWN", "Checkout could not be opened safely. Please wait before retrying.", 502, true);
  }
}

function toCheckoutResponse(record: StoredPaymentRecord) {
  if (!record.razorpay_order_id) throw new Error("Stored record has no Razorpay order");
  return {
    paymentRecordId: record.payment_record_id,
    keyId: getRazorpayPublicKey(),
    orderId: record.razorpay_order_id,
    amountPaise: record.amount_paise,
    currency: record.currency,
    merchantName: "CartPilot Demo Skincare Store",
    description: "CartPilot skincare order (Test Mode)",
    testMode: true,
    fulfilmentAuthorized: false,
  };
}

function safeError(error: string, message: string, status: number, retrySafe: boolean) {
  return Response.json({ error, message, retrySafe }, { status });
}
