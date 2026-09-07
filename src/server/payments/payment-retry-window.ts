import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import { PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";

export const PAYMENT_RETRY_WINDOW_MS = 5 * 60 * 1_000;

export function retryWindowEndsAt(record: StoredPaymentRecord): number | null {
  if (record.state !== "payment_failed" || record.failure_code === PAYMENT_TIMEOUT_REASON) return null;
  const failedAt = Date.parse(record.updated_at);
  return Number.isFinite(failedAt) ? failedAt + PAYMENT_RETRY_WINDOW_MS : null;
}

export function isPaymentRetryAllowed(record: StoredPaymentRecord, nowMs = Date.now()): boolean {
  const endsAt = retryWindowEndsAt(record);
  return endsAt !== null
    && nowMs < endsAt
    && !record.capture_confirmed
    && !record.fulfilment_authorized;
}

export function requiresFreshPaymentRecord(record: StoredPaymentRecord, nowMs = Date.now()): boolean {
  if (record.failure_code === PAYMENT_TIMEOUT_REASON) return true;
  const endsAt = retryWindowEndsAt(record);
  return endsAt !== null && nowMs >= endsAt;
}
