import { DatabaseConfigurationError, findPaymentRecord } from "@/server/database/supabase-admin";
import { markPaymentTimedOut, PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";
import { getShoppingSessionId } from "@/server/session/shopping-session";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/v1/payment-records/[recordId]">) {
  const { recordId } = await context.params;
  const sessionId = getShoppingSessionId(request);
  if (!sessionId) return Response.json({ error: "SESSION_REQUIRED", message: "Your checkout session expired." }, { status: 401 });

  try {
    let record = await findPaymentRecord(recordId, sessionId);
    if (!record) return Response.json({ error: "PAYMENT_RECORD_NOT_FOUND", message: "The payment record could not be found." }, { status: 404 });
    record = await markPaymentTimedOut(record);
    return Response.json({
      paymentRecordId: record.payment_record_id,
      decisionId: record.decision_id,
      amountPaise: record.amount_paise,
      currency: record.currency,
      state: record.state,
      callbackVerified: record.callback_verified,
      captureConfirmed: record.capture_confirmed,
      fulfilmentAuthorized: record.fulfilment_authorized,
      failureCode: record.failure_code,
      retryAllowed: ["payment_failed", "cancelled"].includes(record.state) && !record.capture_confirmed,
      customerMessage: customerMessage(record.state, record.fulfilment_authorized, record.failure_code),
    });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json({ error: "SUPABASE_SETUP_REQUIRED", message: "Secure payment storage is unavailable." }, { status: 503 });
    }
    return Response.json({ error: "PAYMENT_STATUS_UNAVAILABLE", message: "Payment status is temporarily unavailable." }, { status: 503 });
  }
}

function customerMessage(state: string, fulfilmentAuthorized: boolean, failureCode: string | null): string {
  if (fulfilmentAuthorized) return "Payment captured in Test Mode. The demo fulfilment gate is open.";
  if (failureCode === PAYMENT_TIMEOUT_REASON) {
    return "This test checkout expired after one hour without payment. Confirm the cart again to create a new order.";
  }
  if (state === "payment_failed") return "The test payment failed safely. Your cart is retained and fulfilment remains blocked.";
  if (state === "callback_verified") return "Payment response verified. Waiting for server-side capture confirmation.";
  if (state === "payment_authorized") return "Payment authorized. Waiting for capture confirmation before fulfilment.";
  return "Checkout is still in progress. No fulfilment has been authorized.";
}
