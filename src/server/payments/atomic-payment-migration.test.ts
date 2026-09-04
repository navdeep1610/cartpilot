import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/0003_atomic_payments.sql"), "utf8");

describe("atomic payment migration contract", () => {
  it("resolves pgcrypto from Supabase's extensions schema", () => {
    expect(migration).toContain("extensions.digest(");
    expect(migration).not.toMatch(/(?<!extensions\.)digest\(/);
  });

  it("serializes all critical payment mutations behind row locks", () => {
    for (const functionName of [
      "claim_payment_order",
      "complete_payment_order",
      "mark_payment_order_unknown",
      "apply_payment_callback",
      "apply_payment_reconciliation",
      "apply_payment_timeout",
      "apply_razorpay_webhook",
    ]) {
      const body = functionBody(functionName);
      expect(body, functionName).toContain("for update");
    }
  });

  it("deduplicates webhook delivery before applying a transition", () => {
    const body = functionBody("apply_razorpay_webhook");
    expect(body).toContain("on conflict (event_id) do nothing");
    expect(body).toContain("'duplicate', true");
    expect(body).toContain("monotonic_state_protected");
  });

  it("requires both captured-payment and paid-order evidence for fulfilment", () => {
    const body = functionBody("apply_razorpay_webhook");
    expect(body).toContain("capture_confirmed = true");
    expect(body).toContain("v_order_paid");
    expect(body).toContain("fulfilment_authorized = capture_confirmed");
  });

  it("enforces unique cart, idempotency, order, and payment identities", () => {
    expect(migration).toContain("payment_records_confirmed_cart_idx");
    expect(migration).toContain("payment_records_confirmation_idempotency_idx");
    expect(migration).toContain("payment_records_order_idempotency_idx");
    expect(migration).toContain("payment_records_callback_idempotency_idx");
    expect(migration).toContain("payment_records_payment_id_idx");
  });
});

function functionBody(name: string): string {
  const start = migration.indexOf(`function public.${name}`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\n$$;", start);
  expect(end, `${name} terminates`).toBeGreaterThan(start);
  return migration.slice(start, end).toLowerCase();
}
