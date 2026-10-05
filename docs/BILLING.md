# Billing system (invoices now, Stripe later)

Where: **Admin → Billing** (`/admin/billing`) and, for partners, **Billing** in the portal (`/portal/billing`). The fee schedule itself, with the reasoning, is in `docs/FEES.md`. Money is stored in integer cents (USD).

## What exists now
| Part | What it does |
|---|---|
| **Price catalog** | 28 products seeded from the fee schedule (12 active now, the rest inactive for later phases). Edit a price and the old one is closed, the new one starts today; existing invoices never change. Per-certificate prices are graduated bands |
| **Partner plan** | Starter / Professional / Enterprise, plan renewal date (the plan year), optional override of included certificates, tax rate and label (default 0%: set only after the tax adviser confirms) |
| **Discounts and credits** | Percent or one-off dollar credit, by category (founding partner, non-profit, multi-year, referral, other) with a **required reason**, optional product and expiry. Applied automatically to new invoices; a credit is used once; deleting a draft or voiding an unpaid invoice releases it |
| **Certificate usage** | Counts certificates issued in the plan year, subtracts the allowance, prices the rest by graduated bands, and bills **only what was not billed before** (void invoices release their certificates). The sum of monthly usage invoices equals one invoice for the whole year (tested) |
| **Invoices** | Draft → issue (assigns the next number `INV-YYYY-NNNN`, freezes the billing details, sets the due date) → open → paid, or void (unpaid only; the number stays on record). Lines, discounts, tax and totals; branded PDF for LIV staff and the partner |
| **Payments** | Record bank transfers and other receipts (partial payments, overpayment refused); the invoice becomes paid when the balance reaches zero |
| **Service hold** | Stops issuing new certificates (portal and API) for unpaid invoices. It never changes accreditation status, and verification of existing certificates continues |
| **Partner billing page** | Plan, certificates used vs. included, balance owed, invoices with PDF, how to pay |
| **Exports** | CSV of invoices, lines and payments for the accountant |
| **Public fee page** | `/fees`, built from the catalog; **hidden until `PUBLIC_FEES=true`** (turn on only after you approve the fees) |
| **Audit** | Every billing action is in the tamper-evident audit log |

## Settings (environment)
`BILLING_EMAIL`, `LEGAL_ADDRESS` (printed on invoices), `BILLING_BANK_DETAILS` (bank transfer instructions; use `\n` for new lines), `PUBLIC_FEES`, and for the future `STRIPE_WEBHOOK_SECRET`.

## How to run the first invoices (manual, bank transfer)
1. Admin → Billing → Partners → open the partner. Set the **plan**, renewal date and, once confirmed by your tax adviser, the tax rate.
2. Add any **discount** (for example 50% on the application fee for a founding partner) with the reason.
3. **New invoice**: pick the items (application fee, annual fee, services). Review the draft, **Issue** it, send the PDF (or let the partner download it in the portal).
4. When the transfer arrives, **Record payment** with the bank reference.
5. Each month: open the partner, check "unbilled usage", create a draft with "Include unbilled certificate usage", issue it. Invoices under about $50 can wait and roll forward.
6. If an invoice stays overdue past the agreed period, use **Service hold**; lift it when paid.

## Stripe: what is ready and what is not
**Ready (built and tested without any Stripe account):**
- Webhook receiver at `POST /api/webhooks/stripe`: verifies the `Stripe-Signature` header (HMAC-SHA256, 5-minute tolerance), reads the raw body, and records a payment for events that carry `metadata.liv_invoice_id` (`payment_intent.succeeded`, `checkout.session.completed` when paid, `invoice.paid`). Repeated deliveries are idempotent (unique provider payment id); business-rule problems (overpayment, invoice not open) are logged and answered with 200 so Stripe does not retry forever; database errors return 500 so Stripe retries. Answers 501 until `STRIPE_WEBHOOK_SECRET` is set.
- Data model fields: `invoices.provider`, `provider_invoice_id`, `provider_url`, `payments.provider` and `provider_payment_id`, `platforms.stripe_customer_id`.

**Not built yet (needs your Stripe account and an owner decision):**
1. Create or find the Stripe **Customer** for each partner (`stripe_customer_id`).
2. When an invoice is issued, create the Stripe **Checkout Session** or hosted invoice with `metadata.liv_invoice_id`, and show a "Pay by card" button in the portal and a link in the PDF.
3. Stripe **Tax** (or your own rates) and the countries you will accept; payment methods for the Gulf (cards, wallets) and their fees.
4. Refund and dispute handling mapped to credit notes.
5. Payouts, reconciliation report, and recurring subscription billing for the annual fee (optional; invoices work without it).
Setup when ready: create the account in the name of LIV LLC, add the webhook endpoint `https://<your domain>/api/webhooks/stripe`, copy its signing secret into `STRIPE_WEBHOOK_SECRET`, keep the secret API key only in Secrets, and test with Stripe's test mode first.

## Limits and cautions
- Tax is a single rate per partner set by an administrator; the system does not decide tax. Get adviser confirmation before setting any non-zero rate or issuing to a country where tax may apply.
- Invoices are not legal tax invoices in every country by default: some countries require specific wording or fields. Ask your adviser what each target country needs and tell me, then I add them.
- Refunds, credit notes and write-offs are handled outside the system for now (void is for unpaid invoices only).
- Prices are USD only.
