# CartPilot — Product and Build Plan

Status: Profit strategy and skincare domain approved; catalog design is the next planning gate. Application coding is not authorised yet.

Date: 24 August 2026

## 1. Project decision

- Track: 01 — AI Growth & Agentic Commerce
- Route: Grow a merchant's contribution profit using Razorpay test-mode APIs
- Working title: CartPilot
- Merchant category: Skincare
- One-line concept: An AI skincare sales concierge that understands a shopper's routine needs, generates compatible product and bundle candidates, selects the most profitable valid offer through a deterministic backend engine, obtains explicit approval, and completes a Razorpay test payment with a full audit trail.
- Offer-selection rule: Offers are never chosen randomly. The backend compares all eligible actions and deterministically selects the highest-scoring profit-positive action that passes relevance, compatibility, budget, margin, discount, inventory, and safety checks.

## 2. Problem statement

Skincare stores often force customers to browse products individually even though skincare is used as a routine. A shopper who searches for a toner may also need a compatible face wash, moisturizer, or sunscreen, but recommending unsuitable products can reduce trust and increase returns.

CartPilot should help a customer build a compatible routine while maximizing the merchant's contribution profit rather than revenue or average order value alone. The AI may interpret needs and explain recommendations, but custom deterministic backend engines must control catalog eligibility, compatibility, bundle construction, profit calculation, discounting, pricing, order creation, and payment state.

## 3. Target users

### Primary customer

A shopper who knows their need and budget but does not know which products to select.

### Merchant user

A small online merchant who wants higher cart value without unsafe or manipulative AI behavior.

### Confirmed demo merchant

A fictional skincare store with 15–25 products across cleansing, toning, treatment, moisturizing, sun protection, and optional exfoliation. The catalog will support routine completion, complementary cross-selling, substitutes, incompatibilities, margins, inventory, and bounded discount rules.

## 4. Product hypothesis

If a shopper can describe a desired product, skin type, concern, and budget conversationally, then CartPilot can complete the shopper's routine with compatible products and choose a profit-positive bundle or discount without exceeding the shopper's constraints or taking an ungated money action.

The primary business hypothesis is that margin-aware routine completion will increase estimated contribution profit per shopping session compared with a product-only baseline. Revenue and average order value remain supporting metrics, not the optimization target.

## 5. Primary user journey

1. The shopper requests a product or describes a skincare goal and budget.
2. The assistant extracts the requested product, skin type, concern, preferences, exclusions, and budget.
3. The assistant asks only the minimum clarification needed for a safe catalog match.
4. The catalog engine finds eligible products and missing routine steps.
5. The compatibility engine finds complements, substitutes, and conflicts.
6. The bundle engine creates valid candidate carts such as product-only, routine bundle, cross-sell, cheaper alternative, and allowed discounted bundle.
7. The profit engine calculates unit economics and deterministically ranks the candidates.
8. The policy engine rejects invalid SKUs, incompatible items, insufficient margins, excessive discounts, unavailable inventory, and budget violations.
9. The assistant presents the best valid recommendation and explains each item and offer.
10. The shopper explicitly confirms the exact cart and amount.
11. The server creates a Razorpay test-mode order.
12. Razorpay Standard Checkout opens after the user action.
13. The server verifies the returned payment signature.
14. A signed Razorpay webhook confirms the authoritative payment state.
15. The shopper sees the result and the merchant sees the complete decision, profit, and payment audit timeline.

## 6. Functional requirements

### Customer experience

- Accept a natural-language shopping request.
- Capture requested product, skin type, skincare concern, budget, preferences, and exclusions when relevant.
- Recommend only catalog products.
- Recommend compatible products that complete missing routine steps.
- Distinguish complementary items from substitute or similar items.
- Explain the skincare role and commercial offer for every recommendation.
- Clearly label the optional cross-sell.
- Show whether the selected action is product-only, bundle, cross-sell, alternative, or bounded discount.
- Display the exact server-calculated subtotal, discount, and final total.
- Require an explicit confirmation action before creating a Razorpay order.
- Launch Razorpay Standard Checkout in Test Mode.
- Show pending, paid, and failed states accurately.
- Allow a safe retry after a failed test payment.

