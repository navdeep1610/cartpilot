import { DatabaseConfigurationError } from "@/server/database/supabase-admin";
import { applyRazorpayWebhook } from "@/server/payments/atomic-payment-store";
import { PaymentConfigurationError, verifyRazorpayWebhook } from "@/server/payments/razorpay-test-adapter";
import { isVerifiedPaymentEvent } from "@/server/payments/payment-transition-policy";
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
  if (!signature || !eventId || !/^[A-Za-z0-9_-]{1,160}$/.test(eventId)) {
    return Response.json({ error: "WEBHOOK_HEADERS_REQUIRED" }, { status: 400 });
  }

  try {
    if (!verifyRazorpayWebhook(rawBody, signature)) {
      return Response.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 });
    }
    const body = JSON.parse(rawBody) as RazorpayWebhookBody;
    const eventType = body.event;
    if (!eventType || eventType.length > 100) {
      return Response.json({ error: "INVALID_WEBHOOK_EVENT" }, { status: 400 });
    }

    const payment = body.payload?.payment?.entity;
    const order = body.payload?.order?.entity;
    const result = await applyRazorpayWebhook({
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload_hash: sha256(rawBody),
      p_order_id: payment?.order_id ?? order?.id ?? null,
      p_payment_id: payment?.id ?? null,
      p_payment_amount: safeInteger(payment?.amount),
      p_payment_currency: payment?.currency ?? null,
      p_payment_status: payment?.status ?? null,
      p_payment_captured: payment?.captured ?? null,
      p_payment_error_code: sanitizeFailureCode(payment?.error_code),
      p_order_amount: safeInteger(order?.amount),
      p_order_currency: order?.currency ?? null,
      p_order_status: order?.status ?? null,
      p_order_amount_paid: safeInteger(order?.amount_paid),
      p_order_amount_due: safeInteger(order?.amount_due),
    });

    return Response.json({
      received: true,
      duplicate: result.duplicate,
      applied: isVerifiedPaymentEvent(eventType) && result.applied,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "INVALID_WEBHOOK_BODY" }, { status: 400 });
    if (error instanceof PaymentConfigurationError) return Response.json({ error: "WEBHOOK_SETUP_REQUIRED" }, { status: 503 });
    if (error instanceof DatabaseConfigurationError) return Response.json({ error: "WEBHOOK_STORAGE_UNAVAILABLE" }, { status: 503 });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 503 });
  }
}

function safeInteger(value: number | undefined): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function sanitizeFailureCode(value: string | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : "PAYMENT_FAILED";
}
