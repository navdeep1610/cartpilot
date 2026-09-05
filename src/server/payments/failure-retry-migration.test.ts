import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/0005_failure_retry_demo.sql"), "utf8").toLowerCase();

describe("failed payment retry migration", () => {
  it("allows only unpaid terminal states to reuse the existing order", () => {
    expect(migration).toContain("create or replace function public.start_payment_retry");
    expect(migration).toContain("v_record.capture_confirmed or v_record.fulfilment_authorized");
    expect(migration).toContain("payment_failed','signature_verification_failed','cancelled");
    expect(migration).toContain("razorpayorderreused");
  });

  it("records an idempotent transition and audit event", () => {
    expect(migration).toContain("p_idempotency_key is null");
    expect(migration).toContain("last_retry_idempotency_key = p_idempotency_key");
    expect(migration).toContain("payment_retry_count = payment_retry_count + 1");
    expect(migration).toContain("payment.retry_started");
    expect(migration).toContain("safe_payment_retry_started");
  });
});
