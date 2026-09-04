import {
  findPaymentRecord,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";

type RpcRecordResult = StoredPaymentRecord | StoredPaymentRecord[] | null;

export async function claimPaymentOrder(input: {
  recordId: string;
  sessionId: string;
  idempotencyKey: string;
}): Promise<{ status: "claimed" | "in_progress" | "existing"; record: StoredPaymentRecord }> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_payment_order", {
    p_record_id: input.recordId,
    p_session_id: input.sessionId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Order claim result was unavailable");
  return data as unknown as { status: "claimed" | "in_progress" | "existing"; record: StoredPaymentRecord };
}

export async function completePaymentOrder(input: {
  recordId: string;
  sessionId: string;
  idempotencyKey: string;
  razorpayOrderId: string;
  orderStatus: string;
  receipt: string;
}): Promise<StoredPaymentRecord> {
  return paymentRecordRpc("complete_payment_order", {
    p_record_id: input.recordId,
    p_session_id: input.sessionId,
    p_idempotency_key: input.idempotencyKey,
    p_razorpay_order_id: input.razorpayOrderId,
    p_order_status: input.orderStatus,
    p_receipt: input.receipt,
  });
}

export async function markPaymentOrderUnknown(input: {
  recordId: string;
  sessionId: string;
  idempotencyKey: string;
  reasonCode: string;
}): Promise<StoredPaymentRecord> {
  return paymentRecordRpc("mark_payment_order_unknown", {
    p_record_id: input.recordId,
    p_session_id: input.sessionId,
    p_idempotency_key: input.idempotencyKey,
    p_reason_code: input.reasonCode,
  });
}

export async function applyPaymentCallback(input: {
  recordId: string;
  sessionId: string;
  paymentId: string;
  signatureValid: boolean;
  reasonCode: string;
  idempotencyKey: string;
}): Promise<StoredPaymentRecord> {
  return paymentRecordRpc("apply_payment_callback", {
    p_record_id: input.recordId,
    p_session_id: input.sessionId,
    p_payment_id: input.paymentId,
    p_signature_valid: input.signatureValid,
    p_reason_code: input.reasonCode,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function applyPaymentReconciliation(input: {
  record: StoredPaymentRecord;
  nextState: string;
  reasonCode: string;
  update: Record<string, unknown>;
  outcome: "success" | "failure";
}): Promise<StoredPaymentRecord> {
  return paymentRecordRpc("apply_payment_reconciliation", {
    p_record_id: input.record.payment_record_id,
    p_expected_version: input.record.state_version,
    p_next_state: input.nextState,
    p_reason_code: input.reasonCode,
    p_update: input.update,
    p_outcome: input.outcome,
  });
}

export async function applyPaymentTimeout(input: {
  record: StoredPaymentRecord;
  cutoff: string;
  reasonCode: string;
}): Promise<StoredPaymentRecord> {
  return paymentRecordRpc("apply_payment_timeout", {
    p_record_id: input.record.payment_record_id,
    p_expected_state: input.record.state,
    p_cutoff: input.cutoff,
    p_reason_code: input.reasonCode,
  });
}

export interface AtomicWebhookResult {
  duplicate: boolean;
  applied: boolean;
  reconciled?: boolean;
  reasonCode?: string;
  paymentRecordId?: string;
  state?: string;
  fulfilmentAuthorized?: boolean;
}

export async function applyRazorpayWebhook(input: Record<string, unknown>): Promise<AtomicWebhookResult> {
  const { data, error } = await getSupabaseAdmin().rpc("apply_razorpay_webhook", input);
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Atomic webhook result was unavailable");
  return data as unknown as AtomicWebhookResult;
}

export async function recoverRecordAfterVersionConflict(paymentRecordId: string): Promise<StoredPaymentRecord> {
  const record = await findPaymentRecord(paymentRecordId);
  if (!record) throw new Error("Payment record disappeared during an atomic transition");
  return record;
}

async function paymentRecordRpc(name: string, params: Record<string, unknown>): Promise<StoredPaymentRecord> {
  const { data, error } = await getSupabaseAdmin().rpc(name, params);
  if (error) throw error;
  const value = (Array.isArray(data) ? data[0] : data) as RpcRecordResult;
  if (!value || Array.isArray(value)) throw new Error(`${name} did not return a payment record`);
  return value;
}
