import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { MerchantLoginForm } from "@/components/merchant/merchant-login-form";
import { getMerchantAuthState } from "@/server/auth/merchant-authorization";
import { safeMerchantDestination } from "@/server/auth/merchant-auth-utils";

export const metadata: Metadata = {
  title: "Merchant sign in · CartPilot",
  description: "Secure access to CartPilot orders, customers and payment evidence.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface MerchantLoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MerchantLoginPage({ searchParams }: MerchantLoginPageProps) {
  const params = await searchParams;
  const destination = safeMerchantDestination(firstValue(params.next));
  const authState = await getMerchantAuthState();
  if (authState.status === "authorized") redirect(destination);

  const setupRequired = authState.status === "unconfigured" || firstValue(params.error) === "setup";
  const serviceUnavailable = authState.status === "unavailable" || firstValue(params.error) === "unavailable";
  const accessDenied = authState.status === "forbidden" || firstValue(params.error) === "forbidden";
  const loggedOut = firstValue(params.loggedOut) === "1";

  return (
    <main className="merchant-login-shell">
      <section className="merchant-login-card" aria-labelledby="merchant-login-title">
        <div className="merchant-login-brand">
          <div className="brand">Cart<span>Pilot</span></div>
          <span><ShieldCheck size={16} /> Protected merchant access</span>
        </div>
        <div className="merchant-login-copy">
          <p className="eyebrow">Merchant portal · Supabase Auth</p>
          <h1 id="merchant-login-title">Your customer data stays private.</h1>
          <p>Sign in with the merchant account to review orders, customer profiles and verified Razorpay Test Mode payment evidence.</p>
        </div>

        {loggedOut && <p className="merchant-login-notice success">You have been signed out securely.</p>}
        {accessDenied && <p className="merchant-login-notice error">That Supabase account is not authorized as the CartPilot merchant.</p>}
        {serviceUnavailable && <p className="merchant-login-notice error">Supabase Auth is temporarily unavailable. Please try again shortly.</p>}
        {setupRequired && (
          <p className="merchant-login-notice setup">
            <Database size={18} aria-hidden="true" /> Add <code>MERCHANT_EMAIL</code> to the local and Vercel environment settings before signing in.
          </p>
        )}

        <MerchantLoginForm destination={destination} disabled={setupRequired || serviceUnavailable} />

        <div className="merchant-login-footer">
          <Link href="/"><ArrowLeft size={16} /> Return to customer store</Link>
          <span>Customer payment credentials are never stored.</span>
        </div>
      </section>
    </main>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
