import type { CustomerProfileData, SavedCustomerProfile } from "@/domain/customers/customer-profile";
import { getSupabaseAdmin } from "@/server/database/supabase-admin";

export interface StoredCustomerProfile {
  customer_profile_id: string;
  name: string;
  email: string;
  normalized_email: string;
  phone: string;
  normalized_phone: string;
  delivery_address: string;
  profile_source: string;
  created_at: string;
  updated_at: string;
}

export async function findCustomerProfile(customerProfileId: string): Promise<StoredCustomerProfile | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_profiles")
    .select("*")
    .eq("customer_profile_id", customerProfileId)
    .maybeSingle();
  if (error) throw error;
  return data as StoredCustomerProfile | null;
}

export async function saveCustomerProfile(
  customerProfileId: string,
  profile: CustomerProfileData,
): Promise<StoredCustomerProfile> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("customer_profiles")
    .upsert(
      {
        customer_profile_id: customerProfileId,
        name: profile.name,
        email: profile.email,
        normalized_email: profile.email.toLowerCase(),
        phone: profile.phone,
        normalized_phone: profile.phone.replace(/\D/g, ""),
        delivery_address: profile.deliveryAddress,
        profile_source: "storefront_profile",
        updated_at: now,
      },
      { onConflict: "customer_profile_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as StoredCustomerProfile;
}

export function toSavedCustomerProfile(profile: StoredCustomerProfile): SavedCustomerProfile {
  return {
    customerProfileId: profile.customer_profile_id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    deliveryAddress: profile.delivery_address,
  };
}
