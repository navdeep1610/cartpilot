import "server-only";

import { redirect } from "next/navigation";
import { merchantEmailMatches, safeMerchantDestination } from "@/server/auth/merchant-auth-utils";
import {
  createSupabaseAuthServerClient,
  MerchantAuthConfigurationError,
} from "@/server/auth/supabase-server";

export interface MerchantIdentity {
  id: string;
  email: string;
}

export type MerchantAuthState =
  | { status: "authorized"; merchant: MerchantIdentity }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "unconfigured" }
  | { status: "unavailable" };

export async function getMerchantAuthState(): Promise<MerchantAuthState> {
  const configuredEmail = process.env.MERCHANT_EMAIL?.trim();
  if (!configuredEmail) return { status: "unconfigured" };

  try {
    const supabase = await createSupabaseAuthServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return { status: "unauthenticated" };

    const claims = data.claims as unknown as Record<string, unknown>;
    const id = typeof claims.sub === "string" ? claims.sub : "";
    const email = typeof claims.email === "string" ? claims.email : "";
    if (!id || !email) return { status: "unauthenticated" };
    if (!merchantEmailMatches(email, configuredEmail)) return { status: "forbidden" };

    return { status: "authorized", merchant: { id, email } };
  } catch (error) {
    if (error instanceof MerchantAuthConfigurationError) return { status: "unconfigured" };
    return { status: "unavailable" };
  }
}

export async function requireMerchantPage(destination: string): Promise<MerchantIdentity> {
  const state = await getMerchantAuthState();
  if (state.status === "authorized") return state.merchant;

  const next = encodeURIComponent(safeMerchantDestination(destination));
  const reason =
    state.status === "forbidden"
      ? "forbidden"
      : state.status === "unconfigured"
        ? "setup"
        : state.status === "unavailable"
          ? "unavailable"
          : null;
  redirect(`/merchant/login?next=${next}${reason ? `&error=${reason}` : ""}`);
}

export async function guardMerchantApi(): Promise<Response | null> {
  const state = await getMerchantAuthState();
  if (state.status === "authorized") return null;

  if (state.status === "unauthenticated") {
    return authError("MERCHANT_LOGIN_REQUIRED", "Sign in as the merchant to access this data.", 401);
  }
  if (state.status === "forbidden") {
    return authError("MERCHANT_ACCESS_DENIED", "This account is not allowed to access the merchant portal.", 403);
  }
  if (state.status === "unconfigured") {
    return authError("MERCHANT_AUTH_SETUP_REQUIRED", "Merchant authentication is not fully configured.", 503);
  }
  return authError("MERCHANT_AUTH_UNAVAILABLE", "Merchant authentication is temporarily unavailable.", 503);
}

function authError(error: string, message: string, status: number): Response {
  return Response.json(
    { error, message },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
