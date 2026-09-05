import {
  DatabaseConfigurationError,
  findPaymentRecord,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";
import {
  claimPaymentOrder,
  completePaymentOrder,
  markPaymentOrderUnknown,
  startPaymentRetry,
} from "@/server/payments/atomic-payment-store";
import {
  createRazorpayTestOrder,
  findRazorpayTestOrderByReceipt,
  getRazorpayPublicKey,
  PaymentConfigurationError,
} from "@/server/payments/razorpay-test-adapter";
import { getShoppingSessionId } from "@/server/session/shopping-session";
import { markPaymentTimedOut, PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";
import { guardCustomerMutation, MutationRequestError } from "@/server/security/mutation-request";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/v1/payment-records/[recordId]/order">) {
  const { recordId } = await context.params;
  if (!/^PAYREC-[A-Z0-9-]{8,80}$/.test(recordId)) return safeError("INVALID_PAYMENT_RECORD", "Invalid checkout reference.", 400, false);
  const sessionId = getShoppingSessionId(request);
  if (!sessionId) return safeError("SESSION_REQUIRED", "Your checkout session expired. Please confirm the cart again.", 401, true);

  let record: StoredPaymentRecord | null = null;
  let idempotencyKey: string | null = null;
  let orderCreationClaimed = false;
  try {
    ({ idempotencyKey } = guardCustomerMutation(request));
    record = await findPaymentRecord(recordId, sessionId);
    if (!record) return safeError("PAYMENT_RECORD_NOT_FOUND", "This confirmed checkout could not be found.", 404, false);
    record = await markPaymentTimedOut(record);
    if (record.failure_code === PAYMENT_TIMEOUT_REASON) {
      return safeError("ORDER_EXPIRED", "This checkout expired after one hour without payment. Confirm the cart again to create a new test order.", 409, true);
    }
    if (["payment_failed", "signature_verification_failed", "cancelled"].includes(record.state)) {
      record = await startPaymentRetry({ recordId, sessionId, idempotencyKey });
      return Response.json(toCheckoutResponse(record));
    }
    if (record.fulfilment_authorized || record.state === "payment_captured") {
      return safeError("ORDER_ALREADY_PAID", "This order is already paid and cannot be opened again.", 409, false);
    }
    if (record.state === "order_creation_unknown") {
      const recoveredOrder = await findRazorpayTestOrderByReceipt(record.internal_order_id);
      if (!recoveredOrder) {
        return safeError(
          "ORDER_CREATION_RECONCILING",
          "Razorpay has not confirmed whether the order was created. No second order will be attempted yet.",
          409,
          true,
        );
      }
      if (recoveredOrder.amountPaise !== record.amount_paise || recoveredOrder.currency !== record.currency) {
        return safeError("ORDER_RECONCILIATION_FAILED", "The recovered order did not match this cart. Checkout remains blocked.", 409, false);
      }
      record = await completePaymentOrder({
        recordId,
        sessionId,
        idempotencyKey,
        razorpayOrderId: recoveredOrder.id,
        orderStatus: recoveredOrder.status,
        receipt: recoveredOrder.receipt,
      });
      return Response.json(toCheckoutResponse(record));
    }
    const claim = await claimPaymentOrder({ recordId, sessionId, idempotencyKey });
    record = claim.record;
    if (claim.status === "existing") return Response.json(toCheckoutResponse(record));
    if (claim.status === "in_progress") {
      return safeError("ORDER_CREATION_IN_PROGRESS", "Checkout is already being prepared. Please wait before retrying.", 409, true);
    }
    orderCreationClaimed = true;

    const order = await createRazorpayTestOrder({
      amountPaise: record.amount_paise,
      receipt: record.internal_order_id,
      paymentRecordId: record.payment_record_id,
      decisionId: record.decision_id,
    });
    if (Number(order.amount) !== record.amount_paise || order.currency !== "INR") {
      throw new Error("Razorpay order reconciliation failed");
    }

    const storedRecord = await completePaymentOrder({
      recordId,
      sessionId,
      idempotencyKey,
      razorpayOrderId: order.id,
      orderStatus: order.status,
      receipt: order.receipt ?? record.internal_order_id,
    });
    return Response.json(toCheckoutResponse(storedRecord), { status: 201 });
  } catch (error) {
    if (orderCreationClaimed && record?.payment_record_id && idempotencyKey) {
      try {
        await markPaymentOrderUnknown({
          recordId: record.payment_record_id,
          sessionId,
          idempotencyKey,
          reasonCode: "ORDER_PROVIDER_UNAVAILABLE",
        });
      } catch {
        // Preserve the original safe provider error response.
      }
    }
    if (error instanceof MutationRequestError) {
      return safeError(error.code, error.message, error.status, false);
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
