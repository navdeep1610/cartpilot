import {
  appendAuditEvent,
  DatabaseConfigurationError,
  findPaymentRecord,
  getSupabaseAdmin,
} from "@/server/database/supabase-admin";
import { PaymentConfigurationError, verifyRazorpayPaymentCallback } from "@/server/payments/razorpay-test-adapter";
import { getShoppingSessionId } from "@/server/session/shopping-session";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/v1/payment-records/[recordId]/verify">) {
  const { recordId } = await context.params;
  const sessionId = getShoppingSessionId(request);
  if (!sessionId) return safeError("SESSION_REQUIRED", "Your checkout session expired.", 401, true);

  try {
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
    const admin = getSupabaseAdmin();
    const nextState = signatureValid ? "callback_verified" : "signature_verification_failed";
    const reasonCode = signatureValid ? "CHECKOUT_CALLBACK_VERIFIED" : "PAYMENT_SIGNATURE_INVALID";

    const { error: updateError } = await admin
      .from("payment_records")
      .update({
        state: nextState,
        callback_verified: signatureValid,
        razorpay_payment_id: signatureValid ? paymentId : null,
        fulfilment_authorized: false,
        failure_code: signatureValid ? null : reasonCode,
        updated_at: new Date().toISOString(),
      })
      .eq("payment_record_id", recordId)
      .eq("session_id", sessionId);
    if (updateError) throw updateError;
    await admin.from("payment_transitions").insert({
      payment_record_id: recordId,
      from_state: record.state,
      to_state: nextState,
      trigger: "checkout_callback",
      source: "browser_callback",
      applied: true,
      reason_code: reasonCode,
    });
    await appendAuditEvent({
      traceId: recordId,
      eventType: signatureValid ? "payment.callback_verified" : "payment.callback_rejected",
      actorType: "payment_provider",
      outcome: signatureValid ? "success" : "failure",
      reasonCode,
      resourceId: recordId,
      evidence: { orderMatched: orderMatches, callbackVerified: signatureValid, fulfilmentAuthorized: false },
    });

    if (!signatureValid) return safeError("PAYMENT_SIGNATURE_INVALID", "The payment response could not be verified. Fulfilment remains blocked.", 400, false);
    return Response.json({
      paymentRecordId: recordId,
      state: "callback_verified",
      callbackVerified: true,
      captureConfirmationPending: true,
      fulfilmentAuthorized: false,
      message: "Payment response verified. Waiting for server-side capture confirmation.",
    });
  } catch (error) {
    if (error instanceof PaymentConfigurationError) return safeError("RAZORPAY_SETUP_REQUIRED", "Razorpay Test Mode verification is unavailable.", 503, true);
    if (error instanceof DatabaseConfigurationError) return safeError("SUPABASE_SETUP_REQUIRED", "Secure payment storage is unavailable.", 503, true);
    return safeError("CALLBACK_VERIFICATION_FAILED", "The payment response could not be verified safely.", 503, true);
  }
}

function safeError(error: string, message: string, status: number, retrySafe: boolean) {
  return Response.json({ error, message, retrySafe, fulfilmentAuthorized: false }, { status });
}
