import type { CustomerOrder, CustomerOrderLine } from "@/domain/orders/customer-order";

export interface StoredCustomerOrderRecord {
  internal_order_id: string;
  amount_paise: number;
  currency: "INR";
  mode: "test";
  state: string;
  capture_confirmed: boolean;
  fulfilment_authorized: boolean;
  confirmed_cart: unknown;
  created_at: string;
}

export function toCustomerOrder(record: StoredCustomerOrderRecord): CustomerOrder {
  if (!record.capture_confirmed || !record.fulfilment_authorized) {
    throw new Error("Customer order requires captured payment and authorized fulfilment");
  }

  const cart = asObject(record.confirmed_cart);
  const lines = Array.isArray(cart.lines)
    ? cart.lines.map(toCustomerOrderLine).filter((line): line is CustomerOrderLine => line !== null)
    : [];

  return {
    orderId: record.internal_order_id,
    amountPaise: safeMoney(record.amount_paise, sumLineTotals(lines)),
    currency: "INR",
    placedAt: record.created_at,
    status: "confirmed",
    statusLabel: "Payment captured · Ready to pack",
    testMode: true,
    lines,
  };
}

function toCustomerOrderLine(value: unknown): CustomerOrderLine | null {
  const line = asObject(value);
  const variantId = readString(line.variantId);
  const productId = readString(line.productId);
  const quantity = positiveInteger(line.quantity);
  if (!variantId || !productId || !quantity) return null;

  return {
    variantId,
    productId,
    productName: readString(line.productName) ?? productId,
    productType: readString(line.productType) ?? "Skincare",
    size: readString(line.size) ?? "Size unavailable",
    quantity,
    lineTotalPaise: safeMoney(line.lineFinalPaise, 0),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
}

function safeMoney(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

function sumLineTotals(lines: CustomerOrderLine[]): number {
  return lines.reduce((total, line) => total + line.lineTotalPaise, 0);
}
