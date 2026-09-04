import {
  DatabaseConfigurationError,
  findPaymentRecord,
} from "@/server/database/supabase-admin";
import { applyPaymentCallback } from "@/server/payments/atomic-payment-store";
import { PaymentConfigurationError, verifyRazorpayPaymentCallback } from "@/server/payments/razorpay-test-adapter";
import { getShoppingSessionId } from "@/server/session/shopping-session";
import { guardCustomerMutation, MutationRequestError } from "@/server/security/mutation-request";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/v1/payment-records/[recordId]/verify">) {
  const { recordId } = await context.params;
  const sessionId = getShoppingSessionId(request);
  if (!sessionId) return safeError("SESSION_REQUIRED", "Your checkout session expired.", 401, true);

  try {
    const { idempotencyKey } = guardCustomerMutation(request);
    const body = (await request.json()) as Record<string, unknown>;
    const paymentId = body.razorpay_payment_id;
    const orderId = body.razorpay_order_id;
    const signature = body.razorpay_signature;
    if (
      typeof paymentId !== "string" ||
      typeof orderId !== "string" ||
      typeof signature !== "string" ||
      paymentId.length > 100 ||
      orderId.length > 100 ||
      signature.length > 200
    ) {
      return safeError("INVALID_PAYMENT_CALLBACK", "The payment response was incomplete.", 400, false);
    }

    const record = await findPaymentRecord(recordId, sessionId);
    if (!record || !record.razorpay_order_id) return safeError("PAYMENT_RECORD_NOT_FOUND", "The payment record could not be found.", 404, false);
    const orderMatches = orderId === record.razorpay_order_id;
    const signatureValid = orderMatches && verifyRazorpayPaymentCallback({ orderId: record.razorpay_order_id, paymentId, signature });
    const reasonCode = signatureValid ? "CHECKOUT_CALLBACK_VERIFIED" : "PAYMENT_SIGNATURE_INVALID";
    const storedRecord = await applyPaymentCallback({
      recordId,
      sessionId,
      paymentId,
      signatureValid,
      reasonCode,
      idempotencyKey,
    });

    if (!signatureValid) return safeError("PAYMENT_SIGNATURE_INVALID", "The payment response could not be verified. Fulfilment remains blocked.", 400, false);
    if (storedRecord.manual_review_required) {
      return safeError("PAYMENT_ID_CONFLICT", "The payment reference needs manual reconciliation. Fulfilment remains blocked.", 409, false);
    }
    return Response.json({
      paymentRecordId: recordId,
      state: storedRecord.state,
      callbackVerified: storedRecord.callback_verified,
      captureConfirmationPending: !storedRecord.capture_confirmed,
      fulfilmentAuthorized: storedRecord.fulfilment_authorized,
      message: storedRecord.fulfilment_authorized
        ? "Payment and capture are verified. The demo fulfilment gate is open."
        : "Payment response verified. Waiting for server-side capture confirmation.",
    });
  } catch (error) {
    if (error instanceof MutationRequestError) return safeError(error.code, error.message, error.status, false);
    if (error instanceof PaymentConfigurationError) return safeError("RAZORPAY_SETUP_REQUIRED", "Razorpay Test Mode verification is unavailable.", 503, true);
    if (error instanceof DatabaseConfigurationError) return safeError("SUPABASE_SETUP_REQUIRED", "Secure payment storage is unavailable.", 503, true);
    return safeError("CALLBACK_VERIFICATION_FAILED", "The payment response could not be verified safely.", 503, true);
  }
}

function safeError(error: string, message: string, status: number, retrySafe: boolean) {
  return Response.json({ error, message, retrySafe, fulfilmentAuthorized: false }, { status });
}