### Merchant experience

- Display catalog items used by the agent.
- Show assisted sessions, carts, and payments.
- Display an event-by-event audit timeline.
- Show product cost, selling price, discount cost, contribution margin, and the winning offer's profit calculation.
- Show baseline and assisted profit metrics.
- Show failed or blocked agent actions.
- Show why a recommendation or money action was allowed or blocked.
- Allow merchant rules such as minimum margin, discount ladder, bundle eligibility, inventory limits, and product compatibility to be inspected.

### AI behavior

- Convert customer intent into structured skin type, concern, requested product, routine step, preferences, exclusions, and budget fields.
- Use supplied catalog data rather than model memory for products or prices.
- Help produce relevance-ranked product and routine candidates.
- Explain recommendations in concise customer-facing language without making medical or treatment claims.
- Never decide whether payment is successful.
- Never select a final offer by itself.
- Never alter prices, invent discounts, or create unrestricted payment actions.
- Never override catalog incompatibilities, product warnings, merchant margin floors, or customer exclusions.
- Return a safe fallback when the model or provider fails.

## 7. Backend implementation contract

All business-decision engines listed below must be designed and implemented inside this project's own backend by Codex. No external recommendation SaaS, discount-optimization service, opaque agent framework, or random offer generator will make the merchant's decisions.

External infrastructure is limited to the hosted LLM API, Razorpay Test Mode, Supabase Postgres, and Vercel. The LLM provides language understanding and explanation; our backend owns the commercial logic and final authorization.

### Engines that must be built in the repository

1. **Intent extraction engine** — validates the LLM's structured interpretation of the shopper's request.
2. **Catalog eligibility engine** — filters inactive, unavailable, unsuitable, or excluded SKUs.
3. **Skincare compatibility engine** — evaluates routine steps, complementary relationships, substitutes, conflicts, usage warnings, and exclusions.
4. **Bundle generation engine** — creates valid product-only, routine, cross-sell, substitute, threshold, and discounted-bundle candidates.
5. **Pricing and cart engine** — obtains authoritative prices and calculates subtotals, discounts, taxes if applicable, and final totals.
6. **Contribution-profit engine** — calculates margin and the economic result of every candidate.
7. **Offer-selection engine** — deterministically ranks eligible candidates and selects the best profit-positive offer.
8. **Dynamic-discount engine** — evaluates only merchant-approved discount levels and applies a discount only when it improves the valid offer decision.
9. **Policy and safety engine** — enforces budget, stock, compatibility, price floor, margin floor, discount cap, non-stacking, test-mode, and approval rules.
10. **Checkout orchestration engine** — creates Razorpay orders only after authorization and verifies payment and webhook signatures.
11. **Audit engine** — records inputs, candidates, calculations, rejections, approvals, payment state, and recovery events.
12. **Evaluation engine** — replays documented scenarios, compares the selected offer with the baseline, and calculates profit and safety metrics.

### Planned backend module boundaries

The eventual repository should keep these concerns separate so each engine can be tested without the UI, database, LLM, or Razorpay network call:

- `domain/intent` — validated shopper-intent schema and normalization.
- `domain/catalog` — catalog queries and eligibility filters.
- `domain/compatibility` — skincare relationship and warning evaluation.
- `domain/bundles` — candidate-cart construction.
- `domain/pricing` — authoritative cart arithmetic.
- `domain/profit` — unit economics and profit breakdowns.
- `domain/discounts` — approved discount candidates and eligibility.
- `domain/offers` — deterministic candidate ranking and selection.
- `domain/policies` — hard commercial and safety gates.
- `payments/razorpay` — order creation, verification, webhook handling, and idempotency.
- `audit` — append-only decision and payment events.
- `evaluation` — scenario replay and metric calculation.

Exact paths may change during architecture approval, but the separation of responsibilities must remain.

### Required engine contracts

