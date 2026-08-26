import type { NextRequest } from "next/server";
import { updateSupabaseAuthSession } from "@/server/auth/supabase-proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseAuthSession(request);
}

export const config = {
  matcher: ["/merchant/:path*", "/api/v1/merchant/:path*"],
};
