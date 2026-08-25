import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MerchantCustomers } from "@/components/merchant/merchant-customers";

export const metadata: Metadata = {
  title: "Registered customers · CartPilot",
  description: "Supabase-backed customer profiles for the CartPilot merchant demo.",
};

export default function MerchantCustomersPage() {
  return (
    <main className="merchant-shell">
      <aside className="merchant-nav">
        <div className="brand brand-light">Cart<span>Pilot</span></div>
        <p>Merchant customer center</p>
        <nav aria-label="Merchant dashboard sections">
          <Link href="/merchant#orders">Orders</Link>
          <Link className="active" href="/merchant/customers" aria-current="page">Registered customers</Link>
          <Link href="/merchant/payment-safety">Payment safety</Link>
        </nav>
        <div className="merchant-nav-footer">
          <span>Demo environment</span>
          <Link href="/"><ArrowLeft size={16} /> Customer store</Link>
        </div>
      </aside>

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
