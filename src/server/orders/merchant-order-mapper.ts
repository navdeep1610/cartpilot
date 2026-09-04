import type { CatalogSnapshot } from "@/domain/catalog/types";
import type {
  MerchantOrder,
  MerchantOrderAuditEvent,
  MerchantOrderCustomer,
  MerchantOrderLine,
  MerchantPaymentStatus,
} from "@/domain/orders/merchant-order";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import { verifyAuditChain, type StoredAuditEnvelope } from "@/server/audit/audit-chain";

export interface StoredAuditEvent {
  audit_event_id: string;
  trace_id: string;
  event_type: string;
  outcome: string;
  reason_code: string;
  created_at: string;
  sequence_number: number | null;
  schema_version: string | null;
  idempotency_key: string | null;
  previous_event_hash: string | null;
  payload_hash: string | null;
  event_hash: string | null;
  canonical_payload: string | null;
  event_payload: Record<string, unknown> | null;
}

export function toMerchantOrder(
  record: StoredPaymentRecord,
  auditEvents: StoredAuditEvent[],
  catalog?: CatalogSnapshot,
  storedDecision?: unknown,
): MerchantOrder {
  if (!record.razorpay_order_id) throw new Error("Merchant order requires a Razorpay order id");

  const cart = asObject(record.confirmed_cart);
  const offer = asObject(cart.offer);
  const paymentStatus = paymentStatusFor(record.state, record.capture_confirmed);
  const lines = Array.isArray(cart.lines)
    ? cart.lines.map((line) => toOrderLine(line, catalog)).filter((line): line is MerchantOrderLine => line !== null)
    : [];
  const recordAuditEvents = auditEvents
    .filter((event) => event.trace_id === record.trace_id)
    .sort((left, right) => (left.sequence_number ?? 0) - (right.sequence_number ?? 0));
  const verifiableEvents = recordAuditEvents.filter(isStoredAuditEnvelope);
  const verification = verifiableEvents.length > 0 ? verifyAuditChain(verifiableEvents) : null;

  return {
    paymentRecordId: record.payment_record_id,
    traceId: record.trace_id,
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
    auditEvents: recordAuditEvents.map(toAuditEvent),
    auditIntegrity: verification
      ? { status: verification.valid ? "verified" : "broken", ...verification }
      : { status: "legacy", eventCount: recordAuditEvents.length, headHash: null, issues: [] },
    decisionEvidence: toDecisionEvidence(storedDecision),
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
    sequence: event.sequence_number,
    eventType: event.event_type,
    outcome: event.outcome,
    reasonCode: event.reason_code,
    createdAt: event.created_at,
    eventHash: event.event_hash,
    previousEventHash: event.previous_event_hash,
  };
}

function isStoredAuditEnvelope(event: StoredAuditEvent): event is StoredAuditEvent & StoredAuditEnvelope {
  return event.schema_version === "1.0.0"
    && typeof event.sequence_number === "number"
    && typeof event.idempotency_key === "string"
    && typeof event.payload_hash === "string"
    && typeof event.event_hash === "string"
    && typeof event.canonical_payload === "string"
    && event.event_payload !== null;
}

function toDecisionEvidence(value: unknown) {
  const stored = asObject(value);
  const audit = asObject(stored.auditDecision);
  if (Object.keys(audit).length === 0) return null;
  const summary = asObject(audit.selection_summary);
  const merchant = asObject(audit.merchant_explanation);
  return {
    catalogVersion: readString(audit.catalog_version),
    policyVersion: readString(stored.policyVersion),
    evaluatedCandidates: safeMoney(summary.evaluated_count, 0),
    eligibleCandidates: safeMoney(summary.eligible_count, 0),
    rejectedCandidates: safeMoney(summary.rejected_count, 0),
    selectedCandidateId: readString(audit.selected_candidate_id),
    baselineCandidateId: readString(audit.baseline_candidate_id),
    selectedContributionProfitPaise: safeNullableMoney(merchant.selected_contribution_profit_paise),
    incrementalContributionProfitPaise: safeNullableMoney(merchant.incremental_contribution_profit_paise),
    rejectionReasonCodes: Array.isArray(merchant.primary_rejection_reason_codes)
      ? merchant.primary_rejection_reason_codes.filter((item): item is string => typeof item === "string")
      : [],
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

function safeNullableMoney(value: unknown): number | null {
  return Number.isSafeInteger(value) ? value as number : null;
}

function sumLineMoney(lines: MerchantOrderLine[], field: "unit" | "discount"): number {
  return lines.reduce(
    (total, line) =>
      total + (field === "unit" ? line.unitPricePaise * line.quantity : line.discountPaise),
    0,
  );
}
