import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import auditEventSchema from "../../../schemas/audit_event_schema.json" with { type: "json" };
import { canonicalJson } from "@/server/security/canonical-json";

const ajv = new Ajv2020({ allErrors: true, strict: false, formats: { "date-time": true } });
const validateAuditEvent = ajv.compile(auditEventSchema);

export interface StoredAuditEnvelope {
  audit_event_id: string;
  trace_id: string;
  sequence_number: number;
  event_type: string;
  outcome: string;
  reason_code: string;
  created_at: string;
  schema_version: string;
  idempotency_key: string;
  previous_event_hash: string | null;
  payload_hash: string;
  event_hash: string;
  canonical_payload: string;
  event_payload: Record<string, unknown>;
}

export interface AuditChainVerification {
  valid: boolean;
  eventCount: number;
  headHash: string | null;
  issues: string[];
}

export function assertAuditEventSchema(payload: unknown): asserts payload is Record<string, unknown> {
  if (validateAuditEvent(payload)) return;
  const issues = validateAuditEvent.errors
    ?.map(({ instancePath, keyword }) => `${instancePath || "/"}:${keyword}`)
    .join(",");
  throw new Error(`Audit event failed its declared schema: ${issues || "unknown"}`);
}

export function verifyAuditChain(events: readonly StoredAuditEnvelope[]): AuditChainVerification {
  const ordered = [...events].sort((left, right) => left.sequence_number - right.sequence_number);
  const issues: string[] = [];
  let previousHash: string | null = null;

  ordered.forEach((event, index) => {
    const expectedSequence = index + 1;
    if (event.sequence_number !== expectedSequence) issues.push(`SEQUENCE_GAP:${event.audit_event_id}`);
    if (event.previous_event_hash !== previousHash) issues.push(`PREVIOUS_HASH_MISMATCH:${event.audit_event_id}`);
    const payloadHash = sha256(event.canonical_payload);
    if (payloadHash !== event.payload_hash) issues.push(`PAYLOAD_HASH_MISMATCH:${event.audit_event_id}`);
    const eventHash = auditEventHash(previousHash, event.payload_hash, event.audit_event_id, event.sequence_number);
    if (eventHash !== event.event_hash) issues.push(`EVENT_HASH_MISMATCH:${event.audit_event_id}`);
    try {
      assertAuditEventSchema(event.event_payload);
    } catch {
      issues.push(`SCHEMA_INVALID:${event.audit_event_id}`);
    }
    const integrity = asObject(event.event_payload.integrity);
    try {
      const canonicalEnvelope = JSON.parse(event.canonical_payload) as Record<string, unknown>;
      const canonicalIntegrity = asObject(canonicalEnvelope.integrity);
      const expectedEnvelope = {
        ...canonicalEnvelope,
        integrity: {
          ...canonicalIntegrity,
          payload_hash: event.payload_hash,
          event_hash: event.event_hash,
        },
      };
      if (canonicalJson(expectedEnvelope) !== canonicalJson(event.event_payload)) {
        issues.push(`PAYLOAD_ENVELOPE_MISMATCH:${event.audit_event_id}`);
      }
    } catch {
      issues.push(`CANONICAL_PAYLOAD_INVALID:${event.audit_event_id}`);
    }
    if (
      integrity.previous_event_hash !== event.previous_event_hash ||
      integrity.payload_hash !== event.payload_hash ||
      integrity.event_hash !== event.event_hash
    ) {
      issues.push(`ENVELOPE_HASH_MISMATCH:${event.audit_event_id}`);
    }
    previousHash = event.event_hash;
  });

  return {
    valid: issues.length === 0,
    eventCount: ordered.length,
    headHash: previousHash,
    issues,
  };
}

export function sealAuditEventForStorage(
  payload: Record<string, unknown>,
  previousEventHash: string | null,
  auditEventId: string,
  sequence: number,
): Pick<StoredAuditEnvelope, "canonical_payload" | "payload_hash" | "event_hash" | "event_payload"> {
  const integrity = asObject(payload.integrity);
  const provisional = {
    ...payload,
    integrity: {
      ...integrity,
      previous_event_hash: previousEventHash,
      payload_hash: "0".repeat(64),
      event_hash: "0".repeat(64),
    },
  };
  const canonicalPayload = canonicalJson(provisional);
  const payloadHash = sha256(canonicalPayload);
  const eventHash = auditEventHash(previousEventHash, payloadHash, auditEventId, sequence);
  return {
    canonical_payload: canonicalPayload,
    payload_hash: payloadHash,
    event_hash: eventHash,
    event_payload: {
      ...provisional,
      integrity: {
        ...asObject(provisional.integrity),
        payload_hash: payloadHash,
        event_hash: eventHash,
      },
    },
  };
}

export function auditEventHash(
  previousEventHash: string | null,
  payloadHash: string,
  auditEventId: string,
  sequence: number,
): string {
  return sha256(`${previousEventHash ?? ""}:${payloadHash}:${auditEventId}:${sequence}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
