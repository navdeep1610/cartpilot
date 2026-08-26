import type { Metadata } from "next";
import { MerchantCustomers } from "@/components/merchant/merchant-customers";
import { MerchantSidebar } from "@/components/merchant/merchant-sidebar";
import { requireMerchantPage } from "@/server/auth/merchant-authorization";

export const metadata: Metadata = {
  title: "Registered customers · CartPilot",
  description: "Supabase-backed customer profiles for the CartPilot merchant demo.",
};

export const dynamic = "force-dynamic";

export default async function MerchantCustomersPage() {
  const merchant = await requireMerchantPage("/merchant/customers");

  return (
    <main className="merchant-shell">
      <MerchantSidebar active="customers" label="Merchant customer center" merchantEmail={merchant.email} />

      <div className="merchant-content">
        <header className="merchant-header">
          <div>
            <p className="eyebrow">Merchant customers · Supabase profiles</p>
            <h1>Customers who chose to register.</h1>
            <p>Review every shopper who saved a storefront Profile, including their contact details, delivery address and safe order summary.</p>
          </div>
          <div className="system-status"><span /><div><strong>Customer storage ready</strong><small>Contact and delivery data only</small></div></div>
        </header>

        <MerchantCustomers />
      </div>
    </main>
  );
}
