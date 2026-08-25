# CartPilot Wireframes

Status: Approved design specification  
Approved on: 2026-08-24  
Project: Razorpay AI Buildathon — AI Growth & Agentic Commerce  
Scope: Customer skincare store, AI recommendation journey, profit-aware offer journey, Razorpay Test Mode payment, and merchant dashboard

## 1. Purpose

This document is the implementation source of truth for CartPilot's MVP screens and user journeys. It converts the approved visual wireframes into precise requirements that can later be implemented and tested.

This file describes interface behaviour only. It does not authorize application-code development, live deployment, or API calls.

## 2. Product experience in simple terms

CartPilot is a skincare storefront with an AI shopping assistant.

The shopper can:

1. Browse products or describe a skincare concern.
2. Receive a compatible routine recommendation.
3. Add products to the cart.
4. Receive one relevant bundle, cross-sell, substitute, or bounded discount offer.
5. Accept or reject the offer.
6. Review and explicitly confirm the final amount.
7. Pay through Razorpay Standard Checkout in Test Mode.
8. See a clear verified success, failure, or payment-processing result.

The merchant can:

1. View captured test revenue and estimated contribution profit.
2. Measure offer acceptance and payment failures.
3. Inspect why an offer was selected or rejected.
4. Review the payment and fulfilment audit trail.

## 3. Locked design decisions

- The experience is catalog-first, with the AI assistant visible on the catalog page.
- The assistant helps interpret customer needs; it does not control prices, discounts, profit calculations, payments, or fulfilment.
- The backend offer engine is deterministic. Offers are never selected randomly.
- Only one primary offer is shown at a time to avoid confusing the shopper.
- The customer can reject an offer and continue without it.
- Customer-facing explanations describe relevance and savings but never reveal merchant cost or profit data.
- Merchant economics are visible only inside the protected merchant dashboard.
- A customer must explicitly confirm the final cart and amount before a Razorpay order is created.
- Razorpay Standard Checkout is used in Test Mode. The checkout shown in the wireframe is only a placement reference; the final interface must use Razorpay's real hosted checkout.
- Fulfilment is never permitted from a browser success message alone.
- The interface includes a gracefully handled failed-payment journey.
- Skincare recommendations include a clear demonstration and non-medical-advice disclaimer.

## 4. Navigation map

```text
Customer store
├── Catalog and AI assistant
├── AI routine recommendation
├── Cart and smart offer
├── Final confirmation
├── Razorpay Test Checkout
└── Payment result
    ├── Verifying / processing
    ├── Verified success
    └── Verified failure

Merchant area
├── Growth dashboard
├── Orders and payments
├── Offer decision audit
└── Decision details
```

Suggested page routes are conceptual and may be finalized during implementation:

| Screen | Suggested route |
|---|---|
| Catalog and assistant | `/` |
| Recommendation | `/routine` |
| Cart and offer | `/cart` |
| Final confirmation | `/checkout/review` |
| Payment result | `/orders/{order-reference}` |
| Merchant dashboard | `/merchant` |
| Merchant decision detail | `/merchant/decisions/{decision-id}` |

## 5. Shared customer-store layout

Every customer screen uses the same store header where appropriate.

### Header contents

- CartPilot wordmark.
- Shop navigation.
- Routines navigation.
- How it works navigation.
- Cart item count.
- A clear visual indication when the project is running in Test Mode during payment-related steps.

### Shared behaviour

- The cart count updates only after a server-confirmed cart change.
- Buttons show a temporary working state after selection to prevent accidental repeated submissions.
- Price and availability displayed by the interface come from server-controlled catalog data.
- Errors use plain language and offer a safe next action.
- The interface must not expose API keys, internal prompts, merchant costs, profit rules, stack traces, or raw provider responses.

## 6. Customer screen C01 — Catalog and AI assistant

### Purpose

Allow customers to browse products immediately while making AI help easy to discover.

### Visible content

- Hero message explaining that the customer can build a skincare routine.
- Primary action: `Shop all products`.
- Secondary action: `View starter kits`.
- AI assistant panel titled `Ask CartPilot`.
- Prompt asking for skin type and the customer's main concern.
- Product grid showing real catalog products.
- Each product card contains product type, name, use case, available size or selected default variant, price, and an Add action.
- Skincare demonstration disclaimer.

