# Launch checklist

Date: November 9, 2026. A single list of what stands between the current build and the live site. Each item names who must act. Items marked BUILT are done in the code and tested; they do not need action unless an owner decision is recorded against them.

## A. Owner decisions (required before the matching feature is switched on)
| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| A1 | Partner fee amounts (P-6) | Showing fees, `PUBLIC_FEES`, `PUBLIC_APPLY` | Publish after approval, same day on the join page |
| A2 | Level thresholds, Gold commitments, badge licence (P-15 to P-17) | Level promotions | Keep at Bronze until thresholds are approved |
| A3 | Trainer thresholds (P-5) | Trainer levels | Single "Approved Trainer" level now |
| A4 | Renewal period (P-11) | Renewal reminders | One year, with a three-year option and annual review |
| A5 | Material-change categories (P-12) | Change notices | Adopt the six categories after counsel review |
| A6 | Names for the four staff positions | Governance page, roles | Name them before the governance page is published |
| A7 | First specialty and scope | First listed provider | Choose the scope with the first partner |
| A8 | Allowed exception types | Exceptions | Short list, reviewed by counsel |
| A9 | Public claims wording (D-C) | Marketing copy | Use the footer disclaimer as the standard |
| A10 | Individual account terms (I-1) | `INDIVIDUAL_ACCOUNTS` | Required before enabling sign-up |
| A11 | Membership plan names and prices | `MEMBERSHIP_SALES` | Approve in the admin before enabling |
| A12 | Certificate design (P-21, P-22) | Certificate templates | Stays parked until the owner reopens it |

## B. Counsel review (owner forwards)
| # | Document | Status |
|---|---|---|
| B1 | Partner agreement text (P-7) | Draft in `docs/legal`, not published |
| B2 | Records retention periods (P-14) | Schedule drafted, periods open |
| B3 | Privacy policy, terms of use, cookie notice, accessibility statement | Drafts, not published |
| B4 | Governance structure, impartiality statement, course quality standard, how LIV works | Drafts, not published |
| B5 | Refund and cancellation rules (partner plans) | Open; see `docs/FEES.md` §12 |
| B6 | Email footer | Open |

## C. Technical setup (owner or operator)
| # | Item | Notes |
|---|---|---|
| C1 | Separate production from preview (own database or schema) | Required before any real data |
| C2 | Email sending: SMTP provider, SPF, DKIM, DMARC | Without it, messages stay queued |
| C3 | Payment: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` | Until set, payments are recorded by hand |
| C4 | `CERT_HMAC_SECRET` fixed for production, never rotated casually | Changing it changes the verification key |
| C5 | `BADGE_SIGNING_KEY` set separately | Badges otherwise derive from the certificate secret |
| C6 | Delete `ADMIN_RESET_PASSWORD` after first sign-in | Required before launch |
| C7 | Two-step sign-in on the admin account | Required before launch |
| C8 | Monthly partner invoices | Only after the payment provider confirms recurring invoices |

## D. Feature switches (set only when A and B are done for that feature)
| Switch | Turns on | Requires |
|---|---|---|
| `PUBLIC_APPLY` | Public partner application; join page shows "Start free" | A1, C1, C2 |
| `PUBLIC_FEES` | Public fee schedule | A1 |
| `INDIVIDUAL_ACCOUNTS` | Individual sign-up | A10, B3, C2 |
| `MEMBERSHIP_SALES` | Membership purchase | A11, C3, B1 |
| `MEMBERSHIP_WAITLIST` | Waitlist and announced plans | A11 |
| `PRODUCT_SALES` | Resource purchases | A1 for each product, C3 |
| `NEWSLETTER_SENDING` | Newsletter sends | C2, consent records, B3 |

## E. Already built and tested (no action)
- Credential verification, PDF and QR, revocation, tamper detection.
- Partner application, review, separated decisions, activation, levels, public register and search.
- Digital badges (Open Badges 3.0, signed), with membership and credential badges.
- Individuals portal: accounts, credential claims, dashboard, support, privacy export.
- Membership: plans, invoices, activation once, renewal, expiry, public check.
- Resources, library, newsletter consent, events, expert network, contributions.
- Group packs and gifts; training quote requests routed fairly.
- Partner join page and funnel counters, without personal data.
- Automated checks: 154 unit tests and 824 end-to-end checks passing as of November 8, 2026.

## F. Suggested order
1. A1, A10 and A11 decisions, with B1 and B3 to counsel.
2. C1 and C2, then C3 to C7.
3. Switch on `PUBLIC_APPLY` first, after A1 and C1 to C2 are complete.
4. Switch on the individual and membership features only after their own items are complete.
5. Repeat the full test run on the production-like database before each switch.
