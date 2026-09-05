# CartPilot submission release checklist

Status date: 5 September 2026

Stable application: <https://cartpilot-gold.vercel.app/>

Repository: <https://github.com/navdeep1610/cartpilot>

This checklist separates repository-verifiable evidence from account-owner evidence. Never paste a key, webhook secret, payment signature, password, OTP, PIN, database URL, or customer record into this file, an issue, a CI log, or the submission form.

## Automated release gate

Run from a clean checkout with Node.js 24 and pnpm 11:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm validate:release
pnpm lint
pnpm typecheck
pnpm test
pnpm test:evaluation
pnpm audit:dependencies
pnpm build
# Linux CI uses pinned Chromium; Windows local runs use installed Chrome.
pnpm exec playwright install --no-shell chromium
pnpm test:e2e
```

The GitHub `Release quality gate` workflow repeats these checks for pull requests and `main`. A failing contract, manifest, policy, test, build, high-severity production dependency audit, or secret scan blocks the release.

## Repository and product evidence

- [x] One Track 01 revenue-growth claim is used consistently.
- [x] Forty products, seventy-four variants and merchant economics are versioned and integrity checked.
- [x] Money actions remain explainable, bounded, customer-gated and auditable.
- [x] The deterministic 35-scenario report includes all four known exceptions.
- [x] Desktop and mobile browser journeys cover clarification, recommendation, medical stopping and merchant authorization.
- [x] Raw shopper messages remain browser-session state and are not persisted by the agentic UI.
- [x] Public documentation states that skincare and growth inputs are synthetic demo assumptions.
- [x] The stable Vercel URL and webhook path are documented.
- [x] Secret, live-key and tracked-environment-file scanning is automated.

## Account-owner evidence required before submitting

- [ ] Confirm the current event deadline, participant eligibility, attendance requirements and required form fields on the official Buildathon page.
- [ ] Approve the synthetic demo catalog, merchant economics and evaluation report as submission inputs.
- [ ] Confirm the prominent demo-guidance limitation is acceptable without expert skincare review.
- [ ] Confirm all five Supabase migrations have been applied to the production-demo project.
- [ ] Confirm the production Vercel project contains every required environment variable and `RAZORPAY_MODE=test`.
- [ ] Confirm the allowlisted merchant email can sign in and open orders, payment safety and growth evidence.
- [ ] Confirm the Razorpay Test webhook targets `https://cartpilot-gold.vercel.app/api/v1/webhooks/razorpay` and subscribes to the four documented events.
- [ ] Record a recent successful signed webhook delivery without copying its secret or payload into the repository.
- [ ] Complete and record one successful Test Mode checkout through captured state and authorized fulfilment.
- [ ] Complete and record one failed Test Mode checkout, retained cart, blocked fulfilment and idempotent retry on the same order.
- [ ] Record the five-minute demo using `submission/DEMO_SCRIPT.md` and check that no secret or personal data is visible.
- [ ] Add the final repository URL, stable deployment URL, video URL and concise product description to the submission form.

## Evidence log template

Store sensitive screenshots privately. Only record non-secret references here or in the submission form.

| Evidence | Safe reference to record | Completed |
|---|---|---|
| GitHub quality gate | Workflow run URL | [ ] |
| Vercel production | Deployment URL and commit SHA | [ ] |
| Razorpay webhook | Dashboard delivery time and event type; no payload/signature | [ ] |
| Successful payment | Redacted Test payment/order IDs and CartPilot trace ID | [ ] |
| Failure recovery | Redacted Test order ID, retry count and CartPilot trace ID | [ ] |
| Demo video | Shareable reviewer URL | [ ] |
| Submission | Confirmation reference | [ ] |

## Rollback rule

If the release build, live smoke path, webhook delivery, payment state or audit chain fails, do not submit. Restore the previous healthy Vercel deployment, keep fulfilment blocked, diagnose against the relevant trace, fix through a reviewed commit, and rerun the entire release gate.