### Example catalog products in the approved wireframe

- Salicylic Acid Cleanser — ₹399.
- 10% Niacinamide Serum — ₹499.
- Matte SPF 50 Sunscreen — ₹499.

The final interface must obtain products and prices from the catalog source rather than hard-coding these examples.

### Customer actions

- Browse all products.
- Open starter kits.
- Open a product.
- Select an available size.
- Add a variant to the cart.
- Enter a skincare concern for the assistant.

### Required states

- Catalog loading.
- Catalog loaded.
- No matching products.
- Catalog temporarily unavailable.
- Product or variant unavailable.
- Assistant ready.
- Assistant request in progress.
- Assistant temporarily unavailable with normal catalog browsing still available.

## 7. Customer screen C02 — AI routine recommendation

### Purpose

Turn a shopper's stated concern into a small, understandable, compatible skincare routine.

### Visible content

- Restatement of the interpreted skin type and concern.
- A routine with numbered steps.
- Product name, role in the routine, selected variant, and price for each step.
- A short `Why these products?` explanation.
- Compatibility-check result.
- Patch-test and non-medical-advice guidance.
- Primary action: `Add routine to cart`.
- Secondary action: `Change my concern`.

### Approved example routine

1. Salicylic Acid Cleanser.
2. 10% Niacinamide Serum.
3. Lightweight Gel Moisturizer.

### Behaviour rules

- The LLM may extract structured intent and generate natural-language explanations.
- Catalog matching and compatibility validation must be completed by project-owned backend engines.
- The assistant cannot invent products, prices, sizes, ingredients, medical claims, discounts, or availability.
- Every recommended product must exist in the active catalog.
- Blocked compatibility combinations must never be presented as a valid routine.
- If AI interpretation fails, the customer must be offered a safe catalog-based fallback rather than an invented answer.

### Required states

- Analysing concern.
- Recommendation ready.
- Partial recommendation when only some valid products are available.
- No safe match found.
- AI provider unavailable; deterministic fallback available.
- Recommendation expired because catalog price or availability changed.

## 8. Customer screen C03 — Cart and smart offer

### Purpose

Show the current cart and one relevant profit-aware offer without pressuring or misleading the customer.

### Visible content

- Current cart products, variants, quantities, and prices.
- Current cart subtotal.
- One selected offer, when a valid candidate exists.
- What will be added, removed, replaced, bundled, or discounted.
- Exact new total and customer saving.
- Plain-language reason for the offer.
- Primary action to accept the offer.
- Clear `No thanks` action.
- Order summary.

### Approved example offer

The current cart contains:

- Salicylic Acid Cleanser — ₹399.
- 10% Niacinamide Serum — ₹499.

Cart subtotal: ₹898.

The selected offer upgrades the cart to the Acne Control Starter Kit by adding Lightweight Gel Moisturizer for an effective ₹401. The final bundle total is ₹1,299, which is ₹48 less than purchasing all three products separately.

### Offer-selection behaviour

The backend evaluates only allowed candidates:

- Existing fixed bundle.
- Compatible one-item cross-sell.
- Relevant substitute.
- Bounded discount where policy permits it.
- No offer.

Candidates that fail compatibility, relevance, stock, discount-cap, or minimum-profit rules are rejected. The highest-ranked valid candidate is selected according to the approved deterministic policy. If no candidate passes, the interface shows the normal cart without manufacturing an offer.

### Customer-visible explanation rules

The customer may see:

- Routine relevance.
- Product compatibility.
- Exact saving.
- Exact final amount.
- Why the addition may be useful.

The customer must not see:

- Merchant unit cost.
- Contribution-profit calculation.
- Internal ranking score.
- Rejected candidate details.
- Private offer-policy configuration.

### Required states

- Cart loaded without an offer.
- Offer being calculated.
- Valid offer shown.
- Offer accepted.
- Offer rejected.
- Offer expired after a cart, price, stock, or policy change.
- Cart empty.
- Cart refresh required.

## 9. Customer screen C04 — Final confirmation

### Purpose

Obtain clear customer approval for the exact products and amount before creating a Razorpay order.

### Visible content

- Final items and quantities.
- Accepted offer or bundle, if any.
- Delivery details required by the demo.
- Subtotal, discount, delivery amount, and final amount in INR.
- Test Mode notice.
- Primary action: `Confirm and pay ₹{final amount}`.
- Secondary action: `Return to cart`.

