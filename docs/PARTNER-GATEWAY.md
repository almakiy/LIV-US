# Partner gateway slice (account security, agreement, billing)

Built October 5, 2026 as the part of the partner gateway that must exist before the platform takes money from partners (see `GLOBAL-STRATEGY.md` §1). The public application form and review workflow remain as before (`PUBLIC_APPLY`, off by default).

## Two-factor sign-in
- Authenticator app (TOTP, RFC 6238; tested against the official test vectors). Any user can turn it on at **Account security** (`/account/security`): scan the QR code, enter a code, save the **10 single-use recovery codes** (shown once, stored only as hashes).
- At sign-in a correct password is not enough once 2FA is on: a code is asked next (5 attempts, 5 minutes). A code cannot be used twice; recovery codes work once.
- The shared secret is stored **encrypted** (AES-256-GCM). Key: `TOTP_ENCRYPTION_KEY`, or derived from `CERT_HMAC_SECRET` (which must never change).
- Policy: `REQUIRE_2FA=admin` forces LIV administrators to set it up before they can use the admin area; `all` also covers partners. Default is optional.
- Turning it off needs the password and a current code. A LIV administrator can reset a partner user's 2FA from the partner's page (recorded in the audit log).

## Passwords
- Users can change their password at Account security (current password required, 10+ characters); other sessions are signed out.
- **Temporary passwords force a change at first sign-in**: set when LIV creates a partner account, when a partner adds a colleague, and when an administrator resets a password. Reset: Admin → Training platforms → the partner → "Reset password" (shows a temporary password once). Email-based self-service reset arrives with the email phase (2b).

## Partner agreement
- Admin → **Agreements**: versions with the text supplied by counsel. The starter outline carries `[PLACEHOLDER]` markers and **cannot be activated** until they are replaced. Only one version is active; activating a new one retires the old.
- Every partner user is held at `/portal/agreement` until the partner has accepted the **active** version (tick the box and type the full name). Recorded: partner, agreement version, user, typed name, time, hashed IP and browser. LIV staff acting on behalf of a partner are not blocked.
- A new active version asks all partners to accept again. The partner's page shows its acceptance status; the assessor pack (Compliance → Download) includes agreements and acceptances.

## Billing details
Partners enter billing name, email, address and tax/VAT number under Settings; LIV sees them on the partner's page. They feed invoicing in the commerce phase.

## Still to build in the full gateway
Public application with document uploads and a review workflow with conditions, onboarding checklist, renewal reminders, email-based password reset, sanctions screening at onboarding.