- Inputs and outputs must use validated typed schemas.
- Pure commercial engines must not perform database or network side effects.
- Each rejection must return a stable machine-readable reason code and human-readable explanation.
- Every offer decision must return the selected candidate, baseline candidate, all evaluated candidates, profit breakdowns, scores, applied rules, catalog version, configuration version, and formula version.
- Pricing and profit amounts must use integer minor currency units rather than floating-point arithmetic.
- The UI must not calculate authoritative prices or call Razorpay using secret credentials.
- LLM output is untrusted input and must pass schema, catalog, compatibility, and policy validation.
- Side-effecting checkout operations must use idempotency controls and must be invoked only after the pure decision pipeline succeeds and the customer approves.
- Configuration changes affecting price, cost, compatibility, discounting, or ranking must be versioned so historical decisions remain reconstructable.

### Determinism requirement

Given the same catalog version, merchant rules, shopper constraints, and validated model output, the commercial engines must select the same offer. Randomness must not decide which customer receives which offer. Any future experiment assignment must be isolated, disclosed, reproducible, and must not bypass the policy engine.

### Machine-learning decision

- The MVP will not contain a separately trained offer-acceptance ML model because genuine labelled merchant interaction data is not yet available.
- We will not train on invented data and present the result as a real conversion predictor.
- The hosted LLM is used for intent understanding, semantic relevance, and natural-language explanations.
- Offer selection is performed by the custom deterministic profit and policy engines.
- The system will log consent-safe interaction outcomes so a later version can train and validate a calibrated acceptance model on genuine data.
- A future acceptance model may estimate purchase probability, but it will only supply a score. It will never bypass the deterministic profit, compatibility, discount, approval, or payment rules.

## 8. Offer decision specification

### Candidate actions

For each shopper state, the backend must compare every applicable candidate type:

- Requested product only with no incentive.
- Requested product plus one complementary cross-sell.
- Complete or partial routine bundle.
- Lower-priced compatible substitute.
- Higher-margin compatible substitute when customer value is not reduced.
- Merchant-approved threshold incentive.
- Merchant-approved bundle discount.
- No additional offer.

### Contribution-profit calculation

For a candidate cart:

```text
contribution_profit =
  sum(selling_price - product_cost)
  - discount_cost
  - estimated_payment_cost
  - merchant_funded_fulfilment_cost
  - expected_return_cost
  - incentive_cost
```

Amounts used in the calculation must come from merchant-controlled data or clearly labelled configuration. Razorpay Test Mode does not itself provide real merchant unit economics.

### MVP ranking score

Until genuine interaction data supports a calibrated purchase-probability model, candidates will be ranked by a transparent deterministic score:

```text
offer_score =
  contribution_profit
  × relevance_weight
  × compatibility_weight
  × budget_fit_weight
  × intent_weight
  - friction_penalty
  - risk_penalty
```

The weights are documented merchant configuration, not hidden learned values. The system must not describe this score as a statistically calibrated probability.

### Selection algorithm

1. Establish a baseline candidate: the requested product or the safest suitable match with no incentive.
2. Build eligible product, cross-sell, bundle, substitute, and discount candidates.
3. Remove candidates containing invalid, incompatible, unavailable, or excluded products.
4. Calculate authoritative cart totals and contribution profit.
5. Reject candidates below price floors, margin floors, budget rules, or discount limits.
6. Calculate the deterministic ranking score for every remaining candidate.
7. Compare the highest-scoring action with the baseline and no-additional-offer action.
8. Select an additional offer only when it clears the configured minimum score and profit-improvement threshold.
9. Record the winning and rejected candidates with reason codes.
10. Explain the winning offer and require explicit customer confirmation before order creation.

### Dynamic-discount triggers

A discount candidate may be generated only when at least one allowed trigger is present, such as:

- The customer explicitly states a price objection.
- A compatible routine is slightly above the stated budget.
- The customer removes an item because of price.
- A predefined merchant campaign applies.
- A bundle remains above all margin floors after an approved incentive.

The discount engine must first compare no discount, a lower-priced substitute, a smaller routine, and a cross-sell without discount. It must not offer a discount when the un-discounted action already wins or when the discount reduces expected merchant value below the configured threshold.

### Example decision for a toner request