### Behaviour rules

- The displayed amount is calculated and revalidated by the server.
- Customer confirmation is tied to the exact cart version, price version, offer decision, currency, and final amount.
- The Razorpay order is created only after the explicit confirmation action.
- If the cart or decision has changed, confirmation is stopped and the customer returns to an updated review.
- Repeated clicks must not create duplicate internal orders or Razorpay orders.

### Required states

- Review ready.
- Final validation in progress.
- Price or stock changed.
- Confirmation recorded.
- Razorpay order creation in progress.
- Razorpay temporarily unavailable with a safe retry message.

## 10. Customer screen C05 — Razorpay Test Checkout

### Purpose

Let the customer complete a real Razorpay Test Mode payment.

### Wireframe meaning

The approved image shows where checkout appears in the journey. It is not a custom payment form specification. The application must launch the official Razorpay Standard Checkout and must not collect card, UPI, bank, or wallet credentials itself.

### Information supplied to checkout

- Server-created Razorpay order identifier.
- Server-authoritative amount and INR currency.
- Merchant display name and safe description.
- Safe prefill values only where the customer has supplied them and the integration permits them.

### Behaviour rules

- Razorpay secret keys remain on the server.
- Checkout opens only after customer confirmation and successful server-side order creation.
- Closing checkout does not mark the order paid.
- A browser success callback does not authorize fulfilment by itself.
- The application moves to a payment-verification screen after checkout success, failure, dismissal, timeout, or ambiguous interruption.

## 11. Customer screen C06 — Payment verification

### Purpose

Avoid making a false success or failure claim while the backend verifies the payment.

### Visible content

- Message: `Checking your payment status`.
- Order reference.
- Non-alarming explanation that verification may take a moment.
- Safe refresh or status-check action if verification takes longer than expected.
- Support reference when reconciliation cannot complete immediately.

### Behaviour rules

- The browser may poll a safe internal payment-status endpoint.
- The interface remains in this state while payment status is unknown or only browser-reported.
- Fulfilment remains blocked.
- The page moves to verified success or verified failure only after authoritative server-side evidence.

## 12. Customer screen C07 — Verified payment success

### Purpose

Confirm that payment was captured and the order may proceed.

### Visible content

- Success indicator.
- Message that the demo order is confirmed.
- Internal order reference.
- Captured amount.
- Order contents or link to order details.
- Primary action: `View order`.

### Behaviour rules

- Success is displayed only when the backend state is captured.
- Capture must be confirmed through a verified Razorpay webhook or authenticated Razorpay API reconciliation.
- Refreshing the page must show the same order rather than create a new one.
- Duplicate webhook delivery must not duplicate fulfilment or audit events.

## 13. Customer screen C08 — Verified payment failure

### Purpose

Handle the required failure demonstration clearly and without creating duplicate orders.

### Visible content

- Failure indicator.
- Clear statement that the payment was not completed when that result is authoritative.
- Explanation that the cart is saved.
- Primary action: `Try payment again`.
- Secondary action: `Return to cart`.
- No fulfilment confirmation.

### Behaviour rules

- The phrase `You have not been charged` is used only for a verified terminal failure where that statement is supported by the stored payment state.
- An unknown, interrupted, or pending state uses the payment-verification screen instead.
- Retry is allowed only after server-side safety checks.
- An unchanged cart may reuse the safe existing order according to the approved retry policy.
- A changed cart requires a fresh confirmation and payment context.
- If any authorization or capture evidence exists, normal retry is blocked until reconciliation finishes.

## 14. Merchant screen M01 — Growth dashboard

### Purpose

Demonstrate how CartPilot grows estimated contribution profit while keeping every money action explainable and auditable.

### Navigation

- Overview.
- Orders.
- Offer decisions.
- Catalog.
- Merchant account menu.

### Summary metrics

- Captured Test Mode revenue.
- Estimated contribution profit.
- Offer acceptance rate.
- Payment-failure count.
- Duplicate-order or duplicate-fulfilment count.

All financial metrics must clearly state that they are based on demo catalog economics and Razorpay Test Mode payments.

### Dashboard sections

#### Estimated profit by order

