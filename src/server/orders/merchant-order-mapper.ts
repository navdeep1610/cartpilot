import type { CatalogSnapshot } from "@/domain/catalog/types";
import type {
  MerchantOrder,
  MerchantOrderAuditEvent,
  MerchantOrderCustomer,
  MerchantOrderLine,
  MerchantPaymentStatus,
} from "@/domain/orders/merchant-order";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";

export interface StoredAuditEvent {
  audit_event_id: string;
  trace_id: string;
  event_type: string;
  outcome: string;
  reason_code: string;
  created_at: string;
}

export function toMerchantOrder(
  record: StoredPaymentRecord,
  auditEvents: StoredAuditEvent[],
  catalog?: CatalogSnapshot,
): MerchantOrder {
  if (!record.razorpay_order_id) throw new Error("Merchant order requires a Razorpay order id");

  const cart = asObject(record.confirmed_cart);
  const offer = asObject(cart.offer);
  const paymentStatus = paymentStatusFor(record.state, record.capture_confirmed);
  const lines = Array.isArray(cart.lines)
    ? cart.lines.map((line) => toOrderLine(line, catalog)).filter((line): line is MerchantOrderLine => line !== null)
    : [];

  return {
    paymentRecordId: record.payment_record_id,
    internalOrderId: record.internal_order_id,
    razorpayOrderId: record.razorpay_order_id,
    razorpayPaymentId: record.razorpay_payment_id,
    amountPaise: record.amount_paise,
    currency: record.currency,
    mode: record.mode,
    paymentState: record.state,
    paymentStatus,
    paymentStatusLabel: paymentStatusLabel(paymentStatus, record.failure_code),
    fulfilmentStatus: record.fulfilment_authorized ? "ready_to_pack" : "blocked",
    fulfilmentStatusLabel: record.fulfilment_authorized ? "Ready to pack" : "Fulfilment blocked",
    callbackVerified: record.callback_verified,
    captureConfirmed: record.capture_confirmed,
    customer: toCustomer(cart.customer),
    lines,
    grossPaise: safeMoney(cart.grossPaise, sumLineMoney(lines, "unit")),
    savingPaise: safeMoney(cart.savingPaise, sumLineMoney(lines, "discount")),
    offerType: readString(offer.candidateType),
    acceptedEngineOffer: typeof offer.acceptedEngineOffer === "boolean" ? offer.acceptedEngineOffer : null,
    failureCode: record.failure_code,
    customerConfirmedAt: record.customer_confirmed_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    auditEvents: auditEvents
      .filter((event) => event.trace_id === record.payment_record_id)
      .map(toAuditEvent)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}

function toOrderLine(value: unknown, catalog?: CatalogSnapshot): MerchantOrderLine | null {
  const line = asObject(value);
  const variantId = readString(line.variantId);
  const productId = readString(line.productId);
  const quantity = safePositiveInteger(line.quantity);
  if (!variantId || !productId || !quantity) return null;

  const product = catalog?.products.get(productId);
  const variant = catalog?.variants.get(variantId);
  return {
    variantId,
    productId,
    productName: readString(line.productName) ?? product?.productName ?? productId,
    productType: readString(line.productType) ?? product?.productType ?? "Skincare",
    size: readString(line.size) ?? variant?.size ?? "Size unavailable",
    quantity,
    unitPricePaise: safeMoney(line.unitPricePaise, variant?.pricePaise ?? 0),
    discountPaise: safeMoney(line.lineDiscountPaise, 0),
    lineTotalPaise: safeMoney(line.lineFinalPaise, (variant?.pricePaise ?? 0) * quantity),
  };
}

function toCustomer(value: unknown): MerchantOrderCustomer | null {
  const customer = asObject(value);
  const name = readString(customer.name);
  const email = readString(customer.email);
  const phone = readString(customer.phone);
  const deliveryAddress = readString(customer.deliveryAddress);
  if (!name || !email || !phone || !deliveryAddress) return null;
  return { name, email, phone, deliveryAddress };
}

function toAuditEvent(event: StoredAuditEvent): MerchantOrderAuditEvent {
  return {
    id: event.audit_event_id,
    eventType: event.event_type,
    outcome: event.outcome,
    reasonCode: event.reason_code,
    createdAt: event.created_at,
  };
}

function paymentStatusFor(state: string, captureConfirmed: boolean): MerchantPaymentStatus {
  if (captureConfirmed || state === "payment_captured") return "paid";
  if (["callback_verified", "payment_authorized"].includes(state)) return "verifying";
  if (["payment_failed", "signature_verification_failed", "order_creation_unknown"].includes(state)) return "failed";
  if (state === "cancelled") return "cancelled";
  return "awaiting_payment";
}

function paymentStatusLabel(status: MerchantPaymentStatus, failureCode: string | null): string {
  switch (status) {
    case "paid":
      return "Paid and captured";
    case "verifying":
      return "Verification pending";
    case "failed":
      return failureCode === "PAYMENT_TIMEOUT_1H" ? "Payment timed out" : "Payment failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Awaiting payment";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function safeMoney(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}

function sumLineMoney(lines: MerchantOrderLine[], field: "unit" | "discount"): number {
  return lines.reduce(
    (total, line) =>
      total + (field === "unit" ? line.unitPricePaise * line.quantity : line.discountPaise),
    0,
  );
}
