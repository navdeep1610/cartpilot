"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { merchantEmailMatches, safeMerchantDestination } from "@/server/auth/merchant-auth-utils";
import {
  createSupabaseAuthServerClient,
  MerchantAuthConfigurationError,
} from "@/server/auth/supabase-server";

export interface MerchantLoginState {
  error: string | null;
}

export async function loginMerchant(
  _previousState: MerchantLoginState,
  formData: FormData,
): Promise<MerchantLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const destination = safeMerchantDestination(String(formData.get("next") ?? ""));
  const configuredEmail = process.env.MERCHANT_EMAIL?.trim();

  if (!configuredEmail) {
    return { error: "Merchant login needs the MERCHANT_EMAIL environment variable before it can be used." };
  }
  if (!email || email.length > 254 || !password || password.length > 1_024) {
    return { error: "Enter your merchant email and password." };
  }
  if (!merchantEmailMatches(email, configuredEmail)) {
    return { error: "The email or password is incorrect." };
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) return { error: "The email or password is incorrect." };

    const { data, error: claimsError } = await supabase.auth.getClaims();
    const claims = data?.claims as unknown as Record<string, unknown> | undefined;
    const authenticatedEmail = typeof claims?.email === "string" ? claims.email : null;
    if (claimsError || !merchantEmailMatches(authenticatedEmail, configuredEmail)) {
      await supabase.auth.signOut();
      return { error: "This Supabase account is not authorized for the merchant portal." };
    }
  } catch (error) {
    if (error instanceof MerchantAuthConfigurationError) {
      return { error: "Supabase Auth is not configured for this deployment." };
    }
    return { error: "Merchant login is temporarily unavailable. Please try again." };
  }

  revalidatePath("/merchant", "layout");
  redirect(destination);
}

export async function logoutMerchant(): Promise<void> {
  try {
    const supabase = await createSupabaseAuthServerClient();
    await supabase.auth.signOut();
  } catch {
    // An invalid session remains blocked by every protected endpoint.
  }

  revalidatePath("/merchant", "layout");
  redirect("/merchant/login?loggedOut=1");
}
