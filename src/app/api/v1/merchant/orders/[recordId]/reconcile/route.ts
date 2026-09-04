import {
  DatabaseConfigurationError,
  findPaymentRecord,
} from "@/server/database/supabase-admin";
import { applyPaymentReconciliation } from "@/server/payments/atomic-payment-store";
import { guardMerchantApi } from "@/server/auth/merchant-authorization";
import {
  fetchRazorpayTestPaymentEvidence,
  PaymentConfigurationError,
} from "@/server/payments/razorpay-test-adapter";
import { reconcileRazorpayPayment } from "@/server/payments/reconcile-razorpay-payment";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  const authError = await guardMerchantApi();
  if (authError) return authError;

  const { recordId } = await context.params;
  if (!/^PAYREC-[A-Z0-9-]{8,80}$/.test(recordId)) {
    return safeResponse({ error: "INVALID_PAYMENT_RECORD", message: "The order reference is invalid." }, 400);
  }

  try {
    const record = await findPaymentRecord(recordId);
    if (!record || !record.razorpay_order_id) {
      return safeResponse({ error: "ORDER_NOT_FOUND", message: "This Supabase order could not be found." }, 404);
    }
    if (record.fulfilment_authorized && record.capture_confirmed) {
      return safeResponse({
        reconciled: true,
        state: record.state,
        fulfilmentAuthorized: true,
        message: "This order is already confirmed as paid and ready to pack.",
      });
    }
    if (!record.razorpay_payment_id) {
      return safeResponse(
        { error: "PAYMENT_ID_PENDING", message: "Razorpay has not returned a payment ID for this order yet." },
        409,
      );
    }

    const evidence = await fetchRazorpayTestPaymentEvidence({
      paymentId: record.razorpay_payment_id,
      orderId: record.razorpay_order_id,
    });
    const decision = reconcileRazorpayPayment(record, evidence);

    if (!decision.evidenceMatched) {
      await applyPaymentReconciliation({
        record,
        nextState: record.state,
        reasonCode: decision.reasonCode,
        update: {},
        outcome: "failure",
      });
      return safeResponse(
        {
          error: "PAYMENT_EVIDENCE_MISMATCH",
          message: decision.message,
          fulfilmentAuthorized: false,
        },
        409,
      );
    }

    let storedRecord = record;
    if (decision.update) {
      storedRecord = await applyPaymentReconciliation({
        record,
        nextState: decision.nextState,
        reasonCode: decision.reasonCode,
        update: decision.update,
        outcome: "success",
      });
    }
    return safeResponse({
      reconciled: decision.status === "captured" || decision.status === "failed" || decision.status === "refunded",
      state: storedRecord.state,
      paymentStatus: decision.status,
      captureConfirmed: storedRecord.capture_confirmed,
      fulfilmentAuthorized: storedRecord.fulfilment_authorized,
      message: decision.message,
    });
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return safeResponse({ error: "RAZORPAY_SETUP_REQUIRED", message: "Razorpay Test Mode is not connected." }, 503);
    }
    if (error instanceof DatabaseConfigurationError) {
      return safeResponse({ error: "SUPABASE_SETUP_REQUIRED", message: "Supabase order storage is unavailable." }, 503);
    }
    return safeResponse({ error: "PAYMENT_RECHECK_FAILED", message: "Razorpay could not be checked safely just now. Try again shortly." }, 502);
  }
}

function safeResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