- Shows recent captured test orders.
- Uses server-stored revenue, cost, discount, and contribution-profit values.
- Excludes failed, cancelled, and unverified payments from captured revenue.

#### Latest payment

- Internal order reference.
- Purchased products or bundle.
- Captured amount.
- Estimated contribution profit.
- Current verified payment and fulfilment-gate state.

#### Offer decision audit

Each row shows:

- Decision reference and time.
- Selected offer type.
- Customer-safe summary.
- Merchant-only estimated profit result.
- Acceptance or rejection outcome.
- Link to full decision details.

### Required states

- Dashboard loading.
- Dashboard ready.
- No Test Mode orders yet.
- Metrics temporarily unavailable.
- Payment needs reconciliation.
- Merchant session expired or unauthorized.

## 15. Merchant screen M02 — Offer decision details

### Purpose

Allow the merchant and hackathon judges to inspect exactly why the engine made a commercial decision.

### Visible content

- Decision identifier and timestamp.
- Cart snapshot and catalog-policy versions.
- Interpreted customer intent, when applicable.
- Candidates generated by the backend.
- Rejection reason for every invalid candidate.
- Selected candidate and deterministic tie-break explanation.
- Price before and after the offer.
- Discount amount and discount-cap result.
- Estimated revenue, cost, and contribution profit.
- Customer confirmation outcome.
- Razorpay order and payment references where operationally necessary.
- Payment-verification source.
- Fulfilment-gate decision.
- Related audit events.

### Security rules

- Merchant authentication is required.
- Secrets, raw signatures, private prompts, unnecessary personal data, and complete provider payloads are never shown.
- Sensitive identifiers are masked where the full value is not operationally required.

## 16. Common loading, empty, and error patterns

The implementation must provide deliberate states rather than blank pages.

| Situation | Customer or merchant message | Safe action |
|---|---|---|
| Catalog loading | Loading products | Wait |
| Catalog unavailable | Products cannot be loaded right now | Retry |
| AI unavailable | The assistant is unavailable, but the catalog still works | Browse products or retry |
| No valid offer | Continue with the current cart | Review cart |
| Offer expired | Prices or availability changed, so the cart was refreshed | Review updated cart |
| Order creation uncertain | We are checking whether the payment order was created | Check status; do not submit repeatedly |
| Payment status unknown | Checking your payment status | Wait or refresh status |
| Verified payment failed | Payment was not completed | Retry safely or return to cart |
| Unauthorized merchant access | Sign in to view merchant data | Sign in |

## 17. Responsive behaviour

### Desktop and tablet

- Catalog hero and assistant may appear side by side.
- Product cards use a multi-column grid.
- Cart content and order summary may appear side by side.
- Merchant metrics may use four columns when space allows.

### Mobile

- Content stacks into one column.
- Store navigation becomes compact while preserving access to catalog and cart.
- The assistant appears below the catalog introduction.
- Product cards become full-width.
- Order summary follows cart items.
- Payment-result actions remain easy to tap.
- Merchant metrics stack without horizontal page scrolling.
- Tables or dense audit information use responsive rows or a contained horizontal table area.

### Minimum quality rules

- Support widths down to 320 pixels.
- No clipped text, buttons, totals, or warnings.
- No horizontal scrolling for the main customer flow.
- Primary actions remain visible and clearly labelled.

## 18. Accessibility requirements

- All interactive controls are reachable by keyboard.
- Focus indicators are clearly visible.
- Buttons have descriptive visible labels.
- Form fields have programmatic labels.
- Status changes use appropriate polite announcements; validation errors are announced as errors.
- Success and failure never rely on colour alone.
- Text and controls meet readable contrast requirements in light and dark appearance.
- Dialogs, including any application-controlled pre-checkout dialog, correctly manage focus.
- Razorpay Checkout accessibility is governed by the hosted integration; CartPilot must preserve accessible entry and return states.
- Motion is optional and respects reduced-motion preferences.

## 19. Skincare copy and safety rules

Use cosmetic, non-diagnostic wording such as:

- `Supports brighter-looking skin.`
- `Helps improve the appearance of pores.`
- `Suitable for oily-looking skin.`

Avoid unsupported medical wording such as:

- `Cures acne.`
- `Treats a medical condition.`
- `Guaranteed results.`

Required disclaimer:

