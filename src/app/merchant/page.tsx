import type { Metadata } from "next";
import { MerchantOrders } from "@/components/merchant/merchant-orders";
import { MerchantSidebar } from "@/components/merchant/merchant-sidebar";
import { requireMerchantPage } from "@/server/auth/merchant-authorization";

export const metadata: Metadata = {
  title: "Merchant order center",
  description: "Supabase-backed customer orders and Razorpay Test Mode payment evidence.",
};

export const dynamic = "force-dynamic";

export default async function MerchantPage() {
  const merchant = await requireMerchantPage("/merchant");

  return (
    <main className="merchant-shell">
      <MerchantSidebar active="orders" label="Merchant order center" merchantEmail={merchant.email} />

      <div className="merchant-content">
        <header className="merchant-header" id="overview">
          <div>
            <p className="eyebrow">Merchant operations · Supabase + Razorpay Test Mode</p>
            <h1>Orders and payment evidence.</h1>
            <p>Review real test orders created by shoppers. Revenue, customer details, purchased products and payment states below come from stored order records—not a sample cart.</p>
          </div>
          <div className="system-status"><span /><div><strong>Order storage ready</strong><small>Supabase connected · test transactions only</small></div></div>
        </header>

        <MerchantOrders />
      </div>
    </main>
  );
}
