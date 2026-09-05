import type { CustomerOrdersResponse } from "@/domain/orders/customer-order";
import { DatabaseConfigurationError, getSupabaseAdmin } from "@/server/database/supabase-admin";
import {
  toCustomerOrder,
  type StoredCustomerOrderRecord,
} from "@/server/orders/customer-order-mapper";
import { getCustomerProfileId } from "@/server/session/customer-profile-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const customerProfileId = getCustomerProfileId(request);
  if (!customerProfileId) {
    return Response.json(emptyResponse(), { headers: noStoreHeaders() });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_records")
      .select("internal_order_id,amount_paise,currency,mode,state,capture_confirmed,fulfilment_authorized,confirmed_cart,created_at")
      .eq("capture_confirmed", true)
      .eq("fulfilment_authorized", true)
      .contains("confirmed_cart", { customer: { customerProfileId } })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const response: CustomerOrdersResponse = {
      orders: ((data ?? []) as StoredCustomerOrderRecord[]).map(toCustomerOrder),
      generatedAt: new Date().toISOString(),
      storage: "supabase",
      testMode: true,
    };
    return Response.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return safeError("SUPABASE_SETUP_REQUIRED", "Secure order history is not connected yet.");
    }
    return safeError("CUSTOMER_ORDERS_UNAVAILABLE", "Your orders could not be loaded just now.");
  }
}

function emptyResponse(): CustomerOrdersResponse {
  return {
    orders: [],
    generatedAt: new Date().toISOString(),
    storage: "supabase",
    testMode: true,
  };
}

function safeError(error: string, message: string) {
  return Response.json({ error, message }, { status: 503, headers: noStoreHeaders() });
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
