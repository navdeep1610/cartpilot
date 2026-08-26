"use client";

import {
  CalendarDays,
  CreditCard,
  Database,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MerchantCustomer, MerchantCustomersResponse } from "@/domain/customers/merchant-customer";
import { formatInr } from "@/domain/money";

type LoadState = "loading" | "ready" | "error";

export function MerchantCustomers() {
  const [customers, setCustomers] = useState<MerchantCustomer[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/v1/merchant/customers", { cache: "no-store" });
      const result = (await response.json()) as MerchantCustomersResponse | { message?: string };
      if (!response.ok || !("customers" in result)) {
        throw new Error(("message" in result && result.message) || "Customers could not be loaded.");
      }
      setCustomers(result.customers);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setErrorMessage((error as Error).message || "Customers could not be loaded from Supabase.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadCustomers(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone, customer.deliveryAddress]
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [customers, query]);

  const customersWithOrders = customers.filter((customer) => customer.orderCount > 0).length;
  const capturedOrders = customers.reduce((total, customer) => total + customer.capturedOrderCount, 0);
  const capturedRevenue = customers.reduce((total, customer) => total + customer.capturedRevenuePaise, 0);

  return (
    <section className="customers-section" aria-labelledby="customers-title">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Stored in Supabase</p><h2 id="customers-title">Registered customers</h2></div>
        <p>These customers explicitly saved their contact and delivery details in the storefront Profile panel.</p>
      </div>

      <div className="order-summary-grid" aria-label="Customer summary">
        <CustomerSummary icon={<UsersRound />} label="Registered customers" value={String(customers.length)} />
        <CustomerSummary icon={<ShoppingBag />} label="Customers with orders" value={String(customersWithOrders)} />
        <CustomerSummary icon={<CreditCard />} label="Captured orders" value={String(capturedOrders)} />
        <CustomerSummary icon={<Database />} label="Captured revenue" value={formatInr(capturedRevenue)} />
      </div>

      <div className="customers-toolbar">
        <label className="orders-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search registered customers</span>
          <input
            type="search"
            placeholder="Search name, email, phone or address"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="orders-refresh" type="button" onClick={() => void loadCustomers()} disabled={loadState === "loading"}>
          <RefreshCw className={loadState === "loading" ? "spin" : ""} size={16} aria-hidden="true" />
          {loadState === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>

      {loadState === "error" ? (
        <div className="orders-message error" role="alert">
          <Database size={22} />
          <div><strong>Customer registry is unavailable</strong><p>{errorMessage}</p></div>
        </div>
      ) : loadState === "loading" && customers.length === 0 ? (
        <div className="orders-message" role="status">
          <RefreshCw className="spin" size={22} />
          <div><strong>Loading registered customers</strong><p>Reading customer profiles from Supabase.</p></div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="orders-message">
          <UserRound size={22} />
          <div><strong>{customers.length === 0 ? "No registered customers yet" : "No matching customers"}</strong><p>{customers.length === 0 ? "Save a storefront Profile to create the first customer record." : "Try a different name, email, phone number or address."}</p></div>
        </div>
      ) : (
        <div className="customer-directory" role="list" aria-label="Registered customer directory">
          {filteredCustomers.map((customer) => (
            <article className="customer-record" key={customer.customerProfileId} role="listitem">
              <header className="customer-record-header">
                <span className="customer-avatar" aria-hidden="true"><UserRound size={20} /></span>
                <div>
                  <h3>{customer.name}</h3>
                  <p>{shortCustomerId(customer.customerProfileId)}</p>
                </div>
                <span className="customer-record-status">
                  {customer.orderCount > 0 ? `${customer.orderCount} ${customer.orderCount === 1 ? "order" : "orders"}` : "New customer"}
                </span>
              </header>

              <div className="customer-record-grid">
                <section className="customer-field">
                  <small>Contact details</small>
                  <a href={`mailto:${customer.email}`}><Mail size={15} aria-hidden="true" /><span>{customer.email}</span></a>
                  <a href={`tel:${customer.phone}`}><Phone size={15} aria-hidden="true" /><span>{customer.phone}</span></a>
                </section>

                <section className="customer-field">
                  <small>Delivery address</small>
                  <address><MapPin size={15} aria-hidden="true" /><span>{customer.deliveryAddress}</span></address>
                </section>

                <section className="customer-field">
                  <small>Account dates</small>
                  <dl className="customer-date-list">
                    <div><dt>Registered</dt><dd><CalendarDays size={14} aria-hidden="true" />{formatDate(customer.registeredAt)}</dd></div>
                    <div><dt>Last updated</dt><dd>{formatDate(customer.updatedAt)}</dd></div>
                  </dl>
                </section>

                <section className="customer-field customer-metric">
                  <small>Order activity</small>
                  <strong>{customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}</strong>
                  <p>{customer.lastOrderAt ? `Last order ${formatDate(customer.lastOrderAt)}` : "No orders placed yet"}</p>
                </section>

                <section className="customer-field customer-metric">
                  <small>Captured revenue</small>
                  <strong>{formatInr(customer.capturedRevenuePaise)}</strong>
                  <p>{customer.capturedOrderCount} {customer.capturedOrderCount === 1 ? "captured payment" : "captured payments"}</p>
                </section>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="customer-privacy-note">Payment credentials are excluded. This directory is available only to the authenticated merchant.</p>
    </section>
  );
}

function CustomerSummary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article><span>{icon}</span><small>{label}</small><strong>{value}</strong></article>;
}

function shortCustomerId(value: string): string {
  const suffix = value.split("-").at(-1) ?? value;
  return `Customer ${suffix.slice(0, 8)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
