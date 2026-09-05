import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { logoutMerchant } from "@/app/merchant/login/actions";

type MerchantSection = "orders" | "customers" | "growth" | "payment-safety";

export function MerchantSidebar({
  active,
  label,
  merchantEmail,
}: {
  active: MerchantSection;
  label: string;
  merchantEmail: string;
}) {
  return (
    <aside className="merchant-nav">
      <div className="brand brand-light">Cart<span>Pilot</span></div>
      <p>{label}</p>
      <nav aria-label="Merchant dashboard sections">
        <Link className={active === "orders" ? "active" : undefined} href="/merchant#orders">Orders</Link>
        <Link className={active === "customers" ? "active" : undefined} href="/merchant/customers">Registered customers</Link>
        <Link className={active === "growth" ? "active" : undefined} href="/merchant/growth">Growth evidence</Link>
        <Link className={active === "payment-safety" ? "active" : undefined} href="/merchant/payment-safety">Payment safety</Link>
      </nav>
      <div className="merchant-nav-footer">
        <div className="merchant-account">
          <ShieldCheck size={16} aria-hidden="true" />
          <div><span>Signed in securely</span><small>{merchantEmail}</small></div>
        </div>
        <form action={logoutMerchant}>
          <button type="submit"><LogOut size={16} aria-hidden="true" /> Sign out</button>
        </form>
        <Link href="/"><ArrowLeft size={16} /> Customer store</Link>
      </div>
    </aside>
  );
}
