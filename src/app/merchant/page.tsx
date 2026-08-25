import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MerchantOrders } from "@/components/merchant/merchant-orders";

export const metadata: Metadata = {
  title: "Merchant order center",
  description: "Supabase-backed customer orders and Razorpay Test Mode payment evidence.",
};

export default function MerchantPage() {
  return (
    <main className="merchant-shell">
      <aside className="merchant-nav">
        <div className="brand brand-light">Cart<span>Pilot</span></div>
        <p>Merchant order center</p>
        <nav aria-label="Merchant dashboard sections">
          <a className="active" href="#orders">Orders</a>
          <Link href="/merchant/customers">Registered customers</Link>
          <Link href="/merchant/payment-safety">Payment safety</Link>
        </nav>
        <div className="merchant-nav-footer">
          <span>Demo environment</span>
          <Link href="/"><ArrowLeft size={16} /> Customer store</Link>
        </div>
      </aside>

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
