# LIV Content API (knowledge engines)

Base URL: `/api/v1/content`. For the engines described in `KNOWLEDGE-ENGINES.md`. Created by the site owner under **Admin → Service keys**; the key is shown once.

Authentication: `X-API-Key: <service key>` (or `Authorization: Bearer <key>`). Keys are stored only as SHA-256 hashes. Default scopes: `content:draft`, `content:read`. Rate limit: 120 requests/minute per IP.

**What engines can and cannot do**
- Can: create or update their own **drafts**, and read the status of their own items.
- Cannot: publish, unpublish, delete, or change published content. Publishing is done in the admin Content editor by a named human reviewer ("Reviewed by" is required). If an engine updates a draft after review, the reviewer's sign-off is cleared.
- Content must use English (Latin) letters. Source links must be http(s).

## POST /drafts — create or update a draft (idempotent on `external_id`)
```json
{
  "external_id": "signal-2026-10-001",
  "title": "ISO 45001 internal audits: what to check",
  "summary": "Up to 300 characters.",
  "body_md": "## Heading\n\nMarkdown. Raw HTML is stripped on display.",
  "category": "quality | safety | project-management",
  "kind": "article | guide | research | standards | case-study | briefing | tool | news | glossary",
  "author_name": "optional",
  "tags": ["audit", "iso-45001"],
  "standards": ["ISO 45001:2018"],
  "sources": [{ "title": "ISO 45001", "url": "https://www.iso.org/standard/63787.html", "publisher": "ISO", "accessed": "2026-10-05" }],
  "ai_assisted": true,
  "change_note": "Initial draft from signal ..."
}
```
Responses: `201` created, `200` updated (version +1 when content changed), `409` the item is already published (submit a new draft with another `external_id` and describe the revision in `change_note`), `422 { errors: [...] }` validation, `401/403` auth or scope.

Response body: `{ id, external_id, slug, title, kind, category, status, version, ai_assisted, review: { reviewed_by, reviewed_at, next_review_at }, published_at, updated_at, public_url, created }`.

## GET /articles — list your items (`?status=draft|published`, max 100)
## GET /articles/{id or external_id} — one of your items (to learn the editor's decision)

## Planned next
Webhooks to the engines on `approved`, `rejected`, `changes_requested`; evidence items and review reports (Reviewer engine); `content:review` scope for the Reviewer to attach reports.
