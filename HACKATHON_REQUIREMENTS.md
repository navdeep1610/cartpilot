# CartPilot Hackathon Requirement Matrix

Status date: 5 September 2026

Track: 01 — AI Growth & Agentic Commerce

Current upgrade phase: Phase 8 — release engineering and submission package

## Official brief translated into acceptance criteria

The challenge permits either of two routes:

1. Grow a merchant's revenue using Razorpay Test Mode APIs.
2. Make a merchant transactable by an AI buyer end to end.

CartPilot deliberately chooses route 1. The listed ideas—conversational checkout, agent-readable catalog, upsell/cross-sell agent and campaign orchestrator—are example directions, not four mandatory features.

The mandatory quality bar is that every money action is explainable, bounded and gated, with an audit trail and one failure handled gracefully.

## Frozen product claim

> CartPilot is a bounded AI skincare sales agent that grows estimated merchant contribution profit through compatible routine completion, bundles and one-item cross-sells, while deterministic rules and Razorpay Test Mode control every money action.

Primary business measure: estimated contribution-profit uplift per shopping session versus the same product-only baseline. Revenue and average order value are supporting measures.

## Current compliance matrix

| Requirement | Current status | Evidence today | Release gate |
|---|---|---|---|
| Track 01 revenue-growth route | Implemented | Routine completion, bundles, cross-sells, discounts and Razorpay Test Mode are present | Publish reproducible uplift results |
| Explainable | Implemented | The merchant trace includes decision evidence, candidate counts, economics, versions, reason codes and event envelopes | Preserve during failure-demo work |
| Bounded | Implemented | Runtime-validated catalog snapshots, fail-closed compatibility, component inventory, exclusions, discount guards, relevance, cross-sell limits and profit floors are enforced | Preserve with end-to-end regression coverage |
| Customer-gated | Implemented | Exact revalidated cart and total are required before order creation | Add end-to-end regression coverage |
| Payment-gated | Implemented | Transactional payment claims and transitions require matching captured-payment plus paid-order evidence | Preserve with end-to-end Razorpay Test Mode evidence |
| Audit trail | Implemented | Schema envelopes, atomic sequence allocation, payload hashes, linked event hashes, immutability and merchant JSON export are implemented | Preserve during growth-evaluation work |
| Graceful failure | Implemented locally | Failed payments retain the cart, block fulfilment and reopen the same Razorpay order through an idempotent audited retry | Apply migration `0005_failure_retry_demo.sql` and record the reviewer demo |
| Merchant growth evidence | Implemented locally | All 35 scenarios execute; 31 match their frozen outcomes, all 10 safety cases match, and four exceptions remain visible in the merchant report | Preserve the versioned report and resolve exceptions only through reviewed catalog or policy changes |
| Agentic shopper experience | Implemented | Bounded conversation history, contextual follow-ups, visible action evidence, provider fallback and safe retry are present | Preserve authority boundaries in the deployment demo |
| Reviewer-ready deployment | Engineering complete; owner evidence pending | Stable Vercel site, automated release gate, browser tests, README, demo script and evidence checklist are present | Verify the live webhook, two Test payments, CI run and video before form submission |

## Phase 1 deliverables

- [x] Select and document one Track 01 route.
- [x] Freeze one concise product and business claim.
- [x] Separate mandatory rules from optional example directions.
- [x] Publish an honest current-state requirement matrix.
- [x] Replace stale pre-implementation status language.
- [x] Align the storefront headline and trust language with the chosen route.
- [x] Preserve full ACP, AP2, UAP, x402 and campaign orchestration as non-goals unless separately approved.

Phase 1 exit criterion: product, repository and storefront tell the same story without overstating unfinished safeguards.

## Phase 2 deliverables

Commercial-policy correctness completed before payment/audit expansion:

- [x] Validate every bundle component's availability and compatibility.
- [x] Treat unknown product relationships according to a fail-closed policy.
- [x] Enforce customer ingredient and product exclusions.
- [x] Enforce non-stacking and prepriced-bundle discount rules.
- [x] Add hard relevance and maximum-one-cross-sell checks.
- [x] Enforce manifest checksums, row counts, headers and version identities at runtime.
- [x] Validate decision objects against their declared schema.
- [x] Add focused regression tests for every rule above.

Phase 2 exit criterion: no recommendation or offer can bypass a catalog, compatibility, inventory, budget, discount or contribution-profit rule.

## Phase 3 deliverables

Atomic payment and webhook reliability completed before expanding the audit system:

- [x] Make one confirmed cart map to one payment record and one Razorpay order claim.
- [x] Require bounded idempotency keys on customer payment mutations.
- [x] Commit order claims, order results, callbacks, timeouts and reconciliation with their transition and audit evidence.
- [x] Verify raw webhook signatures before parsing or persistence.
- [x] Deduplicate webhook event IDs inside the same transaction as payment-state changes.
- [x] Protect captured state from duplicate or out-of-order failure and authorization events.
- [x] Require both captured-payment and paid-order evidence before opening fulfilment.
- [x] Mark ambiguous Razorpay order creation as reconciliation-required rather than creating again.
- [x] Add regression coverage for both webhook arrival orders and monotonic state protection.

