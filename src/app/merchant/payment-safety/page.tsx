import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Payment safety · CartPilot",
  description: "Payment verification and fulfilment safeguards for the CartPilot merchant demo.",
};

export default function MerchantPaymentSafetyPage() {
  return (
    <main className="merchant-shell">
      <aside className="merchant-nav">
        <div className="brand brand-light">Cart<span>Pilot</span></div>
        <p>Merchant payment controls</p>
        <nav aria-label="Merchant dashboard sections">
          <Link href="/merchant#orders">Orders</Link>
          <Link href="/merchant/customers">Registered customers</Link>
          <Link className="active" href="/merchant/payment-safety" aria-current="page">Payment safety</Link>
        </nav>
        <div className="merchant-nav-footer">
          <span>Demo environment</span>
          <Link href="/"><ArrowLeft size={16} /> Customer store</Link>
        </div>
      </aside>

      <div className="merchant-content">
        <header className="merchant-header">
          <div>
            <p className="eyebrow">Merchant controls · Payment safety</p>
            <h1>Payment protection and fulfilment gates.</h1>
            <p>Review the safeguards that protect every CartPilot order from cart confirmation through Razorpay Test Mode verification and fulfilment.</p>
          </div>
          <div className="system-status"><span /><div><strong>Safeguards active</strong><small>Test transactions only</small></div></div>
        </header>

        <section className="audit-section payment-safety-section" aria-labelledby="payment-safety-title">
          <div className="dashboard-heading">
            <div><p className="eyebrow">Payment safety</p><h2 id="payment-safety-title">Every order remains gated.</h2></div>
            <p>These are system rules, not example product calculations.</p>
          </div>
          <div className="audit-grid">
            <SafeguardItem icon={<Database />} title="Order record" value="Stored in Supabase" detail="Cart, customer, total and safe Razorpay references are retained." />
            <SafeguardItem icon={<CheckCircle2 />} title="Customer approval" value="Exact total confirmed" detail="No Razorpay order is created until the shopper accepts the cart and total." />
            <SafeguardItem icon={<ShieldCheck />} title="Payment evidence" value="Signature verified" detail="Browser callbacks and signed webhooks are checked before payment status changes." />
            <SafeguardItem icon={<PackageCheck />} title="Fulfilment" value="Blocked by default" detail="Packing is allowed only after server-side capture evidence is reconciled." />
          </div>
        </section>
      </div>
    </main>
  );
}

function SafeguardItem({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return <article><span>{icon}</span><small>{title}</small><strong>{value}</strong><p>{detail}</p></article>;
}