1. The shopper asks for a toner.
2. The intent engine obtains skin type, concern, budget, and exclusions if needed.
3. The catalog engine finds suitable toners.
4. The compatibility engine identifies missing cleansing, moisturizing, and daytime protection steps.
5. The bundle engine creates candidates such as toner-only, toner plus face wash, a basic routine, and a discounted routine.
6. The profit engine ranks the valid candidates.
7. A scrub or exfoliating item is considered only when the catalog marks it suitable for the shopper's stated context; it is never automatically attached to every toner.
8. The customer sees the best valid recommendation, compatibility explanation, savings if any, and final amount before approval.

## 9. Money-action and skincare safety policy

### Explainable

Every recommendation and order-related action records a human-readable reason, the inputs used, candidate offers considered, unit-economics calculation, rejection reasons, winning score, and applied policy checks.

### Bounded

- One merchant and INR only.
- Only active catalog SKUs can enter a cart.
- Database prices are authoritative.
- Database product costs and merchant rules are authoritative for profit calculations.
- The final total is calculated on the server.
- The total cannot exceed the customer's stated budget unless the customer explicitly accepts the new amount.
- At most one cross-sell is proposed per recommendation cycle.
- Any demo discount must come from a predefined ladder and respect SKU, cart, margin, and campaign limits.
- Discounts cannot stack unless a merchant rule explicitly permits it.
- No product can be sold below its configured price or contribution-margin floor.
- Test Mode only; no live payment keys.

### Gated

- Product recommendations do not create an order.
- The customer must see the final itemized cart.
- Original price, discount amount, final price, and offer conditions must be visible.
- A clear confirmation action is required before order creation.
- Checkout opens only after a deliberate user action.
- Fulfilment cannot be marked complete until the payment is verified and confirmed captured.

### Audited

Record at minimum:

- Session identifier and timestamps.
- Customer request and extracted constraints.
- Catalog version or product identifiers considered.
- Model proposal and explanation.
- All candidate carts and offer types considered.
- Contribution-profit inputs, formula version, weights, and calculated results.
- Policy checks and their results.
- Customer acceptance or rejection.
- Server-calculated cart and total.
- Razorpay order identifier.
- Payment verification outcome.
- Webhook event identifier and processing outcome.
- Failure and recovery events.

### Skincare suitability boundary

- CartPilot provides catalog guidance, not medical diagnosis or treatment.
- Recommendations use merchant-supplied product attributes, compatibility, exclusions, and warnings.
- Products associated with exfoliation or scrubbing are optional and must not be added automatically to every routine.
- The system must avoid a product when the shopper reports a catalog-listed incompatibility or exclusion.
- When the available information is insufficient, the system asks a clarification or recommends professional advice rather than inventing certainty.
- Product explanations must not introduce unsupported health claims.

### Fair-offer boundary

- The system must not use protected or sensitive characteristics to set prices or discounts.
- The same validated inputs and merchant rules produce the same commercial decision.
- Base prices remain catalog-controlled; the system can apply only transparent, eligible incentives.
- Artificial scarcity, fabricated urgency, and hidden fees are prohibited.

## 10. Scope boundaries

### Must have

- One fictional merchant.
- A structured skincare catalog of 15–25 products.
- Conversational product, routine, skin type, concern, exclusion, and budget capture.
- Routine-step, complementary, substitute, and incompatibility relationships.
- Explainable and compatibility-checked bundle recommendation.
- One optional cross-sell.
- Deterministic offer selection with no random commercial decisions.
- Custom catalog, compatibility, bundle, profit, discount, policy, checkout, audit, and evaluation engines.
- Deterministic catalog, price, cost, margin, discount, inventory, and budget validation.
- A merchant-configured discount ladder and minimum profit rules.
- Explicit checkout approval.
- Real Razorpay Test Mode Orders API call.
- Razorpay Standard Checkout.
- Server-side payment signature verification.
- Signed webhook handling.
- Payment failure and safe retry.
- Merchant audit view.
- Contribution-profit, revenue, and safety metrics.

### Nice to have after the complete MVP

