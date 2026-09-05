"use client";

import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MerchantOrder,
  MerchantOrdersResponse,
  MerchantPaymentStatus,
} from "@/domain/orders/merchant-order";
import { formatInr } from "@/domain/money";

type LoadState = "loading" | "ready" | "error";
type StatusFilter = "all" | MerchantPaymentStatus;

export function MerchantOrders() {
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/v1/merchant/orders", { cache: "no-store" });
      const result = (await response.json()) as MerchantOrdersResponse | { message?: string };
      if (!response.ok || !("orders" in result)) {
        const responseMessage = "message" in result ? result.message : null;
        throw new Error(responseMessage || "Orders could not be loaded.");
      }
      setOrders(result.orders);
      setSelectedOrderId((current) =>
        current && result.orders.some((order) => order.paymentRecordId === current) ? current : null,
      );
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setErrorMessage((error as Error).message || "Orders could not be loaded from Supabase.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadOrders(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.paymentStatus !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        order.internalOrderId,
        order.razorpayOrderId,
        order.razorpayPaymentId,
        order.customer?.name,
        order.customer?.email,
        order.customer?.phone,
        ...order.lines.map((line) => line.productName),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [orders, query, statusFilter]);

  const selectedOrder = orders.find((order) => order.paymentRecordId === selectedOrderId) ?? null;
  const capturedRevenue = orders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((total, order) => total + order.amountPaise, 0);
  const verifyingCount = orders.filter((order) => order.paymentStatus === "verifying").length;
  const readyCount = orders.filter((order) => order.fulfilmentStatus === "ready_to_pack").length;

  return (
    <section className="orders-section" id="orders" aria-labelledby="orders-title">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Stored in Supabase</p><h2 id="orders-title">Customer orders</h2></div>
        <p>Payment evidence comes from Razorpay Test Mode. Card numbers, CVVs, OTPs and bank credentials are never stored here.</p>
      </div>

      <div className="order-summary-grid" aria-label="Order summary">
        <OrderSummary icon={<ShoppingBag />} label="Orders created" value={String(orders.length)} />
        <OrderSummary icon={<CreditCard />} label="Captured revenue" value={formatInr(capturedRevenue)} />
        <OrderSummary icon={<Clock3 />} label="Awaiting verification" value={String(verifyingCount)} />
        <OrderSummary icon={<Package />} label="Ready to pack" value={String(readyCount)} />
      </div>

      <div className="orders-toolbar">
        <label className="orders-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search orders</span>
          <input
            type="search"
            placeholder="Search order, customer or product"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="orders-filter">
          <span>Payment status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All orders</option>
            <option value="paid">Paid and captured</option>
            <option value="verifying">Verification pending</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button className="orders-refresh" type="button" onClick={() => void loadOrders()} disabled={loadState === "loading"}>
          <RefreshCw size={16} aria-hidden="true" /> {loadState === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      {loadState === "error" ? (
        <div className="orders-message error" role="alert">
          <ShieldCheck size={22} />
          <div><strong>Orders are temporarily unavailable</strong><p>{errorMessage}</p></div>
        </div>
      ) : loadState === "loading" && orders.length === 0 ? (
        <div className="orders-message" role="status">
          <RefreshCw className="spin" size={22} />
          <div><strong>Loading secure order records</strong><p>Reading payment and audit details from Supabase.</p></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="orders-message">
          <ShoppingBag size={22} />
          <div><strong>{orders.length === 0 ? "No orders yet" : "No matching orders"}</strong><p>{orders.length === 0 ? "Complete a Razorpay Test Mode checkout and refresh this list." : "Try a different search or payment filter."}</p></div>
        </div>
      ) : (
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th><span className="sr-only">View details</span></th></tr></thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.paymentRecordId} className={selectedOrderId === order.paymentRecordId ? "selected" : ""}>
                  <td><button type="button" className="order-id-button" onClick={() => setSelectedOrderId(order.paymentRecordId)}>{shortOrderId(order.internalOrderId)}</button><small>{formatDate(order.createdAt)}</small></td>
                  <td><strong>{order.customer?.name ?? "Customer not recorded"}</strong><small>{order.customer?.phone ?? "Earlier test order"}</small></td>
                  <td>{order.lines.reduce((total, line) => total + line.quantity, 0)} item{order.lines.reduce((total, line) => total + line.quantity, 0) === 1 ? "" : "s"}</td>
                  <td><strong>{formatInr(order.amountPaise)}</strong></td>
                  <td><OrderStatus status={order.paymentStatus} label={order.paymentStatusLabel} /></td>
                  <td><span className={`fulfilment-pill ${order.fulfilmentStatus}`}>{order.fulfilmentStatusLabel}</span></td>
                  <td><button type="button" className="view-order-button" onClick={() => setSelectedOrderId(order.paymentRecordId)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <OrderDetail
          key={selectedOrder.paymentRecordId}
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
          onReconciled={loadOrders}
        />
      )}
    </section>
  );
}

function OrderSummary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function OrderStatus({ status, label }: { status: MerchantPaymentStatus; label: string }) {
  return <span className={`order-status ${status}`}>{status === "paid" && <CheckCircle2 size={14} />}{label}</span>;
}

function OrderDetail({
  order,
  onClose,
  onReconciled,
}: {
  order: MerchantOrder;
  onClose: () => void;
  onReconciled: () => Promise<void>;
}) {
  const [recheckState, setRecheckState] = useState<"idle" | "checking">("idle");
  const [exportingAudit, setExportingAudit] = useState(false);
  const [recheckResult, setRecheckResult] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const canRecheck = order.paymentStatus === "verifying" && Boolean(order.razorpayPaymentId);

  async function recheckPayment() {
    if (!canRecheck || recheckState === "checking") return;
    setRecheckState("checking");
    setRecheckResult({ tone: "info", message: "Securely checking this payment with Razorpay..." });
    try {
      const response = await fetch(`/api/v1/merchant/orders/${order.paymentRecordId}/reconcile`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        message?: string;
        fulfilmentAuthorized?: boolean;
      };
      if (!response.ok) throw new Error(result.message || "The payment could not be rechecked.");
      setRecheckResult({
        tone: result.fulfilmentAuthorized ? "success" : "info",
        message: result.message || "Razorpay payment status was checked.",
      });
      await onReconciled();
    } catch (error) {
      setRecheckResult({
        tone: "error",
        message: (error as Error).message || "The payment could not be rechecked safely.",
      });
    } finally {
      setRecheckState("idle");
    }
  }

  async function exportAudit() {
    if (exportingAudit) return;
    setExportingAudit(true);
    try {
      const response = await fetch(`/api/v1/merchant/audit/${encodeURIComponent(order.traceId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Audit export is unavailable.");
      const payload = await response.text();
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${order.traceId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRecheckResult({ tone: "error", message: (error as Error).message });
    } finally {
      setExportingAudit(false);
    }
  }

  return (
    <article className="order-detail" aria-labelledby="order-detail-title">
      <header>
        <div><p className="eyebrow">Order detail</p><h3 id="order-detail-title">{shortOrderId(order.internalOrderId)}</h3><p>Created {formatDateTime(order.createdAt)}</p></div>
        <button type="button" onClick={onClose} aria-label="Close order details"><X size={20} /></button>
      </header>

      <div className="order-detail-status">
        <OrderStatus status={order.paymentStatus} label={order.paymentStatusLabel} />
        <span className={`fulfilment-pill ${order.fulfilmentStatus}`}>{order.fulfilmentStatusLabel}</span>
        <span className="test-mode-pill">Razorpay Test Mode</span>
        {canRecheck && (
          <button className="payment-recheck-button" type="button" onClick={() => void recheckPayment()} disabled={recheckState === "checking"}>
            <RefreshCw className={recheckState === "checking" ? "spin" : ""} size={15} />
            {recheckState === "checking" ? "Checking Razorpay..." : "Recheck with Razorpay"}
          </button>
        )}
      </div>
      {recheckResult && <p className={`payment-recheck-result ${recheckResult.tone}`} role="status">{recheckResult.message}</p>}

      <div className="order-detail-grid">
        <section><UserRound size={19} /><div><h4>Customer</h4>{order.customer ? <address><strong>{order.customer.name}</strong><a href={`mailto:${order.customer.email}`}>{order.customer.email}</a><a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></address> : <p>This earlier test order was created before customer snapshots were enabled.</p>}</div></section>
        <section><MapPin size={19} /><div><h4>Delivery address</h4><p>{order.customer?.deliveryAddress ?? "Address not available for this earlier test order."}</p></div></section>
        <section><CreditCard size={19} /><div><h4>Payment references</h4><dl><div><dt>Razorpay order</dt><dd>{order.razorpayOrderId}</dd></div><div><dt>Payment ID</dt><dd>{order.razorpayPaymentId ?? "Not received"}</dd></div><div><dt>Safe retries</dt><dd>{order.paymentRetryCount}</dd></div><div><dt>Callback</dt><dd>{order.callbackVerified ? "Verified" : "Not verified"}</dd></div><div><dt>Capture</dt><dd>{order.captureConfirmed ? "Confirmed" : "Pending"}</dd></div></dl></div></section>
        <section><Tag size={19} /><div><h4>Offer decision</h4><p>{offerDescription(order)}</p>{order.failureCode && <p className="order-failure">Failure code: {humanize(order.failureCode)}</p>}</div></section>
      </div>

      <section className="order-products">
        <div className="order-subheading"><h4>Products</h4><strong>{formatInr(order.amountPaise)}</strong></div>
        {order.lines.map((line) => (
          <div className="order-product-line" key={line.variantId}>
            <div><strong>{line.productName}</strong><small>{line.productType} · {line.size} · {line.variantId}</small></div>
            <span>{line.quantity} × {formatInr(line.unitPricePaise)}</span>
            <strong>{formatInr(line.lineTotalPaise)}</strong>
          </div>
        ))}
        <div className="order-totals"><span>Gross products <strong>{formatInr(order.grossPaise)}</strong></span><span>Offer savings <strong>-{formatInr(order.savingPaise)}</strong></span><span>Total paid/expected <strong>{formatInr(order.amountPaise)}</strong></span></div>
      </section>

      <section className="order-audit">
        <div className="order-subheading">
          <div>
            <h4>Complete audit trail</h4>
            <small>{order.auditIntegrity.status === "verified" ? "Cryptographic chain verified" : order.auditIntegrity.status === "broken" ? "Integrity check failed" : "Legacy trace — hashes unavailable"} · {order.auditEvents.length} event{order.auditEvents.length === 1 ? "" : "s"}</small>
          </div>
          <button className="audit-export-button" type="button" onClick={() => void exportAudit()} disabled={exportingAudit || order.auditIntegrity.status === "legacy"}>
            <Download size={14} /> {exportingAudit ? "Exporting..." : "Export JSON"}
          </button>
        </div>
        <div className={`audit-integrity-card ${order.auditIntegrity.status}`}>
          <strong>{order.auditIntegrity.status === "verified" ? "Verified append-only chain" : order.auditIntegrity.status === "broken" ? "Audit chain needs review" : "Earlier order"}</strong>
          <small>Trace {order.traceId}</small>
          {order.auditIntegrity.headHash && <code>Head {shortHash(order.auditIntegrity.headHash)}</code>}
          {order.auditIntegrity.issues.map((issue) => <small key={issue}>{issue}</small>)}
        </div>
        {order.decisionEvidence && (
          <div className="audit-decision-evidence">
            <span><small>Candidates</small><strong>{order.decisionEvidence.evaluatedCandidates} evaluated · {order.decisionEvidence.rejectedCandidates} rejected</strong></span>
            <span><small>Selected profit</small><strong>{order.decisionEvidence.selectedContributionProfitPaise === null ? "Unavailable" : formatInr(order.decisionEvidence.selectedContributionProfitPaise)}</strong></span>
            <span><small>Versions</small><strong>{order.decisionEvidence.catalogVersion ?? "Catalog unavailable"} · {order.decisionEvidence.policyVersion ?? "Policy unavailable"}</strong></span>
          </div>
        )}
        {order.auditEvents.length === 0 ? <p>No audit events were found for this earlier test order.</p> : (
          <ol>{order.auditEvents.map((event) => <li key={event.id}><span className={event.outcome === "failed" || event.outcome === "failure" ? "failed" : ""} /><div><strong>{event.sequence ? `${event.sequence}. ` : ""}{humanize(event.eventType)}</strong><small>{formatDateTime(event.createdAt)} · {humanize(event.reasonCode)}{event.eventHash ? ` · ${shortHash(event.eventHash)}` : ""}</small></div></li>)}</ol>
        )}
      </section>
    </article>
  );
}

function offerDescription(order: MerchantOrder): string {
  if (order.acceptedEngineOffer === true) return `${humanize(order.offerType ?? "selected offer")} accepted; customer saved ${formatInr(order.savingPaise)}.`;
  if (order.acceptedEngineOffer === false) return "The customer kept the original cart and did not accept the suggested offer.";
  return "Offer information was not stored for this earlier test order.";
}

function shortOrderId(value: string): string {
  const suffix = value.split("-").at(-1) ?? value;
  return `#${suffix.slice(0, 8)}`;
}

function humanize(value: string): string {
  return value.replaceAll(".", " ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
