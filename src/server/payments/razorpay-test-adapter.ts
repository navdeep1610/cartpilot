import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

let cachedClient: Razorpay | null = null;

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
  const client = getRazorpayClient();
  return client.orders.create({
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt,
    partial_payment: false,
    notes: {
      payment_record_id: input.paymentRecordId,
      decision_id: input.decisionId,
      environment: "test",
    },
  });
}

export interface RazorpayTestOrderEvidence {
  id: string;
  amountPaise: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
}

export async function findRazorpayTestOrderByReceipt(receipt: string): Promise<RazorpayTestOrderEvidence | null> {
  if (!/^ORD-[A-Z0-9-]{8,80}$/.test(receipt) || receipt.length > 40) {
    throw new Error("Invalid Razorpay receipt");
  }
  const result = await getRazorpayClient().orders.all({ receipt, count: 10 });
  return selectRazorpayOrderByReceipt(result.items, receipt);
}

export function selectRazorpayOrderByReceipt(
  orders: Array<{ id: string; amount: string | number; currency: string; receipt?: string; status: "created" | "attempted" | "paid" }>,
  receipt: string,
): RazorpayTestOrderEvidence | null {
  const matches = orders.filter((order) => order.receipt === receipt);
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("Razorpay receipt resolved to multiple orders");
  const order = matches[0];
  return {
    id: order.id,
    amountPaise: toIntegerAmount(order.amount),
    currency: order.currency,
    receipt,
    status: order.status,
  };
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
  const client = getRazorpayClient();
  const [payment, order] = await Promise.all([
    client.payments.fetch(input.paymentId),
    client.orders.fetch(input.orderId),
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

function getRazorpayClient(): Razorpay {
  if (cachedClient) return cachedClient;
  const { keyId, keySecret } = getRazorpayCredentials();
  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (process.env.RAZORPAY_MODE?.trim() !== "test" || !keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
    throw new PaymentConfigurationError();
  }
  return { keyId, keySecret };
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
