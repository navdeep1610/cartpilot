import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export class MerchantAuthConfigurationError extends Error {
  constructor() {
    super("Supabase Auth configuration is unavailable");
    this.name = "MerchantAuthConfigurationError";
  }
}

export async function createSupabaseAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) throw new MerchantAuthConfigurationError();

  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The Next.js Proxy refreshes
          // the session before protected pages and APIs are evaluated.
        }
      },
    },
    global: { headers: { "X-Client-Info": "cartpilot-merchant-auth" } },
  });
}