- Hinglish conversation.
- Multiple customer personas.
- Merchant-configurable cross-sell rules.
- Inventory-aware campaign bonuses.
- A genuine-data-trained offer-acceptance model after sufficient interaction data exists.
- Reproducible recommendation comparison or A/B mode that remains separate from offer selection.
- Exportable audit record.
- Agent-readable catalog endpoint.

### Out of scope for the submission MVP

- Live payments or real customer data.
- Multiple merchants.
- Autonomous refunds, payouts, or subscriptions.
- AI-generated prices or unrestricted discounts.
- Inventory fulfilment and shipping.
- WhatsApp, email, or voice campaigns.
- Full ACP, AP2, x402, or UAP protocol implementation.
- Complex multi-agent orchestration.
- Third-party recommendation or dynamic-pricing engines.
- A trained conversion model based only on invented data.
- Vector database unless catalog search quality proves it is necessary.

## 11. Proposed technical stack

- Language: TypeScript
- Runtime: Node.js 22.2 or newer
- Web application: Next.js, using the Node.js server runtime for payment endpoints
- Payment SDK: Official Razorpay Node.js SDK
- Payment flow: Orders API, Standard Checkout, payment verification, and webhooks
- Database: Supabase Postgres
- Hosting: Vercel
- Repository: GitHub
- AI provider: Hosted LLM API selected after access and credit review; it must support reliable structured output or tool calling
- Backend decision engines: Custom TypeScript modules implemented and tested inside this repository
- Recommendation/agent framework: None required for the MVP; business logic remains explicit and inspectable
- Monitoring for MVP: Structured application logs plus the database audit-event table

## 12. Logical architecture

Customer interface
→ hosted LLM for structured intent and explanation
→ intent validation engine
→ catalog eligibility and skincare compatibility engines
→ bundle candidate generator
→ contribution-profit and discount engines
→ deterministic offer selector
→ policy and safety gate
→ itemized cart and customer confirmation
→ server-side Razorpay order creation
→ Razorpay Standard Checkout
→ payment signature verification
→ webhook confirmation
→ audit store and merchant dashboard

The LLM interprets and explains. Our backend generates, calculates, selects, and authorizes. Razorpay processes the test payment. The webhook-confirmed state controls fulfilment.

## 13. Catalog design requirements

The detailed catalog will be designed in the next planning discussion. At minimum, every product record must be capable of storing:

- SKU, product name, brand, description, and active status.
- Product type and routine step: cleanse, tone, treat, moisturize, protect, or exfoliate.
- Selling price, product cost, estimated variable cost, and minimum allowed price.
- Minimum contribution margin and maximum discount.
- Inventory quantity, availability status, and optional inventory-priority value.
- Supported skin types and concerns.
- Excluded skin types, concerns, sensitivities, or merchant warnings.
- Key ingredients and customer-facing usage notes.
- Complementary product relationships.
- Substitute product relationships.
- Conflict or incompatibility relationships.
- Routine ordering and required or optional step relationships.
- Bundle eligibility and approved bundle identifiers.
- Expected return-rate estimate and return-cost estimate when available.
- Source and last-review timestamp for compatibility and warning data.

The catalog must support relation types such as `complements`, `substitutes`, `conflicts_with`, `used_before`, `used_after`, and `optional_with`. These relationships are merchant-controlled structured data; the LLM cannot invent them.

## 14. Planned data entities

- Merchant
- Product and product economics
- Product compatibility and relationship
- Bundle rule and bundle candidate
- Discount ladder and discount eligibility rule
- Customer session
- Customer constraints
- Recommendation proposal
- Offer candidate and deterministic score
- Cart and cart items
- Policy decision
- Customer approval
- Razorpay order reference
- Payment reference and status
- Webhook event receipt
- Audit event
- Evaluation run and metric result

No real card, bank, or UPI credentials will be stored.

## 15. External resources and account checklist

### Local readiness audit — 24 August 2026

- The ordinary terminal PATH does not currently expose `node`, `npm`, `git`, or `gh`.
- The Codex workspace runtime provides Node.js 24.19.0, pnpm 11.19.0, and Git 2.53.0.
- Node.js therefore satisfies Razorpay's documented minimum of 22.2 for the planned Node SDK.
- GitHub CLI is not required for the application, but GitHub account/repository access must be confirmed before submission.
- Before implementation, we will choose either the bundled runtime or a normal system installation and use that choice consistently.

