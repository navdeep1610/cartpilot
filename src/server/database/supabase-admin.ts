import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("Supabase server configuration is unavailable");
    this.name = "DatabaseConfigurationError";
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new DatabaseConfigurationError();

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "cartpilot-server" } },
  });
  return cachedClient;
}

export interface StoredPaymentRecord {
  payment_record_id: string;
  trace_id: string;
  internal_order_id: string;
  decision_id: string;
  session_id: string;
  cart_hash: string;
  confirmed_cart: unknown;
  amount_paise: number;
  currency: "INR";
  mode: "test";
  state: string;
  razorpay_order_id: string | null;
  razorpay_order_status: string | null;
  razorpay_payment_id: string | null;
  order_receipt: string | null;
  callback_verified: boolean;
  capture_confirmed: boolean;
  capture_confirmation_source: string | null;
  fulfilment_authorized: boolean;
  failure_code: string | null;
  order_creation_claimed_at: string | null;
  confirmation_idempotency_key: string;
  order_creation_idempotency_key: string | null;
  callback_idempotency_key: string | null;
  state_version: number;
  manual_review_required: boolean;
  last_retry_idempotency_key: string | null;
  payment_retry_count: number;
  customer_confirmed_at: string;
  created_at: string;
  updated_at: string;
}

export async function findPaymentRecord(paymentRecordId: string, sessionId?: string): Promise<StoredPaymentRecord | null> {
  let query = getSupabaseAdmin().from("payment_records").select("*").eq("payment_record_id", paymentRecordId);
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as StoredPaymentRecord | null;
}
