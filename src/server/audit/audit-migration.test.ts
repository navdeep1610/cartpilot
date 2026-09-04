import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/0004_complete_audit_trail.sql"), "utf8").toLowerCase();

describe("complete audit migration contract", () => {
  it("serializes each trace and allocates an increasing sequence", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(v_record.trace_id");
    expect(migration).toContain("max(sequence_number)");
    expect(migration).toContain("unique index if not exists audit_events_trace_idempotency_idx");
  });

  it("seals the payload and links it to the previous event", () => {
    expect(migration).toContain("previous_event_hash");
    expect(migration).toContain("payload_hash");
    expect(migration).toContain("event_hash");
    expect(migration).toContain("canonical_payload");
    expect(migration).toContain("audit_event_payload_valid(v_payload)");
  });

  it("rejects mutation of recorded evidence", () => {
    expect(migration).toContain("before update or delete on public.audit_events");
    expect(migration).toContain("audit_events_are_append_only");
  });

  it("seeds the intent-to-confirmation decision history atomically", () => {
    for (const eventName of [
      "intent.extracted",
      "catalog.filtered",
      "candidate.generated",
      "offer.selected",
      "cart.presented",
      "customer.confirmed",
    ]) expect(migration).toContain(eventName);
    expect(migration).toContain("after insert on public.payment_records");
  });
});