### Required before implementation

- [ ] Confirm current student eligibility.
- [ ] Confirm ability to work in person in Bangalore from September if selected.
- [ ] Open the official application form and record the submission deadline.
- [ ] Razorpay account is accessible.
- [ ] Razorpay Test Mode is available.
- [ ] Test Key ID and Key Secret have been generated and stored privately.
- [ ] GitHub account is accessible.
- [ ] Vercel account is accessible.
- [ ] Supabase account is accessible.
- [ ] An LLM API provider and available credits have been selected.
- [ ] A screen-recording method is available.

### Secrets that must never be committed

- Razorpay Key Secret
- Razorpay webhook secret
- LLM API key
- Database service credentials
- Any deployment or authentication token

### Official Razorpay references

- Buildathon: https://razorpay.com/buildathon/
- API authentication: https://razorpay.com/docs/api/authentication/
- Orders API: https://razorpay.com/docs/api/orders/
- Standard Checkout: https://razorpay.com/docs/developer-tools/integrations/standard-checkout/
- Webhooks: https://razorpay.com/docs/webhooks/
- Webhook validation and testing: https://razorpay.com/docs/webhooks/validate-test/
- Node.js SDK: https://razorpay.com/docs/payments/server-integration/nodejs/?preferred-country=IN

## 16. Evaluation plan

### Primary business metric

Estimated contribution profit per shopping session, compared with a product-only, no-incentive baseline across the same documented shopper scenarios.

Completed test orders will also report realized estimated contribution profit using the merchant-configured unit economics. Model or heuristic scores must never be reported as actual profit or calibrated conversion probability.

### Supporting metrics

- Estimated contribution profit per completed order.
- Contribution-profit uplift against the baseline.
- Gross-margin percentage.
- Revenue and average order value as secondary metrics.
- Bundle acceptance rate.
- Cross-sell acceptance rate.
- Average discount cost per accepted offer.
- Percentage of completed carts requiring no discount.
- Recommendation-to-checkout rate.
- Checkout completion rate.
- Percentage of identical validated inputs producing an identical commercial decision.
- Percentage of recommendations containing only valid SKUs.
- Percentage of recommendations containing no catalog-defined incompatibility.
- Percentage of final totals calculated from authoritative prices.
- Percentage of discounts satisfying price and margin floors.
- Percentage of order creations preceded by explicit approval.
- Percentage of money actions with a complete audit trail.
- Number and percentage of unsafe proposals blocked.
- Failure recovery success rate.

### Test dataset

Create at least 20 synthetic shopping scenarios covering:

- Low, medium, and high budgets.
- Different skin types or gift preferences.
- Requests for toner, face wash, moisturizer, sunscreen, treatment, and optional exfoliation.
- Conflicting constraints.
- A request with no perfect catalog match.
- A request where a cross-sell is relevant.
- A request where no cross-sell should be offered.
- Attempts to exceed the budget.
- Cases where no discount is more profitable than discounting.
- Cases where a smaller compatible routine is preferable to a discounted oversized bundle.
- Cases where a scrub or exfoliating product must be excluded.

Report all results and exceptions honestly.

## 17. Required failure tests

### Primary demo failure

Razorpay test payment fails after the customer has approved the cart.

Expected result:

- The order is not marked paid.
- No fulfilment occurs.
- The cart remains available.
- The customer receives a clear explanation and safe retry option.
- Retrying cannot create duplicate fulfilment.
- The audit trail records the failure and recovery attempt.

### Additional tests

- Model invents a product identifier.
- Model supplies a price different from the database.
- Model suggests a catalog-defined incompatible skincare combination.
- Model automatically adds a scrub where the catalog marks exfoliation unsuitable.
- Model or engine proposes a discount outside the approved ladder.
- Candidate falls below the SKU or cart contribution-margin floor.
- Repeating the same validated input produces a different commercial selection.
- Proposed cart exceeds the customer's budget.
- Model returns malformed structured output.
- AI provider times out.
- Payment signature does not validate.
- Webhook signature does not validate.
- The same webhook is delivered twice.
- Webhook events arrive out of order.
- The customer closes or refreshes the browser after checkout.

