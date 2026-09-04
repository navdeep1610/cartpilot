# CartPilot Hackathon Requirement Matrix

Status date: 4 September 2026

Track: 01 — AI Growth & Agentic Commerce

Current upgrade phase: Phase 2 — commercial-policy correctness completed

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
| Explainable | Partial | Customer offer reasons and merchant reason codes exist | Show every candidate, calculation, gate and rejection in merchant audit |
| Bounded | Implemented | Runtime-validated catalog snapshots, fail-closed compatibility, component inventory, exclusions, discount guards, relevance, cross-sell limits and profit floors are enforced | Preserve with end-to-end regression coverage |
| Customer-gated | Implemented | Exact revalidated cart and total are required before order creation | Add end-to-end regression coverage |
| Payment-gated | Implemented with hardening required | Fulfilment requires capture plus paid-order evidence | Make webhook/state writes atomic and test replay/out-of-order delivery |
| Audit trail | Partial | Confirmed checkouts and payment events are stored | Record the complete intent-to-fulfilment chain with append-only integrity |
| Graceful failure | Partial | Gemini fallback, safe API errors, retained cart and blocked fulfilment exist | Demonstrate Razorpay failure, explicit safe retry and zero duplicate fulfilment |
| Merchant growth evidence | Not yet complete | Profit calculations exist in the engine | Run and publish all 35 evaluation scenarios and aggregate metrics |
| Reviewer-ready deployment | Not yet complete | Local production build succeeds | Stable deployment, configured webhook, README, CI and five-minute demo |

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

## Next release gate: Phase 3

Atomic payment and webhook reliability comes next: one confirmed cart must map to one recoverable Razorpay order, duplicate or out-of-order events must be idempotent, and related payment state changes must commit transactionally.

## Submission definition of done

- One successful Razorpay Test payment completes end to end.
- One failed Test payment retains the cart, blocks fulfilment and supports a safe audited retry.
- Duplicate and out-of-order webhooks cannot duplicate or downgrade money state.
- A merchant can reconstruct the winning decision from inputs, candidates, calculations, policy versions and gate results.
- All 35 documented evaluation scenarios produce a versioned report with honest exceptions.
- CI passes lint, types, schemas, manifest checks, unit/integration/E2E tests, evaluation, build, secret scan and dependency audit.
- The public repository, stable deployment, README and five-minute demo contain no secrets or unsupported claims.
