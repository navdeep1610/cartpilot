import { DatabaseConfigurationError, findPaymentRecord } from "@/server/database/supabase-admin";
import { applyPaymentReconciliation } from "@/server/payments/atomic-payment-store";
import { isPaymentRetryAllowed, requiresFreshPaymentRecord, retryWindowEndsAt } from "@/server/payments/payment-retry-window";
import { markPaymentTimedOut, PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";
import { fetchRazorpayTestPaymentEvidence } from "@/server/payments/razorpay-test-adapter";
import { reconcileRazorpayPayment } from "@/server/payments/reconcile-razorpay-payment";
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
    if (record.callback_verified && record.razorpay_payment_id && record.razorpay_order_id && !record.fulfilment_authorized) {
      try {
        const evidence = await fetchRazorpayTestPaymentEvidence({
          paymentId: record.razorpay_payment_id,
          orderId: record.razorpay_order_id,
        });
        const decision = reconcileRazorpayPayment(record, evidence);
        if (decision.update && hasReconciliationChange(record.state, record.capture_confirmed, record.fulfilment_authorized, decision.nextState, decision.update)) {
          record = await applyPaymentReconciliation({
            record,
            nextState: decision.nextState,
            reasonCode: decision.reasonCode,
            update: decision.update,
            outcome: "success",
          });
        }
      } catch {
        // A verified webhook or the next bounded poll can still finish reconciliation.
      }
    }
    const retryEndsAt = retryWindowEndsAt(record);
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
      retryAllowed: isPaymentRetryAllowed(record),
      retryEndsAt: retryEndsAt ? new Date(retryEndsAt).toISOString() : null,
      replacementRequired: requiresFreshPaymentRecord(record),
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
    return "Payment timed out after five minutes. Your cart is retained and a fresh payment order is being prepared.";
  }
  if (state === "payment_failed") return "The test payment failed safely. Your cart is retained and fulfilment remains blocked.";
  if (state === "callback_verified") return "Payment response verified. Waiting for server-side capture confirmation.";
  if (state === "payment_authorized") return "Payment authorized. Waiting for capture confirmation before fulfilment.";
  return "Checkout is still in progress. No fulfilment has been authorized.";
}

function hasReconciliationChange(
  state: string,
  captureConfirmed: boolean,
  fulfilmentAuthorized: boolean,
  nextState: string,
  update: Record<string, unknown>,
): boolean {
  return nextState !== state
    || (typeof update.capture_confirmed === "boolean" && update.capture_confirmed !== captureConfirmed)
    || (typeof update.fulfilment_authorized === "boolean" && update.fulfilment_authorized !== fulfilmentAuthorized);
}
