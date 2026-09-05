# CartPilot five-minute reviewer demo

Use the stable production site: <https://cartpilot-gold.vercel.app/>. Keep the Razorpay dashboard and the authenticated merchant portal open in separate tabs. Use Test Mode only and never show keys, signatures, customer contact details, or `.env.local` in the recording.

## Before recording

- Confirm the five Supabase migrations are applied in filename order.
- Confirm the stable webhook endpoint is `https://cartpilot-gold.vercel.app/api/v1/webhooks/razorpay` and has a recent successful Test Mode delivery.
- Prepare one captured Test payment and one failed-then-retried Test payment whose audit traces contain no personal information suitable for the video.
- Open `/merchant/growth`, `/merchant/payment-safety`, and the order list while signed in as the allowlisted merchant.
- Use Razorpay's current documented Test Mode instruments; do not use real payment credentials.

## 0:00–0:35 — The merchant problem

Show the storefront and say:

> Skincare merchants lose revenue when shoppers buy one disconnected item, while indiscriminate bundles and discounts can reduce profit or create unsafe combinations. CartPilot completes compatible routines and selects only profit-positive offers.

## 0:35–1:25 — Bounded conversational agent

1. Enter `Help me choose skincare`.
2. Show that CartPilot pauses for one clarification instead of inventing details.
3. Choose `Oily skin with clogged pores`.
4. Point to the conversation history and the four-step agent activity record.
5. Explain that Gemini may structure the request, while merchant code controls catalog eligibility, compatibility, inventory, prices, offers, orders and payments.

## 1:25–2:15 — Growth decision and customer gate

1. Add the routine to the cart.
2. Compare the original cart with the selected bundle or cross-sell.
3. Show the customer-facing reason, saving, safety notes and policy status.
4. Keep or accept the offer deliberately.
5. Point out that no Razorpay order exists until the shopper confirms the exact cart and total.

## 2:15–2:55 — Successful Test Mode payment

1. Use the prepared successful Test Mode flow or recording.
2. For a new shopper, show the personal-details prompt and its automatic return to the unchanged cart after saving.
3. Show that the server verifies the callback.
4. Show the captured products leave the cart and appear in the shopper's **My orders** panel.
5. Show the merchant order as captured only after authoritative Razorpay evidence.
6. Open its audit record and show the trace ID, ordered events, hashes, policy versions and fulfilment gate.

## 2:55–3:35 — Failure and safe retry

1. Use the prepared failed Test Mode flow or recording.
2. Show that the cart remains, payment is not marked captured, and fulfilment remains blocked.
3. Select `Retry secure payment`.
4. Explain that CartPilot reopens the same Razorpay order with an idempotent retry rather than creating another order.
5. Show `payment.retry_started` and the retry count in the merchant timeline.

## 3:35–4:25 — Merchant evidence

1. Open `/merchant/growth`.
2. State that all 35 versioned synthetic cases execute and 31 match their frozen expected outcomes.
3. Show the 10/10 safety result and the four visible exceptions.
4. Present ₹1,937.86 estimated incremental contribution profit across eight comparable growth cases.
5. Say clearly that these are synthetic estimates, not realized revenue or conversion lift.

## 4:25–4:50 — Architecture and resilience

Show the README architecture diagram. Summarize:

- Gemini failure falls back to a deterministic intent parser.
- Invalid catalog checksums fail closed.
- Payment claims, state transitions and audit events commit atomically.
- Duplicate and out-of-order webhooks cannot downgrade captured state or duplicate fulfilment.

## 4:50–5:00 — Close

> CartPilot grows a merchant's estimated contribution profit through relevant routine completion while keeping every money action explainable, bounded, customer-gated and auditable.

End on the stable storefront URL. Do not claim ACP, AP2, UAP, x402, production medical suitability, or realized merchant uplift.
