import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/0006_five_minute_payment_lifecycle.sql"),
  "utf8",
).toLowerCase();

describe("five-minute payment lifecycle migration", () => {
  it("bounds failed-payment retries to five minutes", () => {
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain("payment_retry_window_expired");
    expect(migration).toContain("payment_timeout_5m");
    expect(migration).toContain("'retrywindowminutes', 5");
  });

  it("prevents two replacement attempts from authorizing fulfilment", () => {
    expect(migration).toContain("guard_single_checkout_fulfilment");
    expect(migration).toContain("duplicate_payment_captured");
    expect(migration).toContain("payment_records_one_fulfilment_per_cart_idx");
    expect(migration).toContain("where fulfilment_authorized");
  });
});
