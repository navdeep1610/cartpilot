import {
  appendAuditEvent,
  findPaymentRecord,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";

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

  const { data, error } = await getSupabaseAdmin()
    .from("payment_records")
    .update({
      state: "payment_failed",
      failure_code: PAYMENT_TIMEOUT_REASON,
      fulfilment_authorized: false,
      updated_at: now.toISOString(),
    })
    .eq("payment_record_id", record.payment_record_id)
    .eq("state", record.state)
    .is("razorpay_payment_id", null)
    .eq("callback_verified", false)
    .eq("capture_confirmed", false)
    .eq("fulfilment_authorized", false)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return (await findPaymentRecord(record.payment_record_id)) ?? record;

  const updated = data as StoredPaymentRecord;
  const { error: transitionError } = await getSupabaseAdmin().from("payment_transitions").insert({
    payment_record_id: record.payment_record_id,
    from_state: record.state,
    to_state: "payment_failed",
    trigger: "payment_timeout",
    source: "cartpilot_server",
    applied: true,
    reason_code: PAYMENT_TIMEOUT_REASON,
  });
  if (transitionError) throw transitionError;
  await appendAuditEvent({
    traceId: record.payment_record_id,
    eventType: "payment.timeout_applied",
    actorType: "system",
    outcome: "failure",
    reasonCode: PAYMENT_TIMEOUT_REASON,
    resourceId: record.payment_record_id,
    evidence: {
      timeoutMinutes: PAYMENT_TIMEOUT_MS / 60_000,
      paymentIdPresent: false,
      callbackVerified: false,
      fulfilmentAuthorized: false,
    },
  });
  return updated;
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
