import auditEventSchema from "../../../schemas/audit_event_schema.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import {
  sealAuditEventForStorage,
  verifyAuditChain,
  type StoredAuditEnvelope,
} from "./audit-chain";

describe("tamper-evident audit chain", () => {
  it("accepts a continuous schema-valid chain", () => {
    const first = storedEvent(1, null);
    const second = storedEvent(2, first.event_hash);
    expect(verifyAuditChain([second, first])).toEqual({
      valid: true,
      eventCount: 2,
      headHash: second.event_hash,
      issues: [],
    });
  });

  it("detects payload tampering, broken links, and sequence gaps", () => {
    const first = storedEvent(1, null);
    const tampered = storedEvent(3, "f".repeat(64));
    tampered.canonical_payload += " ";
    const result = verifyAuditChain([first, tampered]);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      `SEQUENCE_GAP:${tampered.audit_event_id}`,
      `PREVIOUS_HASH_MISMATCH:${tampered.audit_event_id}`,
      `PAYLOAD_HASH_MISMATCH:${tampered.audit_event_id}`,
    ]));
  });

  it("detects a schema-valid envelope changed after it was sealed", () => {
    const event = storedEvent(1, null);
    event.event_payload = {
      ...event.event_payload,
      explanation: {
        ...(event.event_payload.explanation as Record<string, unknown>),
        summary: "A different but schema-valid explanation.",
      },
    };
    expect(verifyAuditChain([event]).issues).toContain(`PAYLOAD_ENVELOPE_MISMATCH:${event.audit_event_id}`);
  });
});

function storedEvent(sequence: number, previousHash: string | null): StoredAuditEnvelope {
  const payload = structuredClone(auditEventSchema.examples[0]) as unknown as Record<string, unknown>;
  const auditEventId = `AUD-TEST-${String(sequence).padStart(8, "0")}`;
  payload.event_id = `EVT-TEST-${String(sequence).padStart(8, "0")}`;
  payload.sequence = sequence;
  const sealed = sealAuditEventForStorage(payload, previousHash, auditEventId, sequence);
  return {
    audit_event_id: auditEventId,
    trace_id: "TRACE-TEST-12345678",
    sequence_number: sequence,
    event_type: String(payload.event_name),
    outcome: String(payload.outcome),
    reason_code: "HIGHEST_VALID_PROFIT_SCORE",
    created_at: String(payload.recorded_at),
    schema_version: "1.0.0",
    idempotency_key: `audit:test:${sequence}:12345678`,
    previous_event_hash: previousHash,
    payload_hash: sealed.payload_hash,
    event_hash: sealed.event_hash,
    canonical_payload: sealed.canonical_payload,
    event_payload: sealed.event_payload,
  };
}
