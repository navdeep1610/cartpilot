# CartPilot

CartPilot is a bounded AI skincare sales agent for Razorpay AI Buildathon Track 01 — AI Growth & Agentic Commerce.

It converts a shopper's natural-language goal into a catalog-backed routine, evaluates compatible bundles, cross-sells and approved discounts with deterministic merchant rules, asks the shopper to confirm the exact total, and uses Razorpay Test Mode for checkout.

## The Track 01 claim

> CartPilot grows estimated merchant contribution profit through relevant routine completion while keeping every money action explainable, bounded, customer-gated and traceable.

CartPilot follows the challenge's revenue-growth route. Agent-to-agent protocol support and campaign orchestration are optional extensions, not claims of the current submission.

## What is working

- Forty-product, seventy-four-variant merchant catalog with customer-safe projection.
- Natural-language intent extraction with a deterministic fallback when Gemini is unavailable.
- Catalog-backed routine recommendations and human-readable reasons.
- Deterministic baseline, bundle, cross-sell, substitute and bounded-discount candidates.
- Integer-paise profit calculations and merchant-controlled margin rules.
- Exact-cart and exact-total confirmation before order creation.
- Razorpay Orders and Standard Checkout in Test Mode.
- Server-side callback and webhook signature verification.
- Fulfilment blocked until captured payment evidence is reconciled.
- Supabase-backed customer profiles, orders and payment events.
- Protected merchant portal using Supabase Auth and an allowlisted merchant email.

## Current upgrade programme

The baseline application is implemented and builds successfully. A September 2026 readiness audit identified the remaining work needed before the project should be presented as hackathon-complete.

1. Hackathon story and governance freeze — complete in this release.
2. Commercial-policy correctness and catalog validation.
3. Transactional payment and webhook reliability.
4. Complete intent-to-fulfilment audit trail.
5. Failure-first customer recovery flow.
6. Thirty-five-scenario growth evaluation and merchant evidence.
7. Agentic interaction polish.
8. CI, deployment and submission package.

The live requirement matrix and exit criteria are in [HACKATHON_REQUIREMENTS.md](./HACKATHON_REQUIREMENTS.md). Detailed product and engineering contracts remain in [PROJECT_PLAN.md](./PROJECT_PLAN.md) and [IMPLEMENTATION_SPEC.md](./IMPLEMENTATION_SPEC.md).

## Trust boundaries

- The LLM may interpret the shopper's words; it cannot choose prices, discounts, products, orders or payment states.
- Customer-visible prices come from the server catalog.
- The customer must approve the exact revalidated total.
- Razorpay handles payment credentials; CartPilot must never store card numbers, CVVs, PINs, passwords or OTPs.
- A browser callback proves authenticity but does not authorize fulfilment by itself.
- Live Razorpay keys are rejected by the application.
- This is catalog guidance for a demonstration, not medical advice.

## Run locally

Requirements: Node.js 24.x and pnpm 11.x.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Configure private values in `.env.local`; never commit that file. See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for Supabase, Gemini, Razorpay Test Mode and merchant-login setup.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The Phase 1 baseline passes lint, type checking, 30 unit tests and the production build. End-to-end payment, failure recovery and the full evaluation suite remain release gates rather than completed claims.

## Demo path

1. Describe a skin type, concern and budget.
2. Review the catalog-backed routine.
3. Add products and inspect the profit-aware offer.
4. Choose the offer or keep the baseline cart.
5. Confirm the exact total.
6. Complete Razorpay Test Checkout.
7. Review the resulting payment evidence in the protected merchant portal.

The submission is complete only after both a successful payment and a failed-payment recovery have been demonstrated through the stable deployed webhook.
