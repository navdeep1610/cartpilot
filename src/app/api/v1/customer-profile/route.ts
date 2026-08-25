import { normalizeCustomerProfile } from "@/domain/customers/customer-profile";
import { DatabaseConfigurationError } from "@/server/database/supabase-admin";
import {
  findCustomerProfile,
  saveCustomerProfile,
  toSavedCustomerProfile,
} from "@/server/customers/customer-profile-repository";
import {
  createCustomerProfileId,
  customerProfileCookie,
  getCustomerProfileId,
} from "@/server/session/customer-profile-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const customerProfileId = getCustomerProfileId(request);
  if (!customerProfileId) return Response.json({ profile: null }, { headers: noStoreHeaders() });

  try {
    const stored = await findCustomerProfile(customerProfileId);
    return Response.json(
      { profile: stored ? toSavedCustomerProfile(stored) : null },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return safeError("SUPABASE_SETUP_REQUIRED", "Secure customer storage is not connected.", 503);
    }
    return safeError("PROFILE_UNAVAILABLE", "Your saved profile is temporarily unavailable.", 503);
  }
}

export async function PUT(request: Request) {
  try {
    const profile = normalizeCustomerProfile(await request.json());
    if (!profile) {
      return safeError(
        "INVALID_PROFILE",
        "Enter a valid name, email, phone number and complete delivery address.",
        400,
      );
    }

    const customerProfileId = getCustomerProfileId(request) ?? createCustomerProfileId();
    const stored = await saveCustomerProfile(customerProfileId, profile);
    return Response.json(
      { profile: toSavedCustomerProfile(stored), message: "Profile saved securely in Supabase." },
      {
        headers: {
          ...noStoreHeaders(),
          "Set-Cookie": customerProfileCookie(stored.customer_profile_id),
        },
      },
    );
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return safeError("SUPABASE_SETUP_REQUIRED", "Secure customer storage is not connected.", 503);
    }
    return safeError("PROFILE_SAVE_FAILED", "Your profile could not be saved securely just now.", 503);
  }
}

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function safeError(error: string, message: string, status: number) {
  return Response.json({ error, message }, { status, headers: noStoreHeaders() });
}
