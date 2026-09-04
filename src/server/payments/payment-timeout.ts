import { getSupabaseAdmin, type StoredPaymentRecord } from "@/server/database/supabase-admin";
import { applyPaymentTimeout } from "@/server/payments/atomic-payment-store";

export const PAYMENT_TIMEOUT_MS = 60 * 60 * 1_000;
export const PAYMENT_TIMEOUT_REASON = "PAYMENT_TIMEOUT_1H";

const timeoutEligibleStates = [
  "customer_confirmed",
  "order_creation_pending",
  "order_created",
  "checkout_opened",
] as const;

export function isPaymentTimedOut(record: StoredPaymentRecord, nowMs = Date.now()): boolean {
  const createdAtMs = Date.parse(record.created_at);
  return (
    Number.isFinite(createdAtMs) &&
    nowMs - createdAtMs >= PAYMENT_TIMEOUT_MS &&
    timeoutEligibleStates.includes(record.state as (typeof timeoutEligibleStates)[number]) &&
    !record.razorpay_payment_id &&
    !record.callback_verified &&
    !record.capture_confirmed &&
    !record.fulfilment_authorized
  );
}

export async function markPaymentTimedOut(
  record: StoredPaymentRecord,
  now = new Date(),
): Promise<StoredPaymentRecord> {
  if (!isPaymentTimedOut(record, now.getTime())) return record;

  return applyPaymentTimeout({
    record,
    cutoff: new Date(now.getTime() - PAYMENT_TIMEOUT_MS).toISOString(),
    reasonCode: PAYMENT_TIMEOUT_REASON,
  });
}

export async function expireStaleUnpaidPaymentRecords(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_TIMEOUT_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("payment_records")
    .select("*")
    .lte("created_at", cutoff)
    .in("state", [...timeoutEligibleStates])
    .is("razorpay_payment_id", null)
    .eq("callback_verified", false)
    .eq("capture_confirmed", false)
    .eq("fulfilment_authorized", false)
    .limit(100);
  if (error) throw error;

  let expiredCount = 0;
  for (const candidate of (data ?? []) as StoredPaymentRecord[]) {
    const updated = await markPaymentTimedOut(candidate, now);
    if (updated.failure_code === PAYMENT_TIMEOUT_REASON) expiredCount += 1;
  }
  return expiredCount;
}
