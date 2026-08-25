import type { MerchantCustomer, MerchantCustomersResponse } from "@/domain/customers/merchant-customer";
import {
  DatabaseConfigurationError,
  getSupabaseAdmin,
} from "@/server/database/supabase-admin";
import type { StoredCustomerProfile } from "@/server/customers/customer-profile-repository";

export const runtime = "nodejs";

interface CustomerOrderRecord {
  confirmed_cart: unknown;
  amount_paise: number;
  state: string;
  capture_confirmed: boolean;
  created_at: string;
}

interface CustomerOrderSummary {
  orderCount: number;
  capturedOrderCount: number;
  capturedRevenuePaise: number;
  lastOrderAt: string | null;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      {
        error: "MERCHANT_AUTH_REQUIRED",
        message: "Customer data stays disabled online until merchant authentication is configured.",
      },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: profileData, error: profileError } = await admin
      .from("customer_profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (profileError) throw profileError;

    const { data: orderData, error: orderError } = await admin
      .from("payment_records")
      .select("confirmed_cart,amount_paise,state,capture_confirmed,created_at")
      .order("created_at", { ascending: false })
      .limit(1_000);
    if (orderError) throw orderError;

    const profiles = (profileData ?? []) as StoredCustomerProfile[];
    const summaries = summarizeOrders(profiles, (orderData ?? []) as CustomerOrderRecord[]);
    const customers: MerchantCustomer[] = profiles.map((profile) => {
      const summary = summaries.get(profile.customer_profile_id) ?? emptySummary();
      return {
        customerProfileId: profile.customer_profile_id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        deliveryAddress: profile.delivery_address,
        registeredAt: profile.created_at,
        updatedAt: profile.updated_at,
        ...summary,
      };
    });
    const response: MerchantCustomersResponse = {
      customers,
      generatedAt: new Date().toISOString(),
      storage: "supabase",
      testMode: true,
    };
    return Response.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "SUPABASE_SETUP_REQUIRED", message: "Supabase customer storage is not connected." },
        { status: 503, headers: noStoreHeaders() },
      );
    }
    return Response.json(
      { error: "CUSTOMER_LIST_UNAVAILABLE", message: "Registered customers could not be loaded from Supabase." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

function summarizeOrders(
  profiles: StoredCustomerProfile[],
  orders: CustomerOrderRecord[],
): Map<string, CustomerOrderSummary> {
  const byProfileId = new Map(profiles.map((profile) => [profile.customer_profile_id, profile]));
  const byEmail = new Map<string, StoredCustomerProfile>();
  for (const profile of profiles) {
    if (!byEmail.has(profile.normalized_email)) byEmail.set(profile.normalized_email, profile);
  }

  const summaries = new Map<string, CustomerOrderSummary>();
  for (const order of orders) {
    const snapshot = orderCustomer(order.confirmed_cart);
    if (!snapshot) continue;
    const profile =
      (snapshot.customerProfileId ? byProfileId.get(snapshot.customerProfileId) : null) ??
      byEmail.get(snapshot.email.toLowerCase());
    if (!profile) continue;

    const current = summaries.get(profile.customer_profile_id) ?? emptySummary();
    current.orderCount += 1;
    if (order.state === "payment_captured" && order.capture_confirmed) {
      current.capturedOrderCount += 1;
      current.capturedRevenuePaise += order.amount_paise;
    }
    if (!current.lastOrderAt || Date.parse(order.created_at) > Date.parse(current.lastOrderAt)) {
      current.lastOrderAt = order.created_at;
    }
    summaries.set(profile.customer_profile_id, current);
  }
  return summaries;
}

function orderCustomer(value: unknown): { customerProfileId: string | null; email: string } | null {
  if (!value || typeof value !== "object") return null;
  const customer = (value as Record<string, unknown>).customer;
  if (!customer || typeof customer !== "object") return null;
  const record = customer as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!email) return null;
  return {
    customerProfileId: typeof record.customerProfileId === "string" ? record.customerProfileId : null,
    email,
  };
}

function emptySummary(): CustomerOrderSummary {
  return { orderCount: 0, capturedOrderCount: 0, capturedRevenuePaise: 0, lastOrderAt: null };
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
