import { createHmac, timingSafeEqual } from "node:crypto";

export class PaymentConfigurationError extends Error {
  constructor(message = "Razorpay Test Mode configuration is unavailable") {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

export function getRazorpayPublicKey(): string {
  return getRazorpayCredentials().keyId;
}

export async function createRazorpayTestOrder(input: {
  amountPaise: number;
  receipt: string;
  paymentRecordId: string;
  decisionId: string;
}) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100) {
    throw new Error("Invalid Razorpay order amount");
  }
  if (input.receipt.length > 40) throw new Error("Razorpay receipt exceeds 40 characters");
  return razorpayRequest<RazorpayOrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      partial_payment: false,
      notes: {
        payment_record_id: input.paymentRecordId,
        decision_id: input.decisionId,
        environment: "test",
      },
    }),
  });
}

export interface RazorpayTestPaymentEvidence {
  payment: {
    id: string;
    orderId: string;
    amountPaise: number;
    currency: string;
    status: "created" | "authorized" | "captured" | "refunded" | "failed";
    captured: boolean;
  };
  order: {
    id: string;
    amountPaise: number;
    amountPaidPaise: number;
    amountDuePaise: number;
    currency: string;
    status: "created" | "attempted" | "paid";
  };
}

export async function fetchRazorpayTestPaymentEvidence(input: {
  paymentId: string;
  orderId: string;
}): Promise<RazorpayTestPaymentEvidence> {
  if (!/^pay_[A-Za-z0-9]+$/.test(input.paymentId) || !/^order_[A-Za-z0-9]+$/.test(input.orderId)) {
    throw new Error("Invalid Razorpay payment references");
  }
  const [payment, order] = await Promise.all([
    razorpayRequest<RazorpayPaymentResponse>(`/payments/${encodeURIComponent(input.paymentId)}`),
    razorpayRequest<RazorpayOrderResponse>(`/orders/${encodeURIComponent(input.orderId)}`),
  ]);

  return {
    payment: {
      id: payment.id,
      orderId: payment.order_id,
      amountPaise: toIntegerAmount(payment.amount),
      currency: payment.currency,
      status: payment.status,
      captured: payment.captured,
    },
    order: {
      id: order.id,
      amountPaise: toIntegerAmount(order.amount),
      amountPaidPaise: toIntegerAmount(order.amount_paid),
      amountDuePaise: toIntegerAmount(order.amount_due),
      currency: order.currency,
      status: order.status,
    },
  };
}

export function verifyRazorpayPaymentCallback(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getRazorpayCredentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${input.orderId}|${input.paymentId}`, "utf8")
    .digest("hex");
  return safeEqual(expected, input.signature);
}

export function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) throw new PaymentConfigurationError("Razorpay webhook secret is unavailable");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signature);
}

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (process.env.RAZORPAY_MODE?.trim() !== "test" || !keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
    throw new PaymentConfigurationError();
  }
  return { keyId, keySecret };
}

interface RazorpayOrderResponse {
  id: string;
  amount: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  currency: string;
  status: "created" | "attempted" | "paid";
  receipt?: string | null;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id: string;
  amount: number | string;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  captured: boolean;
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { keyId, keySecret } = getRazorpayCredentials();
  const authorization = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Razorpay request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

function safeEqual(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function toIntegerAmount(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid Razorpay amount");
  return amount;
}
