# CartPilot Implementation Specification

Document version: 1.0.0  
Planning snapshot: 24 August 2026  
Status: Baseline application implemented; Phase 4 complete audit trail implemented locally 5 September 2026

Target: Razorpay AI Buildathon — Track 01, AI Growth & Agentic Commerce

## 1. Purpose

This document is the build contract for CartPilot, a conversational skincare sales concierge that increases a merchant's estimated contribution profit through compatible routine completion, bundles, one-item cross-sells, substitutes, threshold incentives, and bounded discounts.

The finished MVP must be a working deployed product using Razorpay Test Mode APIs. Every commercial action must be explainable, bounded, customer-gated, deterministic, and auditable. It must demonstrate one successful payment and one payment failure that is handled without marking the order paid or authorising fulfilment.

This file remains the detailed engineering contract. The current compliance state, approved upgrade sequence and release gates are maintained in `HACKATHON_REQUIREMENTS.md`; where this original specification describes a future implementation task, that status matrix is authoritative.

## 2. Locked product decisions

| Decision | Locked choice |
|---|---|
| Product name | CartPilot |
| Merchant | One fictional Indian skincare merchant |
| Currency | INR only |
| Payment environment | Razorpay Test Mode only |
| Primary objective | Estimated contribution profit per shopping session |
| Customer value | Relevant, compatible routine guidance within stated constraints |
| Offer methods | Product-only baseline, routine bundle, one cross-sell, substitute, threshold incentive, bounded discount |
| Offer selection | Custom deterministic backend policy |
| Random offer selection | Never |
| Trained offer ML model | Not in the MVP; no genuine labelled merchant data exists yet |
| LLM role | Structured intent extraction and optional fact-bounded explanation drafting |
| LLM authority | No pricing, catalog eligibility, compatibility, profit, discount, selection, order, or payment authority |
| Customer gate | Explicit confirmation of the exact revalidated cart and total before order creation |
| Fulfilment gate | Captured payment confirmed by a signed webhook or authenticated Razorpay API fetch |
| Audit | Append-only event chain covering decisions, money actions, failures, and recovery |
| Public catalog | Customer-safe and agent-readable projections |
| Internal economics | Merchant-only |

## 3. Buildathon alignment

The official buildathon asks Track 01 participants to grow merchant revenue on Razorpay Test Mode APIs or make the merchant transactable by an AI buyer. Its quality bar is that every money action is explainable, bounded, gated, and accompanied by an audit trail and one gracefully handled failure.

CartPilot addresses that bar as follows:

- Explainable: every candidate, rejection, calculation, selected reason, confirmation, payment transition, and recovery step has stable reason codes and human-readable evidence.
- Bounded: catalog, compatibility, inventory, budget, price, discount, and margin rules are versioned merchant configuration.
- Gated: recommendations cannot create orders; orders require customer confirmation; fulfilment requires verified capture.
- Audited: decision and payment events are append-only, correlated, versioned, idempotent, and free of secrets.
- Working API integration: the MVP uses Razorpay Orders, Standard Checkout, signature verification, and webhooks in Test Mode.
- Failure demo: a failed test payment retains the cart, does not mark the order paid, does not fulfil, and offers a safe retry.