Phase 3 exit criterion: a repeated customer mutation or webhook cannot create a second order, downgrade captured money state, or authorize fulfilment twice.

## Phase 4 deliverables

- [x] Give each payment record a stable `TRACE-*` identifier.
- [x] Seed intent, catalog, candidate, offer, cart and confirmation events in the confirmation transaction.
- [x] Map order, callback, payment, webhook, fulfilment and safe-failure events to the declared audit schema.
- [x] Allocate trace sequences under a transaction-scoped lock.
- [x] Link canonical payload hashes into a tamper-evident SHA-256 chain.
- [x] Reject updates and deletes from the audit table.
- [x] Verify the schema and chain independently in the server application.
- [x] Show integrity, decision evidence and hashes to the merchant and support sanitized JSON export.

Phase 4 exit criterion: a merchant can reconstruct a new checkout trace and detect any sequence, payload, envelope or parent-hash alteration.

## Phase 5 deliverables

- [x] Retain the confirmed cart after a failed payment.
- [x] Keep fulfilment blocked throughout failure and retry.
- [x] Reopen the existing Razorpay order instead of creating a duplicate.
- [x] Require a bounded idempotency key and make duplicate retry requests harmless.
- [x] Record the recovery transition and `payment.retry_started` audit event.
- [x] Show the retry action to the customer and retry count to the merchant.
- [x] Reject retries after capture or fulfilment authorization.

Phase 5 exit criterion: a failed Test payment can be retried safely without a second order or duplicate fulfilment, and the merchant can verify the recovery in the audit trail.

## Phase 6 deliverables

- [x] Parse and validate all 35 versioned synthetic scenarios.
- [x] Replay recommendation and offer cases through the production deterministic engines.
- [x] Replay failure-injection cases without external provider calls.
- [x] Compare every actual field with the frozen expectation.
- [x] Publish baseline and assisted revenue, AOV and contribution-profit evidence.
- [x] Keep every exception in both the headline rate and detailed report.
- [x] Add a merchant-only dashboard and versioned JSON export.
- [x] Add a dedicated evaluation test command and deterministic replay tests.

Phase 6 exit criterion: all 35 scenarios execute reproducibly, aggregate growth evidence is clearly labelled as synthetic, and mismatches remain visible rather than being omitted from the reported rate.

Current result: 31/35 expected outcomes match (88.6%), 10/10 safety outcomes match, and four documented exceptions remain. See `evaluation/GROWTH_EVALUATION_REPORT.md`.

## Phase 7 deliverables

- [x] Preserve a short, privacy-conscious conversation in the browser without persisting raw messages.
- [x] Offer contextual follow-up replies for clarification, constraint changes and no-match recovery.
- [x] Expose a four-step agent activity record without exposing private chain-of-thought.
- [x] Label AI-assisted interpretation separately from deterministic merchant decisions.
- [x] Keep provider fallback visible and useful rather than silently weakening the experience.
- [x] Make recommendation-service failure recoverable without changing the shopper's cart.
- [x] Keep product, compatibility, inventory, price, offer, order and payment authority in merchant code.
- [x] Add regression coverage for ready, clarification, professional-guidance and no-match activity records.

Phase 7 exit criterion: the shopping flow feels conversational and agentic while every displayed action makes its authority, boundary and safe stopping behavior inspectable.

## Phase 8 deliverables

- [x] Add a least-privilege GitHub Actions quality gate for pull requests and `main`.
- [x] Validate JSON, JSON Schemas, pinned manifest resources and reviewed dependency versions.
- [x] Scan repository candidates for secrets, live Razorpay keys and tracked private environment files.
- [x] Run unit, integration, 35-scenario evaluation and production-build checks in CI.
- [x] Add desktop and mobile browser journeys for agent clarification, safe stopping and merchant authorization.
- [x] Add a high-severity production dependency audit to local and CI release commands.
- [x] Document the stable production URL and stable Razorpay webhook path.
- [x] Publish a timed five-minute reviewer demo script and honest evidence checklist.
- [ ] Record a successful Test payment with signed capture evidence and authorized fulfilment.
- [ ] Record a failed Test payment with retained cart, blocked fulfilment and safe same-order retry.
- [ ] Verify the production webhook configuration and a recent signed delivery in the Razorpay dashboard.
- [ ] Confirm eligibility, deadline and submission fields, then record and upload the final video.

Phase 8 engineering exit criterion: all automated release checks pass from a clean checkout and the matching commit deploys successfully to the stable site. Final submission readiness additionally requires every account-owner evidence item above.

## Submission definition of done

- One successful Razorpay Test payment completes end to end.
- One failed Test payment retains the cart, blocks fulfilment and supports a safe audited retry.
- Duplicate and out-of-order webhooks cannot duplicate or downgrade money state.
- A merchant can reconstruct the winning decision from inputs, candidates, calculations, policy versions and gate results.
- All 35 documented evaluation scenarios produce a versioned report with honest exceptions.
- CI passes lint, types, schemas, manifest checks, unit/integration/E2E tests, evaluation, build, secret scan and dependency audit.
- The public repository, stable deployment, README and five-minute demo contain no secrets or unsupported claims.