> This skincare guidance is for a hackathon demonstration and is not medical advice. Patch-test new products and consult a qualified professional for persistent concerns or reactions.

## 20. Interface-to-audit mapping

Important customer and merchant actions must create or connect to audit events.

| Interface action | Required audit meaning |
|---|---|
| Customer submits concern | Intent request recorded with safe, minimized data |
| Recommendation displayed | Products and catalog version recorded |
| Offer displayed | Decision identifier, candidate summary, and policy versions recorded |
| Offer accepted or rejected | Customer response recorded |
| Final amount displayed | Cart version and authoritative total recorded |
| Customer confirms payment | Confirmation tied to the exact decision context |
| Razorpay order requested | Idempotency and payment-record reference recorded |
| Checkout callback received | Signature-verification result recorded when callback exists |
| Webhook received | Signature, deduplication, and transition results recorded |
| Payment reconciled | Source and authoritative status recorded |
| Fulfilment gate evaluated | Allowed or blocked decision and reasons recorded |

## 21. Demo journeys

### Journey A — Successful intelligent offer and payment

1. Customer describes oily skin and clogged pores.
2. CartPilot recommends a cleanser, niacinamide serum, and gel moisturizer.
3. Customer starts with the cleanser and serum.
4. The offer engine proposes the Acne Control Starter Kit upgrade.
5. Customer sees the exact saving and accepts.
6. Customer confirms ₹1,299.
7. Razorpay Test Checkout completes successfully.
8. The backend verifies capture.
9. The success screen and merchant dashboard show the result.
10. The decision audit explains why the offer won.

### Journey B — Offer rejected

1. Customer receives a valid cross-sell or bundle offer.
2. Customer selects `No thanks`.
3. The original cart remains unchanged.
4. Customer can still confirm and pay normally.
5. The merchant audit records that the offer was shown and rejected.

### Journey C — Payment failure handled gracefully

1. Customer confirms the cart.
2. Razorpay Test Checkout returns a terminal failed payment.
3. CartPilot verifies the state and keeps fulfilment blocked.
4. The cart remains available.
5. The customer receives safe retry and return-to-cart choices.
6. No duplicate order or fulfilment is created.
7. The merchant dashboard records the failure and related audit events.

## 22. Acceptance checklist

The wireframe implementation is accepted only when all of the following are true:

- [ ] Catalog products and prices come from the merchant-controlled source.
- [ ] The assistant is accessible from the catalog page.
- [ ] Every displayed recommendation references valid catalog products.
- [ ] Compatibility rules are enforced before recommendations are shown.
- [ ] One or zero primary offers are displayed for a cart.
- [ ] Every offer has an understandable customer-facing reason.
- [ ] The customer can reject the offer without blocking checkout.
- [ ] Merchant economics remain hidden from customer pages.
- [ ] The final amount is shown before confirmation.
- [ ] Razorpay order creation happens only after explicit confirmation.
- [ ] Official Razorpay Standard Checkout is used in Test Mode.
- [ ] Unknown payment status produces a verification state, not a false result.
- [ ] Verified success requires authoritative captured-payment evidence.
- [ ] Failed payment does not permit fulfilment.
- [ ] Safe retry does not create duplicate orders or fulfilment.
- [ ] Merchant metrics distinguish captured, failed, and unverified payments.
- [ ] Offer decisions and money actions are auditable.
- [ ] The skincare disclaimer is visible in the recommendation journey.
- [ ] Desktop and mobile layouts are usable.
- [ ] Keyboard, focus, labels, status announcements, and colour-independent states are tested.

## 23. Deferred interfaces

The following are outside the hackathon MVP unless separately approved:

- Live Razorpay payments.
- Merchant catalog editing interface.
- Inventory purchasing or warehouse management.
- Returns and refunds workflow.
- Coupon campaign builder.
- Customer accounts and long-term skincare profiles.
- Medical diagnosis or treatment advice.
- Multiple merchants or marketplace administration.
- Fully autonomous purchasing without explicit customer confirmation.

## 24. Next gate

With these wireframes documented, the remaining pre-implementation work is:

1. Confirm the selected LLM provider and API access.
2. Prepare Razorpay Test Mode, Supabase, Vercel, GitHub, and LLM configuration without sharing secrets in chat.
3. Approve the implementation start explicitly.

No application code should be created until the user gives that explicit implementation authorization.
