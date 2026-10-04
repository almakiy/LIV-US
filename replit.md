# LIV LLC — US Training Accreditation Platform

A multi-tenant accreditation and secure certificate issuance platform with public verification, provider administration, and LIV staff oversight.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (managed port 8080)
- `pnpm --filter @workspace/liv-platform run dev` — run the web app at the root preview path
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required runtime configuration: managed PostgreSQL `DATABASE_URL`, `SESSION_SECRET`, and the provisioned App Storage configuration. Never print secret values.
- For an empty production database, initialize the first staff account through `LIV_ADMIN_EMAIL` and `LIV_ADMIN_PASSWORD` Secrets (password minimum 16 characters). Bootstrap creates only the first staff account and never resets existing accounts. Development demo credentials are not exposed in production.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Web: React, Vite, Tailwind, Wouter, TanStack Query
- PDFs: PDFKit, QRCode; private App Storage
- Build: esbuild (ESM bundle), with PDFKit externalized for its font assets

## Where things live

- `artifacts/liv-platform/src/pages/` — public, provider, and staff pages
- `artifacts/api-server/src/routes/` — auth, public, portal, admin, and v1 APIs
- `artifacts/api-server/src/lib/` — security, issuance, PDFs, storage, bootstrap, demo seed
- `lib/db/src/schema/` — Drizzle database source of truth
- `lib/api-spec/openapi.yaml` — API contract; regenerate with codegen after changes

## Architecture decisions

- Local email/password authentication is explicitly required. Passwords use scrypt, opaque sessions are hashed in PostgreSQL, cookies are HttpOnly/SameSite and Secure in production.
- Certificates retain immutable holder snapshots so trainee profile edits do not alter historic credentials.
- Issuance locks the provider row and commits the batch, certificates, idempotency result, and issuance audits together. Expired/revoked credentials do not block reissuance.
- PDFs remain private in storage; downloads require scoped sessions or matching verification tokens. Logos are limited to PNG/JPEG under 2 MB.

## Product

- Public: accreditation application, information pages, contact messages, ID/QR verification, PDF download, LinkedIn add-to-profile link.
- Provider: dashboard, five-step CSV issuance plus result, row editing/validation/skipping, templates, records/revocation, branding/logo settings, API key creation/revocation, API docs.
- Staff: accreditation approvals/suspensions, all certificates, audit logs, contact messages, verification analytics.
- Never claim endorsement or accreditation by OSHA, ANSI, ISO, PMI, or a government body. Alignment with frameworks is descriptive, not endorsement. Leadership names are intentionally placeholders until supplied.

## User preferences

- First build: do not run end-to-end testing or code review. Basic compilation, API checks, and screenshots are allowed.
- Keep the interface English LTR, navy/white, minimal, professional, responsive.

## Gotchas

- Use managed artifact workflows; API paths are routed under `/api`, the web artifact under `/`.
- Demo accounts and certificates are development-only; use the login page's demo buttons. The reserved demo passwords rotate on development server startup.
- Generated API clients and Zod files must not be hand-edited.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
