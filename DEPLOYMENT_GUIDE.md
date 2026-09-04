# CartPilot: connect the accounts and publish

The application code is complete enough to run locally and build for production. The remaining steps connect your private accounts. Never paste API keys into chat or commit `.env.local` to GitHub.

## 1. Add your private values on the laptop

Open `.env.local` in this project and fill in the blank values.

### Supabase

In the Supabase project dashboard, open **Project Settings → API**.

- Copy **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
- Copy the **publishable key** into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Copy the **service_role key** into `SUPABASE_SERVICE_ROLE_KEY`. This key is private and server-only.
- In **Authentication → Users**, create the one email-and-password account that will own the merchant portal.
- Copy that account's exact email into `MERCHANT_EMAIL`. Only this authenticated email can read merchant customer and order APIs.

### Gemini

In Google AI Studio, copy the API key you already created into `GEMINI_API_KEY`.

### Razorpay

Switch the Razorpay dashboard to **Test Mode**.

- Copy the Test Key ID into `RAZORPAY_KEY_ID`. It should start with `rzp_test_`.
- Copy the Test Key Secret into `RAZORPAY_KEY_SECRET`.
- Create a separate webhook secret and copy it into `RAZORPAY_WEBHOOK_SECRET`.
- Keep `RAZORPAY_MODE=test` unchanged.

`SESSION_SECRET` and `AUDIT_HASH_PEPPER` should each be a different long random value. They must not be reused as API keys.

## 2. Create the Supabase tables

1. Open **Supabase → SQL Editor → New query**.
2. Run the complete migration files in filename order: `0001_checkout_and_audit.sql`, `0002_customer_profiles.sql`, `0003_atomic_payments.sql`, then `0004_complete_audit_trail.sql`.
3. Apply each migration once. Phase 4 requires both the atomic-payment and complete-audit migrations.

This creates private decision, customer, payment, webhook, transition, and append-only audit tables plus the transactional payment functions. Browser users receive no direct access to these tables.

## 3. Test locally

After saving `.env.local`, restart CartPilot and test this journey:

1. Ask for an oily-skin and clogged-pore routine.
2. Add the routine to the cart.
3. Accept the recommended acne starter bundle.
4. Confirm the exact total.
5. Open Razorpay Test checkout.
6. Complete one successful test payment.
7. Complete one failed test payment and confirm that the cart remains and fulfilment stays blocked.

## 4. Publish through GitHub and Vercel

1. Push the project to the GitHub repository.
2. Import that repository into Vercel.
3. Add every `.env.local` name and value to **Vercel → Project Settings → Environment Variables**.
4. Change `NEXT_PUBLIC_APP_URL` to the stable Vercel production URL.
5. Deploy the production branch.

Do not upload `.env.local`; Vercel stores the same values securely in its own settings.

After deployment, opening `/merchant` redirects signed-out visitors to `/merchant/login`. Sign in with the Supabase Auth user whose email matches `MERCHANT_EMAIL`.

## 5. Connect the stable Razorpay webhook

After the first production deployment, add this URL in the Razorpay Test Mode webhook settings:

`https://YOUR-STABLE-VERCEL-DOMAIN/api/v1/webhooks/razorpay`

Subscribe to:

- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `order.paid`

Use the same webhook secret stored in `RAZORPAY_WEBHOOK_SECRET`. Do not use a temporary Vercel preview URL.

## Safety rules already enforced by the application

- Gemini cannot choose a price, discount, product eligibility, order, or payment state.
- Live-looking Razorpay keys are rejected.
- An order is created only after exact-total customer confirmation.
- The browser callback verifies authenticity but cannot authorise fulfilment.
- A signed capture webhook and matching amount/order evidence are required for fulfilment.
- Duplicate confirmation, order and callback requests are idempotent, and webhook receipt plus state changes commit transactionally.
- Audit events use a per-trace sequence lock, canonical payload hashes and parent hashes; update and delete operations are rejected.
- Failed payments retain the cart and keep fulfilment blocked.
- Merchant economics and secret keys are never returned by customer APIs.
- Merchant pages, customer records, order APIs and payment reconciliation require a verified Supabase Auth session for the configured `MERCHANT_EMAIL`.