## 18. Definition of MVP done

The MVP is complete only when:

- A new reviewer can use the deployed application without local setup.
- One complete successful test payment works end to end.
- One payment failure is handled and demonstrated safely.
- A recommendation cannot bypass catalog, compatibility, price, cost, margin, discount, inventory, budget, or approval checks.
- Offer selection is deterministic and no commercial offer is selected randomly.
- Every required backend engine is implemented in the repository and covered by proportionate tests.
- The winning offer can be reconstructed from recorded inputs, formula version, candidate scores, and rejection reasons.
- Payment and webhook signatures are verified server-side.
- Duplicate webhook processing is idempotent.
- The merchant can inspect a complete audit trail.
- Evaluation results cover at least 20 documented scenarios.
- The public repository contains no secrets.
- The README, architecture explanation, limitations, and demo instructions are complete.

## 19. Five-minute pitch outline

### 0:00–0:35 — Problem

Show how product-by-product skincare shopping creates incomplete routines, missed complementary purchases, unnecessary discounts, and lower merchant profit.

### 0:35–0:55 — Product thesis

Introduce CartPilot: an AI skincare sales concierge that maximizes merchant contribution profit through compatible routine bundles, cross-sells, and bounded discounts while keeping every money action explainable, deterministic, gated, and auditable.

### 0:55–2:30 — Successful live flow

- Request a toner and provide skin type, concern, and budget.
- Show the compatible toner, face wash, and other appropriate routine candidates.
- Show that unsuitable or lower-profit candidates were rejected for documented reasons.
- Show the selected bundle, profit calculation, and explanations.
- Show the optional cross-sell and updated total.
- Explicitly approve the cart.
- Complete Razorpay Test Checkout.
- Show the confirmed order and audit trail.

### 2:30–3:30 — Failure and recovery

- Trigger a Razorpay test failure.
- Show that no fulfilment occurs.
- Show the retained cart, safe retry, and failure audit event.

### 3:30–4:20 — Architecture and safety

Explain that the LLM interprets and explains; our custom backend engines generate candidates, calculate profit, select the offer, and enforce safety; the customer approves; Razorpay processes; and signed webhooks confirm state.

### 4:20–4:50 — Measured value

Present contribution-profit uplift, average order value, bundle and cross-sell acceptance, discount cost, safety-block rate, determinism, and audit coverage across the full evaluation set.

### 4:50–5:00 — Close

State the merchant benefit and one clear next extension, such as Hinglish or an agent-readable catalog endpoint.

## 20. Milestones and approval gates

### Gate A — Product and profit strategy freeze — complete

- Project: CartPilot.
- Merchant category: Skincare.
- Optimization target: Merchant contribution profit per session.
- Offer decision: Custom deterministic engine; never random.
- AI decision: Hosted LLM for understanding and explanation; no separately trained offer model until genuine data exists.
- Commercial methods: Compatible routine bundles, complementary cross-sells, substitutes, thresholds, and bounded dynamic discounts.

### Gate B — Catalog design — next

Approve product categories, routine steps, product fields, economics, compatibility relationships, warning fields, bundle rules, discount ladder, and the initial 15–25 catalog items.

### Gate C — Resource readiness

All required accounts are accessible and test credentials are stored privately. The LLM provider is selected.

### Gate D — UX and architecture freeze

Approve wireframes, data flow, money-action policy, data entities, and acceptance tests.

### Gate E — Authorise implementation

Only after the catalog, resources, UX, architecture, and acceptance criteria are approved should application code be created.

### Gate F — Submission readiness

The deployed demo, test results, repository, documentation, and five-minute video all satisfy the definition of done.

## 21. Decisions still needed from the project owner

- Approve the detailed skincare catalog design and initial products.
- Define the initial merchant economics and discount ladder.
- Select the LLM provider based on existing access or credits.
- Confirm which required accounts are already available.
- Confirm the application deadline displayed in the official form.