Official challenge page: [Razorpay AI Buildathon](https://razorpay.com/buildathon/)

## 4. Existing planning and data contracts

Implementation must treat these files as versioned inputs, not informal examples:

| Resource | Purpose |
|---|---|
| `PROJECT_PLAN.md` | Product thesis, scope, metrics, gates, and pitch plan |
| `catalog/catalog_manifest.json` | File inventory, checksums, visibility, loading order, and cross-file constraints |
| `catalog/customer_catalog.csv` | Customer-safe product identity and display content |
| `catalog/product_variants.csv` | Authoritative variants, prices, currency, and stock |
| `catalog/merchant_economics.csv` | Private costs, return estimates, margin floors, and discount caps |
| `catalog/product_profiles.csv` | Routine role, suitability attributes, exclusions, and warnings |
| `catalog/product_compatibility.csv` | Complements, substitutes, conflicts, redundancy, ordering, and safety actions |
| `catalog/bundle_components.csv` | Prepriced bundle composition |
| `catalog/discount_policy.json` | Discount triggers, ladder, caps, guards, and tie-breakers |
| `catalog/profit_policy.json` | Exact profit formulas, ranking weights, penalties, hard gates, and selection rules |
| `catalog/evaluation_scenarios.csv` | Thirty-five deterministic recommendation, safety, payment, and failure cases |
| `schemas/customer_intent_schema.json` | Validated structured intent contract |
| `schemas/offer_decision_schema.json` | Complete candidate and selected-offer contract |
| `schemas/payment_state_schema.json` | Confirmation, order, checkout, payment, webhook, retry, and fulfilment state contract |
| `schemas/audit_event_schema.json` | Append-only audit-event contract |

No runtime engine may silently reinterpret a field. A behavior-changing data or formula change requires the version and manifest checksum updates specified by `catalog/catalog_manifest.json`.

## 5. Chosen technical stack

| Layer | Choice | Implementation constraint |
|---|---|---|
| Language | TypeScript | Strict mode; shared types across UI, routes, and engines |
| Runtime | Node.js 24.x | Pin `24.x` in the eventual package configuration and Vercel project |
| Package manager | pnpm 11.x | Commit one lockfile; no mixed package managers |
| Web framework | Next.js 16.x App Router | Pin the current security-patched stable release at implementation time |
| UI | React supplied by the selected Next.js release | Server Components by default; Client Components only for conversation and Checkout interactions |
| Styling | Tailwind CSS from the standard Next.js setup | No separate component SaaS required |
| API layer | Next.js Route Handlers | All payment routes explicitly use the Node.js runtime, never Edge |
| Hosting | Vercel | Stable production URL for Razorpay webhook; preview URLs are not webhook targets |
| Database | Supabase Postgres | Versioned SQL migrations, constraints, RLS, append-only audit storage |
| Runtime database access | Supabase Data API plus narrowly scoped Postgres RPC functions | Stateless serverless access; RPC functions own critical multi-table transactions |
| Authentication | Supabase Auth for merchant users | One allowlisted merchant-admin identity for the MVP |
| Payments | Official `razorpay` Node SDK | Test keys only; version verified before lockfile creation |
| Checkout | Razorpay Standard Checkout | Load `checkout.js` from Razorpay's CDN; do not self-host it |
| Schema validation | Ajv with JSON Schema Draft 2020-12 support | Validate LLM, decision, payment, and audit objects at boundaries |
| LLM | One hosted structured-output provider behind a project-owned adapter | Provider remains a resource-gate choice based on account access and credits |
| Unit/integration tests | Vitest | Pure engine tests must not require network access |
| Browser tests | Playwright | Customer flow, merchant audit, and safe failure UI |
| Source control and CI | GitHub and GitHub Actions | Public repository only after automated secret and artifact checks pass |
| Monitoring | Structured server logs plus Postgres audit events | No secret, raw credential, or direct customer identifier in logs |

### 5.1 Version freeze rule

As of 24 August 2026, Vercel supports Node.js 24.x and Next.js 16 is current. The Next.js team has announced a security release for 26 August 2026. Therefore, implementation must not copy an arbitrary version from this planning date. At scaffolding time:

1. Select the latest stable, security-patched Next.js 16 release.
2. Pin exact dependency versions in the lockfile.
3. Run the dependency audit and production build.
4. Record the chosen versions in the README and deployment record.

Official references: [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), and [Next.js releases](https://nextjs.org/blog).

### 5.2 Why TypeScript and one Next.js application

- The browser, API contracts, pure engines, and payment adapter can share types.
- The official Razorpay Node SDK is available and includes TypeScript declarations.
- Next.js Route Handlers can receive the raw webhook body and can run on Node.js.
- Vercel deployment is direct and gives the project one reviewer-friendly URL.
- A separate Python service would add deployment, schema, authentication, and tracing complexity without improving this MVP.

### 5.3 Intentionally excluded infrastructure

- No third-party recommendation or dynamic-pricing service.
- No opaque agent framework.
- No vector database for a forty-product catalog.
- No Redis requirement for the MVP.
- No event-bus vendor; webhook processing is a small, synchronous database transaction.
- No separately trained conversion or offer model.
- No multi-agent runtime.

## 6. Logical architecture

```text
Shopper browser
  -> Next.js customer UI
  -> session and request validation
  -> hosted LLM adapter for structured intent
  -> JSON Schema validation
  -> immutable catalog snapshot
  -> eligibility and compatibility engines
  -> candidate and discount generation
  -> pricing and contribution-profit engines
  -> deterministic offer selection and policy gates
  -> persisted decision and append-only audit
  -> itemized cart shown to shopper
  -> explicit shopper confirmation
  -> server-side Razorpay order creation
  -> Razorpay Standard Checkout
  -> server-side callback signature verification when callback arrives
  -> signed webhook or authenticated API fetch confirms capture
  -> fulfilment gate and merchant audit dashboard
```

The LLM interprets and explains. Project-owned deterministic engines generate, calculate, reject, rank, and select. Razorpay processes the test payment. Verified server-side payment evidence controls fulfilment.

## 7. Trust and authority boundaries

| Input or component | Trust level | Allowed role |
|---|---|---|
| Browser request | Untrusted | Request a recommendation, confirmation, checkout, or state read |
| LLM output | Untrusted structured proposal | Intent fields and bounded wording only |
| CSV and JSON catalog snapshot | Trusted only after manifest validation | Catalog, economics, compatibility, discount, and ranking authority |
| Postgres active snapshot | Runtime authority | Prices, stock, configuration versions, decisions, and state |
| Customer confirmation | Authoritative customer action after server verification | Permit creation of the exact confirmed order |
| Razorpay callback | Untrusted until server signature verification | Improve customer UX and link a payment attempt |
| Signed Razorpay webhook | Trusted after raw-body HMAC verification and deduplication | Update payment state and confirm capture |
| Razorpay API fetch | Trusted server-to-server response | Reconcile or confirm current order/payment state |
| Merchant dashboard browser | Untrusted until Supabase Auth and allowlist checks | Read merchant-only audit and metrics |

Rules:

- The browser never sends an authoritative price, profit, discount, payment state, or fulfilment instruction.
- The LLM never creates a product, relationship, discount, order, or payment action.
- Only the server can access merchant economics, Razorpay secrets, the Supabase service role, or the LLM API key.
- Every side effect follows a successful pure decision and policy pipeline.

## 8. Planned repository structure

```text
app/
  (shopper)/
  merchant/
  api/v1/
src/
  domain/
    intent/
    catalog/
    compatibility/
    bundles/
    pricing/
    profit/
    discounts/
    offers/
    policies/
  application/
    recommendations/
    checkout/
    reconciliation/
    evaluation/
  adapters/
    llm/
    persistence/supabase/
    payments/razorpay/
  audit/
  contracts/
  security/
  observability/
catalog/
schemas/
supabase/
  migrations/
  seed/
tests/
  unit/
  contract/
  integration/
  e2e/
  evaluation/
```

The exact filenames can change during implementation, but domain engines must remain independent from Next.js, Supabase, the LLM SDK, and Razorpay.

## 9. Engine contracts

Every engine returns a typed result containing either a validated success value or stable reason codes and a safe explanation. Pure engines cannot query a database, call a network, read environment variables, use the clock implicitly, or generate randomness. Required context such as time, policy version, and catalog snapshot is passed explicitly.

| Engine | Input | Output | Side effects |
|---|---|---|---|
| Intent extraction | Shopper message, current cart summary, schema version | Validated `customer_intent_schema` object or clarification/failure | LLM adapter call only; no commercial action |
| Catalog eligibility | Intent, cart, immutable snapshot | Eligible and rejected variants with reasons | None |
| Compatibility | Eligible products, profiles, pair rules, shopper disclosures | Allow, separate-use, clarify, block, or manual-review evidence | None |
| Bundle generation | Intent, eligible products, routine roles, bundle definitions | Fixed-order candidate set | None |
| Pricing and cart | Candidate lines, authoritative variant prices, valid discount allocation | Reconciled integer-paise cart | None |
| Contribution profit | Priced cart, merchant economics, profit-policy version | Complete profit breakdown and margin | None |
| Dynamic discount | Trigger evidence, baseline, approved ladder, caps, floors | Zero or more policy-valid discount candidates | None |
| Offer selection | All eligible candidates, weights, penalties, thresholds, baseline | Complete `offer_decision_schema` object | None |
| Policy and safety | Candidate, customer constraints, catalog and merchant rules | Passed/failed gate results | None |
| Checkout orchestration | Confirmed decision, session, payment record | Razorpay order, verified callback, reconciled payment state | Database and Razorpay calls through adapters |
| Audit | Validated event data and prior event hash | Append-only `audit_event_schema` record | Database insert only |
| Evaluation | Frozen intent scenario, snapshot, expected result | Actual result, pass/fail evidence, metrics | Test database writes only |

## 10. Deterministic recommendation pipeline

For one validated shopper state, the server performs these steps in this order:

1. Pin one valid catalog snapshot and all policy/schema versions.
2. Validate and normalize the LLM's structured intent.
3. Reject invented product or variant identifiers.
4. Resolve requested products and establish the product-only, no-incentive baseline.
5. Apply active-status, inventory, explicit exclusion, profile, and compatibility filters.
6. Generate every applicable candidate type in the fixed order defined by `profit_policy.json`.
7. Deduplicate candidates using sorted variant/quantity pairs and discount-rule identity.
8. Recalculate all prices from the server catalog.
9. Calculate integer-paise costs, expected return cost, payment-cost estimate, contribution profit, and margin.
10. Apply every hard gate in the configured order.
11. Generate discount candidates only for valid merchant-approved triggers.
12. Recalculate and gate each discount candidate independently.
13. Calculate deterministic relevance, compatibility, budget, and intent weights plus documented penalties.
14. Rank eligible candidates with the exact formula and tie-breakers in `profit_policy.json`.
15. Compare the best additional offer with the baseline's minimum profit and score-improvement thresholds.
16. Select the best valid candidate or retain the baseline/no-additional-offer action.
17. Persist every candidate, calculation, rejection, gate result, selection reason, input hash, and version.
18. Produce customer and merchant explanations from the selected structured facts.
19. Return the itemized offer with `order_creation_authorized=false`.

The same normalized intent and versions must produce the same candidate set, economics, gates, scores, tie-breaker, and selection.

## 11. Stable identifiers and hashes

- Use sortable UUIDv7 identifiers internally unless an existing schema requires a prefixed display identifier.
- Generate schema-facing IDs such as `DEC-`, `OFR-`, `ORD-`, `PAYREC-`, `ATT-`, and `EVT-` from stored internal identifiers or deterministic candidate hashes.
- Candidate identity is derived from catalog version, sorted variant/quantity pairs, candidate type, and discount-rule identity.
- Cart identity is a SHA-256 hash of canonical item, quantity, authoritative price, discount, and total fields.
- Intent, decision, payment, and audit payload hashes use canonical JSON with stable object-key ordering.
- Hashes prove equality and tamper evidence; they are not substitutes for authorization.
- Never hash a low-entropy secret and expose the hash. Secrets are excluded entirely.

## 12. LLM implementation contract

### 12.1 Provider choice

The project owner must select one hosted provider based on existing account access and credits before implementation. The backend will expose one internal `IntentProvider` interface so the domain pipeline is not coupled to a provider SDK.

Required provider capability:

- Reliable JSON Schema structured output or equivalent constrained tool calling.
- A model suitable for short English and Hinglish shopping requests.
- Server-side API access and an available test budget.
- Request identifiers or usage metadata for operational audit.

### 12.2 Prompt inputs

The provider receives only:

- The current shopper message.
- A bounded summary of the current cart.
- Public product names, types, routine roles, and allowed IDs needed for matching.
- The `customer_intent_schema` contract.
- Instructions not to diagnose conditions or invent products, prices, budgets, ingredients, or customer traits.

Merchant costs, profit floors, ranking weights, discount caps, payment data, and secrets are never placed in the prompt.

### 12.3 Validation and fallback

1. Enforce request size and timeout limits.
2. Parse only the expected structured result.
3. Validate it with Ajv.
4. Verify every proposed product ID against the pinned catalog.
5. Reject unsupported medical claims or inferred customer attributes.
6. Ask at most one highest-priority clarification when required.
7. If the provider times out or returns malformed output, show a structured product/skin concern/budget form and do not make an offer from unvalidated data.

### 12.4 Explanation generation

The default MVP explanation is a deterministic template built from selected facts and reason codes. An LLM may improve wording only after selection and only from a fact object containing approved product names, public use cases, final customer prices, savings, and safety notes. The backend verifies all identifiers and numeric text; if verification fails, it uses the deterministic template.

## 13. HTTP API surface

All endpoints are versioned under `/api/v1`. Responses carry `request_id`, and mutations require same-origin checks. State-changing customer endpoints use an `Idempotency-Key` header in addition to the signed session cookie.

| Method and route | Access | Purpose | Side effect |
|---|---|---|---|
| `GET /api/v1/health` | Public, minimal | Deployment and dependency health without secrets | None |
| `GET /api/v1/catalog` | Public | Customer-safe product and variant projection | None |
| `GET /api/v1/catalog/agent` | Public | Versioned agent-readable catalog, bundle, and checkout-capability projection | None |
| `POST /api/v1/sessions` | Public | Create pseudonymous shopping session and signed cookie | Session insert |
| `POST /api/v1/recommendations` | Session | Parse intent, run all engines, and return complete customer offer | Decision and audit inserts |
| `GET /api/v1/decisions/{decisionId}` | Owning session | Reload an existing presented decision | None |
| `POST /api/v1/decisions/{decisionId}/confirm` | Owning session, idempotent | Revalidate and record explicit confirmation of exact cart and total | Confirmation, payment-record, and audit transaction |
| `POST /api/v1/payment-records/{recordId}/order` | Owning session, idempotent | Create one Razorpay order after confirmation | Razorpay call and order persistence |
| `POST /api/v1/payment-records/{recordId}/verify` | Owning session, idempotent | Verify Checkout callback using the database order ID | Payment-attempt and audit update |
| `GET /api/v1/payment-records/{recordId}` | Owning session | Poll reconciled order/payment result after redirect or refresh | Optional authenticated Razorpay fetch when stale |
| `POST /api/v1/payment-records/{recordId}/retry` | Owning session, idempotent | Revalidate safe retry conditions and reopen or replace checkout order | Retry and audit update; optional Razorpay order call |
| `POST /api/v1/webhooks/razorpay` | Razorpay signature | Verify raw body, deduplicate event, and update state | Webhook, payment, transition, fulfilment-gate, and audit transaction |
| `GET /api/v1/merchant/decisions/{decisionId}` | Merchant admin | Full candidate, profit, gate, and selection evidence | None |
| `GET /api/v1/merchant/audit/{traceId}` | Merchant admin | Ordered audit timeline | None |
| `GET /api/v1/merchant/metrics` | Merchant admin | Evaluation and accepted-order metrics | None |
| `POST /api/v1/evaluation/runs` | Merchant admin in non-production evaluation mode | Replay versioned scenarios | Evaluation inserts |
| `GET /api/v1/evaluation/runs/{runId}` | Merchant admin | Read evaluation results and exceptions | None |

### 13.1 Public catalog response boundary

The public and agent-readable catalog may expose only the fields allowed by `catalog_manifest.json`. It returns boolean availability rather than exact stock and never returns costs, margins, caps, weights, candidate scores, merchant profit, or policy internals.

### 13.2 Error contract

Client errors contain a stable error code, safe message, request ID, and a boolean indicating whether retry is safe. They never contain stack traces, SQL text, provider prompts, secrets, raw signatures, merchant economics, or detailed Razorpay payloads.

Expected status behavior:

- `400`: malformed or schema-invalid request.
- `401`: missing or invalid session/admin authentication.
- `403`: valid identity without resource ownership or role.
- `404`: inaccessible or absent resource; do not reveal cross-session existence.
- `409`: stale decision, changed cart, duplicate conflict, or illegal state transition.
- `422`: valid request with no safe/eligible action or required clarification.
- `429`: rate limit exceeded.
- `500`: sanitized unexpected internal error.
- `502` or `503`: bounded external provider failure with safe retry guidance.

## 14. Database model

Supabase Postgres is the runtime persistence layer. Catalog CSV/JSON files remain the version-controlled source snapshot and are validated before being seeded or activated.

### 14.1 Catalog and policy tables

| Table | Key contents | Critical constraints |
|---|---|---|
| `catalog_snapshots` | Manifest/catalog versions, hashes, validation state, activation time | One active immutable snapshot per environment |
| `products` | Customer catalog fields and snapshot ID | Unique product ID within snapshot |
| `product_variants` | Price, stock, default, active, snapshot ID | Unique variant; exactly one default active variant per active product |
| `merchant_economics` | Private costs, return estimate, floor, cap | One row per variant; server-only |
| `product_profiles` | Routine/suitability/warning fields | One row per product |
| `compatibility_rules` | Pair, context, direction, priority, action, reason | Unique rule ID; valid product references |
| `bundle_components` | Bundle and component variants, role, order, quantity | Unique bundle/component pair; positive quantity |
| `policy_versions` | Discount/profit JSON, version, hash, activation | Immutable after activation |

### 14.2 Shopping and decision tables

| Table | Key contents | Critical constraints |
|---|---|---|
| `shopping_sessions` | Pseudonymous ID, locale, status, expiry | No direct identity required |
| `conversation_turns` | Role, sanitized summary, raw-message hash, time | Raw customer message not persisted by default |
| `intent_snapshots` | Validated intent JSON, schema version, hash | Immutable |
| `offer_decisions` | Snapshot/policy versions, baseline, selected candidate, status | Complete candidate set required before selected status |
| `offer_candidates` | Type, status, total, score, profit JSON | Unique candidate ID within decision |
| `candidate_lines` | Variant, quantity, authoritative price, discount allocation | Amount reconciliation checks |
| `gate_results` | Gate ID/type/result/reason/input hash | Failed hard gate makes candidate ineligible |
| `carts` | Decision, version, cart hash, totals | Immutable presented versions |
| `cart_items` | Variant, quantity, amounts | Server price only |
| `customer_confirmations` | Cart hash, amount, decision version, time | Exact one active confirmation per cart version |

### 14.3 Payment and audit tables

| Table | Key contents | Critical constraints |
|---|---|---|
| `payment_records` | Internal order, confirmed cart, state, fulfilment gate | One per confirmed checkout intent |
| `razorpay_orders` | Razorpay order ID, receipt, amount, currency, status | Unique Razorpay ID and internal receipt |
| `payment_attempts` | Payment ID, order ID, status, source, callback verification | Unique Razorpay payment ID when present |
| `webhook_events` | Razorpay event ID, payload hash, verification, processing | Unique Razorpay event ID; insert before transition |
| `payment_transitions` | From/to state, trigger, source, applied, time | Append-only legal state transitions |
| `fulfilment_gates` | Confirmation, amount, signature/source, capture, result | Unique authorization; never true twice |
| `audit_events` | Event envelope, sequence, prior hash, event hash | Append-only; unique event ID, trace/sequence, and idempotency key |
| `evaluation_runs` | Versions, start/end, aggregate metrics | Evaluation environment only |
| `evaluation_results` | Scenario, actual, expected, pass/fail, evidence | One result per scenario and run |

### 14.4 Database access policy

- Browser clients have no direct read or write grant to business tables.
- Enable RLS on every exposed-schema table.
- Public catalog is served by server routes from a safe projection.
- Supabase service-role credentials exist only in server environment variables.
- Merchant reads require Supabase Auth plus an application allowlist check.
- Critical multi-table mutations run through project-owned Postgres RPC functions so confirmation, webhook deduplication, state change, fulfilment gate, and audit insert are atomic.
- Security-definer functions must set a safe `search_path`, accept bounded typed inputs, and be executable only by the intended server role.
- Database migrations use a separate migration connection and never run from a customer request.

Official references: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 15. Transaction and concurrency boundaries

### 15.1 Persisting a recommendation

One transaction stores the intent snapshot, complete candidate set, line economics, gates, selected decision, and audit events. A selected decision is never visible without its evidence.

### 15.2 Confirming an offer

One database transaction:

1. Locks the decision/cart version logically.
2. Confirms session ownership and unexpired state.
3. Revalidates catalog snapshot, active variants, stock, prices, discounts, economics, and gates.
4. Compares the recalculated cart hash and total with what the shopper saw.
5. Creates the immutable confirmation and payment record.
6. Marks order creation authorised.
7. Appends audit events.

If an item, price, discount, or total changed, return `409`, show the new cart, and require a new confirmation.

### 15.3 Creating a Razorpay order

Do not keep a database transaction open across the network call.

1. Atomically claim the payment record with the endpoint idempotency key.
2. If a stored Razorpay order already exists for the same valid context, return it.
3. Call Razorpay once with the server amount, INR, unique receipt, and safe internal notes.
4. Persist the returned order ID and response metadata.
5. If the network outcome is ambiguous, mark `order_creation_unknown`, do not open Checkout, and reconcile before another create call.

### 15.4 Applying a webhook

One small transaction:

1. Insert the verified event using the unique Razorpay event ID.
2. If the uniqueness constraint reports a duplicate, record/return duplicate success without a second state change.
3. Lock the matching payment record.
4. Apply only a legal transition based on current state and verified event contents.
5. Reconcile order, amount, currency, payment ID, and capture state.
6. Evaluate the fulfilment gate.
7. Append payment and audit transitions.
8. Commit and return HTTP 200.

No LLM call, email, analytics export, or other heavy work occurs in the webhook request.

## 16. Razorpay integration specification

The implementation follows the official [Standard Checkout guide](https://razorpay.com/docs/developer-tools/integrations/standard-checkout/) and [Orders lifecycle](https://razorpay.com/docs/payments/orders/).

### 16.1 Account and Dashboard prerequisites

- Razorpay account access confirmed.
- Dashboard switched to Test Mode.
- Test Key ID and Key Secret generated.
- Payment capture configured for automatic capture for the demo.
- A webhook secret generated separately from the API Key Secret.
- Stable HTTPS production webhook URL registered.
- Subscribe at minimum to `payment.authorized`, `payment.captured`, `payment.failed`, and `order.paid` if available for the account.
- Record Dashboard settings in the private deployment checklist, not the public repository.

### 16.2 Startup guards

- `RAZORPAY_MODE` must equal `test`.
- Key ID must have the expected Test Mode prefix.
- Missing or apparently live credentials fail startup for payment routes.
- The public browser receives only the Key ID, order ID, amount, currency, display name, and safe checkout fields.
- Key Secret and webhook secret never enter a client bundle, response, error, or log.

### 16.3 Order creation

- Create the order only after exact customer confirmation and server revalidation.
- Amount is an integer in paise and must equal the Checkout amount.
- Currency is `INR`.
- Partial payment is disabled for the MVP.
- Receipt is a unique internal reference within Razorpay's documented limit.
- Notes contain only pseudonymous internal references; no raw shopper message or merchant economics.
- Persist Razorpay order ID, receipt, amount, currency, status, and timestamps.

### 16.4 Checkout

- Load `https://checkout.razorpay.com/v1/checkout.js` directly from Razorpay.
- Open Checkout only from a deliberate shopper action.
- Disable the Pay button during order creation and while the modal is opening.
- Never accept card, CVV, OTP, UPI PIN, or bank credentials in CartPilot UI.
- Handle success callback, modal dismissal, timeout, refresh, and redirect return.

### 16.5 Callback verification

When a browser callback is received:

1. Accept only the payment ID, order ID, and signature fields plus the internal payment-record reference.
2. Load the Razorpay order ID from CartPilot's database.
3. Reject a callback whose order does not match the owning record.
4. Verify HMAC-SHA256 over the database order ID and returned payment ID with the Key Secret.
5. Compare signatures with Node's timing-safe comparison.
6. Store the payment ID and protected signature evidence; never log the signature.
7. Mark the callback verified or failed, but do not authorise fulfilment from the callback alone.

### 16.6 Webhook verification

- Read the request exactly once as raw text before JSON parsing.
- Verify `X-Razorpay-Signature` against the exact raw body using the webhook secret.
- Reject an invalid signature without processing its payload.
- Parse only after signature verification.
- Deduplicate with `x-razorpay-event-id` and the database uniqueness constraint.
- Hash and restrict or redact the stored payload according to `payment_state_schema.json`.
- Return HTTP 200 quickly after the small atomic transaction.

Next.js Route Handlers support reading webhook bodies as text; see the official [Route Handlers documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

### 16.7 Capture and fulfilment

Fulfilment becomes authorised only when all of these are true:

- The exact cart and amount were explicitly confirmed.
- The stored Razorpay order matches the payment record.
- Server amount and currency reconciliation passed.
- Payment status is `captured` and order status is `paid` where applicable.
- Capture was confirmed by a verified webhook or authenticated Razorpay API fetch.
- No previous fulfilment authorization exists.
- The idempotency and audit writes succeeded.

A browser callback is verified whenever it arrives, but its absence does not block a legitimate captured payment established through a signed webhook or authenticated API reconciliation. This allows safe recovery when the shopper closes or refreshes the browser.

### 16.8 Retry and late authorization policy

Razorpay Orders can group multiple payment attempts for one unchanged fulfilment scenario. CartPilot's policy is:

- Reuse the existing unpaid order for a retry only when cart hash, amount, currency, shopper session/context, and fulfilment scenario are unchanged and no associated payment is currently authorized or captured.
- Create a new order after a new confirmation if amount, cart, currency, shopper context, or fulfilment scenario changed.
- Never retry an already paid order.
- If a payment is authorized but not captured, block another attempt and reconcile.
- A previously observed failure is not assumed permanently terminal; process a later valid authorization/capture event.
- If a late authorization conflicts with a replacement order, block fulfilment and require reconciliation/manual review so two payments cannot produce two fulfilments.

### 16.9 Primary failure demo

For a verified `payment.failed` event:

- Keep the order unpaid.
- Keep fulfilment unauthorised.
- Retain the confirmed cart.
- Show a safe, non-technical customer message.
- Offer retry only after checking current order payments and retry eligibility.
- Use the same endpoint idempotency key on repeated client submission.
- Record failure, retained-cart state, retry decision, and later outcome in the audit trail.

## 17. Payment state authority

Use this precedence when sources disagree:

1. Verified webhook plus matching stored order/payment data.
2. Authenticated Razorpay API fetch.
3. Verified Checkout callback for authenticity, but not capture authority.
4. Unverified browser state is never authoritative.

State transitions are monotonic except documented reconciliation transitions such as failed to authorized/captured after late authorization. An older or duplicate event may be stored as evidence but cannot downgrade a captured/paid record or repeat fulfilment.

## 18. Audit implementation

Every material event validates against `schemas/audit_event_schema.json` before insert.

Required event groups:

- Session creation and completion.
- Intent extraction, clarification, schema failure, and provider fallback.
- Catalog filtering and compatibility results.
- Candidate generation and rejection.
- Price, profit, discount, weight, penalty, and score calculations.
- Offer selection or no-valid-offer outcome.
- Cart presentation and customer confirmation/rejection.
- Order authorization, creation, and failure.
- Checkout open/dismiss.
- Callback verification result.
- Webhook receipt, verification, duplicate handling, and transition.
- Capture and fulfilment gate.
- Payment failure, retained cart, retry, late authorization, and recovery.
- Evaluation run and exceptions.

### 18.1 Append-only guarantee

- Normal application roles receive insert/select only on audit events.
- Update and delete are denied.
- Each trace uses an increasing sequence number.
- Each event stores the previous event hash and its own canonical payload hash.
- Idempotency keys and trace/sequence pairs are unique.
- Corrections are new events that reference the incorrect event; history is never rewritten.

### 18.2 Customer and merchant views

Customer view shows safe reasons, selected products, final prices, confirmation, and payment/retry status. Merchant view additionally shows candidate economics, gates, scores, policy versions, rejections, and trace hashes. Neither view exposes secrets, raw signatures, payment credentials, or unnecessary personal data.

## 19. Security and privacy requirements

### 19.1 Secrets

Never commit or expose:

- Razorpay Key Secret.
- Razorpay webhook secret.
- LLM API key.
- Supabase service-role key.
- Database migration credentials.
- Session-cookie secret.
- Audit/IP-hash pepper.
- Vercel, GitHub, or deployment tokens.

The Razorpay Key ID and Supabase publishable key are public identifiers, but they still come from environment configuration rather than source literals.

### 19.2 Session and request security

- Shopper session uses a cryptographically random identifier in an `HttpOnly`, `Secure`, `SameSite=Lax` signed cookie.
- Mutation routes check origin and session ownership.
- Merchant routes require Supabase Auth and an allowlisted email/role.
- Limit JSON request sizes and reject unexpected content types.
- Apply per-session and privacy-preserving per-IP-hash rate limits to session, recommendation, and order routes.
- Hash IPs with a rotating server pepper; do not store raw IPs in audit data.
- Use parameterized database access/RPC only.
- Sanitize all returned and logged errors.

### 19.3 Data minimization

- No customer account is required to shop in the demo.
- Do not request date of birth, gender, caste, religion, income, diagnosis, or payment credentials.
- Store a sanitized request summary and raw-message hash rather than the raw message by default.
- Do not infer wealth, medical conditions, protected traits, or willingness to pay.
- Merchant pricing and discounts never vary using protected or proxy attributes.
- Retention periods must be set before any production use; this test-mode demo must not be presented as a production data-retention design.

### 19.4 Browser policy

- Use HTTPS only on the deployed app.
- Define a restrictive Content Security Policy and test the exact Razorpay domains needed by Standard Checkout.
- Do not self-host or proxy Razorpay Checkout.
- Avoid third-party analytics during the hackathon MVP unless separately approved and privacy-reviewed.
- Never place secret values in `NEXT_PUBLIC_` variables.

## 20. Customer experience specification

### 20.1 Main shopper flow

1. Shopper sees a concise explanation that CartPilot provides catalog guidance, not medical diagnosis.
2. Shopper can browse the customer-safe catalog or ask conversationally.
3. Assistant asks one clarification if the product goal, skin context, routine scope, or budget is materially missing.
4. UI shows one primary offer and clearly labels optional additions.
5. Itemized cart shows each product, size, quantity, original amount, discount, final amount, savings, and relevant usage/safety notes.
6. UI explains why the offer fits and allows the shopper to keep only the baseline.
7. Shopper explicitly confirms the exact cart and total.
8. Shopper deliberately clicks Pay.
9. Razorpay Checkout handles payment credentials.
10. Result page polls server state and recovers after refresh or callback loss.

### 20.2 Required visible states

- Understanding request.
- Clarification required.
- Evaluating catalog.
- Offer ready.
- No safe matching offer.
- Revalidating cart.
- Cart changed; new confirmation required.
- Creating secure checkout.
- Checkout open.
- Payment verification pending.
- Payment captured.
- Payment failed with safe retry.
- Checkout dismissed with retained cart.
- Reconciliation/manual review required.

### 20.3 Merchant dashboard

The protected merchant view contains:

- Session-level baseline and assisted profit.
- Selected offer type and accepted/rejected status.
- Complete candidate table with totals, discounts, profit, scores, and rejection reasons.
- Versioned gate results.
- Payment and webhook timeline.
- Failure and recovery timeline.
- Aggregate evaluation metrics and honest exception list.
- Exportable sanitized audit JSON for one trace.

## 21. Agent-readable catalog endpoint

`GET /api/v1/catalog/agent` strengthens the agentic-commerce direction without claiming ACP, AP2, UAP, or x402 compliance.

It returns:

- Schema and catalog versions.
- Merchant and currency identifiers.
- Active public products and variants.
- Boolean availability.
- Routine roles, supported concerns, and reviewed warnings.
- Prepriced bundle contents.
- Stable product/variant IDs.
- A description of the conversational recommendation and checkout-confirmation endpoints.

It does not return merchant economics, hidden discounts, customer-specific prices, internal compatibility rules, ranking weights, or payment secrets. Any buying agent must still obtain the exact offer, present it to the shopper, and call the same confirmation/payment gates.

## 22. Environment configuration

### 22.1 Server-only required variables

| Variable | Purpose |
|---|---|
| `APP_ENV` | Must be `test` for the hackathon deployment |
| `APP_BASE_URL` | Canonical stable Vercel production URL |
| `CATALOG_VERSION` | Expected active catalog snapshot |
| `SUPABASE_URL` | Hosted Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Data API/RPC access |
| `SUPABASE_DB_URL` | Migration/administrative connection; CI or local migration environment only |
| `RAZORPAY_MODE` | Must be `test` |
| `RAZORPAY_KEY_ID` | Test Key ID; safely projected to Checkout only |
| `RAZORPAY_KEY_SECRET` | Orders API and callback verification |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC verification |
| `LLM_PROVIDER` | Selected provider adapter |
| `LLM_MODEL` | Explicit pinned model identifier |
| `LLM_API_KEY` | Provider credential |
| `LLM_TIMEOUT_MS` | Bounded request timeout |
| `SESSION_COOKIE_SECRET` | Shopper session signing |
| `AUDIT_HASH_PEPPER` | Privacy-preserving operational hashes where required |
| `MERCHANT_ADMIN_EMAILS` | Allowlisted merchant users |
| `RECONCILIATION_CRON_SECRET` | Protect optional scheduled reconciliation endpoint |

### 22.2 Browser-safe variables

Avoid browser environment variables where a server response can supply safe configuration. If Supabase Auth requires the publishable key in the browser, expose only the project URL and publishable key. Never expose service-role, database, Razorpay secret, webhook secret, LLM key, session secret, or audit pepper values.

### 22.3 Local files

- Commit a `.env.example` containing names and safe descriptions only.
- Ignore `.env`, `.env.local`, platform pull files containing secrets, and generated credential exports.
- Use distinct local, preview, and production-demo credentials.
- All Razorpay environments remain Test Mode until a separate future production authorization.

## 23. Deployment plan

### 23.1 Account setup

1. Confirm GitHub, Vercel, Supabase, Razorpay, and LLM-provider access.
2. Create one GitHub repository.
3. Create one Supabase project in an India-near region available to the account.
4. Create one Vercel project linked to the repository.
5. Choose a Vercel function region close to Supabase when supported.
6. Configure Node.js 24.x.
7. Store environment variables separately for local, preview, and production-demo use.
8. Configure only the stable production URL as the Razorpay webhook endpoint.

Vercel supports Node.js functions and environment variables; see [Vercel runtimes](https://vercel.com/docs/functions/runtimes) and [environment variables](https://vercel.com/docs/environment-variables).

### 23.2 Database deployment

1. Start local Supabase or a disposable development database.
2. Apply versioned migrations.
3. Run the manifest validation/import process.
4. Assert expected counts, keys, references, prices, and policy alignment.
5. Activate the immutable snapshot.
6. Apply migrations to hosted Supabase before deploying application routes that depend on them.
7. Use backward-compatible migrations so a Vercel rollback remains possible.

### 23.3 Vercel release

1. Run format, lint, typecheck, unit, contract, integration, evaluation, and build checks.
2. Run secret scanning and verify the catalog manifest.
3. Deploy a preview using Test Mode and non-production data.
4. Execute shopper, merchant, success, failure, refresh, and duplicate-webhook tests.
5. Promote the verified commit to the stable production-demo URL.
6. Update the Razorpay Test webhook URL and verify a signed delivery.
7. Record deployment commit, dependency versions, schema versions, catalog hash, and configuration versions.

### 23.4 Rollback

- Roll back to the previous healthy Vercel deployment.
- Keep database migrations backward-compatible for at least one release.
- Never roll back audit or payment records destructively.
- If catalog activation fails, retain the last valid immutable snapshot.
- Disable order creation through an environment kill switch if payment correctness is uncertain.

## 24. Observability

Every server log is structured and contains only safe operational fields:

- Timestamp, severity, environment, component, version.
- Request ID, trace ID, session pseudonym, decision ID, internal order ID, and payment-record ID where applicable.
- Event name, outcome, duration, retry count, and stable reason codes.
- Catalog, schema, and policy versions.
- Razorpay order/payment/event identifiers only where operationally required and access-restricted.

Never log:

- API or webhook secrets.
- Raw payment or webhook signatures.
- Card, CVV, OTP, UPI PIN, bank, or wallet credentials.
- Supabase service-role key or database URL.
- LLM API key or full prompt containing raw customer text.
- Raw customer email, phone, or IP.
- Merchant economics in customer-visible logs.

Minimum operational metrics:

- Recommendation latency and failure rate.
- LLM schema-valid response rate and fallback rate.
- Candidate counts and hard-gate rejection counts.
- Offer type and acceptance rate.
- Estimated baseline and selected contribution profit.
- Order creation success/failure/unknown rate.
- Callback verification failures.
- Webhook verification, duplicate, and processing rates.
- Captured, failed, late-authorization, and recovery counts.
- Percentage of money actions with a complete audit chain.

## 25. Testing strategy

### 25.1 Unit tests

Pure tests cover:

- Catalog parsing and normalization.
- Product/variant eligibility.
- Compatibility directionality, priority, context, and safety actions.
- Bundle construction and deduplication.
- Discount allocation and remainder rules.
- Integer-paise pricing arithmetic.
- Expected return and payment-cost estimates.
- Contribution-profit and margin formulas.
- Variant and cart floors.
- Ranking weights, penalties, score rounding, and every tie-breaker.
- Budget, cross-sell, discount, and confirmation gates.
- Stable identifiers and canonical hashes.
- Legal and illegal state transitions.

### 25.2 Contract tests

- All JSON schemas parse as Draft 2020-12.
- Every bundled schema example validates.
- LLM output rejects additional or malformed fields.
- Offer decision contains baseline, complete candidates, versions, and audit hashes.
- Payment state rejects fulfilment without verified capture.
- Payment state allows signed-webhook/API recovery when the browser callback is absent.
- Audit events reject secrets and illegal failure/fulfilment combinations.
- Catalog manifest checksums, headers, row counts, keys, joins, and policy alignment pass.

### 25.3 Integration tests

- Catalog snapshot import and atomic activation.
- Complete recommendation persistence transaction.
- Stale cart confirmation conflict.
- Duplicate confirmation and order endpoint idempotency.
- Mocked Razorpay order success, validation error, timeout, and ambiguous response.
- Callback HMAC success and failure using database order identity.
- Raw-body webhook HMAC success and failure.
- Duplicate and out-of-order webhook handling.
- Captured payment authorises fulfilment once.
- Failed payment retains cart and never fulfils.
- Browser callback absent plus verified captured webhook recovers correctly.
- Late authorization produces reconciliation instead of duplicate fulfilment.
- RLS and merchant-allowlist access tests.

### 25.4 Evaluation tests

Replay all thirty-five rows in `catalog/evaluation_scenarios.csv` against a frozen validated intent fixture and catalog snapshot. Report actual versus expected action, products, offer, discount, safety action, reason code, payment state, and all exceptions.

Required aggregate assertions:

- Identical inputs and versions produce identical commercial decisions.
- All selected variants exist and are active.
- No selected candidate contains a blocked compatibility rule.
- All prices come from the server catalog.
- All discounts come from the approved ladder and pass caps/floors.
- Every created order has a preceding exact confirmation.
- Every fulfilment authorization has captured server-side evidence.
- Duplicate webhooks never create duplicate transitions or fulfilments.

### 25.5 End-to-end and manual payment tests

- Customer recommendation and baseline choice.
- Compatible bundle/cross-sell selection.
- Discount trigger and no-unnecessary-discount case.
- Clarification and no-valid-offer flows.
- Merchant audit timeline.
- Razorpay Test success.
- Razorpay Test failure.
- Modal dismissal.
- Browser refresh/close after payment.
- Repeated Pay click.
- Webhook replay.
- Mobile layout.

Use Razorpay's documented Test Mode instruments and mocked bank success/failure controls. No live payment is part of MVP acceptance.

## 26. CI and quality gates

Every pull request and release commit must run:

1. Formatting check.
2. ESLint.
3. TypeScript typecheck.
4. JSON parsing and JSON Schema meta/contract validation.
5. Catalog manifest checksum and relationship validation.
6. Unit tests.
7. Integration tests with an isolated database.
8. Thirty-five-scenario deterministic evaluation.
9. Next.js production build.
10. Dependency and secret scan.
11. Check that no live Razorpay key pattern exists.
12. Check that no forbidden raw credential field appears in logs, fixtures, or public responses.

A failing money, schema, catalog, compatibility, discount, state, signature, idempotency, or secret test blocks deployment.

## 27. Original implementation phases and current upgrade mapping

The phases below preserve the original implementation plan. The baseline application now exists. Post-audit work follows the numbered upgrade programme in `HACKATHON_REQUIREMENTS.md`, beginning with the completed story and governance freeze and then commercial-policy correctness.

### Phase 0 — Owner approval and resources

Tasks:

- Approve the current catalog and synthetic economics for the demo.
- Decide how the draft skincare-review warning will be presented.
- Select the LLM provider and confirm credits.
- Confirm Razorpay Test, Supabase, Vercel, and GitHub access.
- Approve shopper and merchant wireframes.
- Explicitly authorise implementation.

Exit: every resource gate in Section 29 is answered.

### Phase 1 — Scaffold and contracts

Tasks:

- Create the Next.js TypeScript application after the scheduled security patch check.
- Establish strict compiler, lint, test, and environment validation.
- Add schema validators and typed domain contracts.
- Add CI without external payment calls.

Exit: clean production build and schema examples validate.

### Phase 2 — Catalog snapshot and persistence

Tasks:

- Create migrations and RLS.
- Implement manifest validation and import.
- Activate immutable catalog/policy snapshot.
- Build public and merchant-private data adapters.

Exit: all manifest constraints pass and no private field appears in public projections.

### Phase 3 — Pure commercial engines

Tasks:

- Implement eligibility, compatibility, bundle, pricing, profit, discount, policy, and offer engines.
- Reproduce the worked profit-policy example exactly.
- Replay catalog evaluation scenarios using frozen intent inputs.

Exit: all pure-engine invariants and expected scenarios pass deterministically.

### Phase 4 — LLM and customer recommendation

Tasks:

- Implement provider adapter, prompt versioning, schema validation, timeout, and fallback.
- Implement recommendation route and customer UI.
- Implement deterministic explanations and optional validated LLM wording.
- Persist complete decision and audit events.

Exit: conversational flow cannot bypass any catalog or commercial rule.

### Phase 5 — Confirmation and Razorpay

Tasks:

- Implement exact-cart revalidation and confirmation transaction.
- Implement order creation idempotency and ambiguous-result handling.
- Integrate Standard Checkout.
- Implement callback and webhook verification.
- Implement state machine, capture gate, retry, late authorization, and reconciliation.

Exit: one successful and one failed Test Mode payment meet all state and audit invariants.

### Phase 6 — Merchant dashboard and metrics

Tasks:

- Add Supabase Auth and merchant allowlist.
- Build candidate/economics/gate and payment timelines.
- Build evaluation metrics and exception reporting.
- Add sanitized audit export.

Exit: a reviewer can reconstruct the selected decision and payment outcome.

### Phase 7 — Deployment and submission

Tasks:

- Deploy to Vercel and configure stable webhook.
- Execute full release checklist and manual payment cases.
- Complete README, architecture, limitations, setup, and demo instructions.
- Record five-minute pitch video.
- Verify public repository and deployed app contain no secrets.

Exit: all MVP definition-of-done items pass on the deployed URL.

## 28. Demo acceptance script

### Successful flow

1. Shopper asks for a toner for a stated skin type/concern and budget.
2. CartPilot extracts structured intent.
3. Backend shows baseline, compatible routine candidates, rejections, profit, and selected offer.
4. UI explains each selected item and labels the optional addition.
5. Shopper confirms the exact cart.
6. Shopper opens Razorpay Test Checkout and completes payment.
7. Callback is verified when received.
8. Signed webhook confirms capture.
9. Customer sees captured result; merchant sees full audit and profit uplift.

### Failure and recovery flow

1. Shopper confirms a cart and opens Test Checkout.
2. Payment is failed using a Razorpay test control.
3. Order remains unpaid and fulfilment remains blocked.
4. Cart remains visible with a safe retry option.
5. Merchant timeline shows verified failure and recovery decision.
6. Retry succeeds or is safely blocked pending reconciliation.
7. No duplicate fulfilment can occur.

## 29. Remaining owner/resource gates

Application implementation is authorised. Submission release remains blocked until the project owner supplies or approves:

- [ ] Explicit approval of the forty-product demo catalog.
- [ ] Explicit approval that merchant economics and policies are synthetic demo assumptions.
- [ ] Decision on whether expert review will occur before submission or the UI will prominently label the skincare data as demo catalog guidance.
- [ ] Selected LLM provider, model, account access, and spending limit.
- [ ] Razorpay account with Test Mode, Test Key ID, Key Secret, and webhook-secret access.
- [ ] Supabase account/project access.
- [ ] Vercel account access.
- [ ] GitHub account/repository access.
- [ ] Merchant-admin email for the protected dashboard.
- [ ] Approved shopper and merchant UI wireframes.
- [ ] Confirmed buildathon application deadline and eligibility.
- [x] Explicit instruction to begin the Phase 1 hackathon-readiness upgrade and deliver it to GitHub.
- [x] Explicit instruction to implement Phase 2 commercial-policy correctness and deliver it to GitHub.

Secrets must be entered privately into local/Vercel/Supabase configuration and never pasted into a tracked planning or source file.

## 30. MVP non-goals

- Live Razorpay payments.
- Refund, payout, subscription, settlement, dispute, or chargeback automation.
- Real inventory reservation, warehouse fulfilment, or shipping.
- Medical diagnosis or treatment.
- Unrestricted dynamic pricing.
- Customer-specific hidden base prices.
- A trained conversion model without genuine labelled data.
- Autonomous marketing campaigns.
- WhatsApp, email, or voice outreach.
- Full ACP, AP2, UAP, or x402 implementation.
- Multiple merchants or currencies.
- A vector database or complex agent orchestration.

## 31. Definition of implementation readiness

Planning is ready for implementation only when:

- This specification and all catalog/schema files are approved.
- The manifest validates and the catalog snapshot is internally consistent.
- Required accounts are accessible.
- The LLM provider is selected.
- Test credentials are stored privately.
- Wireframes and customer wording boundaries are approved.
- The dependency security patch check is complete.
- The project owner explicitly authorises application coding.

Until then, the correct next action is resource confirmation and design review, not code creation.

## 32. Official implementation references

- [Razorpay AI Buildathon](https://razorpay.com/buildathon/)
- [Razorpay Standard Checkout](https://razorpay.com/docs/developer-tools/integrations/standard-checkout/)
- [Razorpay Orders](https://razorpay.com/docs/payments/orders/)
- [Razorpay Node.js integration](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/?preferred-country=IN)
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
- [Official Razorpay Node SDK package](https://www.npmjs.com/package/razorpay)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Supabase Postgres](https://supabase.com/docs/guides/database/overview)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
