# LIV — Knowledge engines, content model and course platform (design)

Status (October 5, 2026): the site side and the **Reviewer engine scaffold are built**; the Producer and Scout are not. It extends Phase 3 (knowledge hub, built).

| Part | State |
|---|---|
| Content model, human reviewer sign-off, versions, service keys, draft-only Content API | Built and tested |
| Review scope on the API (queue, full draft, report per version), review panel in the editor, publish gate on a blocking report (with a recorded override reason) | Built and tested |
| **Reviewer engine** (`engines/`): identity and legal rules, citations, standards registry, similarity, structure, dates and links, claim check (offline lexical method, or a model when configured) | Built and tested; runs offline and free by default |
| Model access with spend guard (monthly cap, usage ledger, kill switch; refuses to run without key, prices and budget) | Built and tested; **not connected to any paid model until you add a key and a budget** |
| Producer engine (drafting from an evidence pack) | Not built |
| Scout engine (horizon scanning of primary sources) | Not built |

### Running the Reviewer
- Offline, free: `npm run engine:review-file -- path/to/draft.json` (draft JSON uses the Content API fields, sources may carry an `excerpt`). Exit code 0 pass, 2 needs changes, 3 block.
- Against the site: create a service key with scope `content:review` under Admin → Service keys, set `ENGINE_SITE_URL` and `ENGINE_SERVICE_KEY`, then `npm run engine:review-queue`. It reviews every draft that has no report for its current version or that an editor asked to review, and posts one report per draft. In the editor, "Request automated review" queues a draft.
- Spend: `npm run engine:usage`. Default provider is `mock` (no network, no cost). To use a model set `ENGINE_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (Secrets, never in code), `ENGINE_BUDGET_USD`, `ENGINE_PRICE_IN_PER_MTOK`, `ENGINE_PRICE_OUT_PER_MTOK` (from the provider's current price list) and optionally `ENGINE_MODEL`. Without all of them the paid provider refuses to run. Switch everything off with `ENGINES_ENABLED=false` or a file named `KILL` in `engines/data/`.
- The standards registry (`engines/data/standards-registry.json`) is a starter list with `verified_on: null`. Editors must verify each entry against the publisher; the Reviewer only flags mismatches for a person to check.
- A report never publishes or edits anything. A blocking report stops publication until the findings are fixed or a person records an override reason (kept in the audit log).



## 1. Decision: external engines, internal source of truth, one API between them

| Option | For | Against |
|---|---|---|
| **A. Everything inside the website** | One deploy, simplest at first | The web server would hold LLM keys and crawl arbitrary URLs (SSRF and secret-leak risk); long jobs and schedulers do not belong in a request/response app; hard to swap models or scale cost |
| **B. Everything outside** | Isolated, scalable | Two sources of truth for content, duplicated review state, harder to show review history on the public page |
| **C. Hybrid (chosen)** | Website stays the **system of record** (articles, versions, reviewers, publish state). Engines run as a **separate service** and talk to the site only through a scoped API | One more service to run; needs a clean API contract |

Why C: the website must stay small, fast and safe (it also issues certificates). Engines are experimental, change often, call paid models and fetch external content, so they are isolated by design. Because the site owns publishing, **no engine can publish**: engines create drafts, a human approves.

Start cheaply: the engines live in this repository under `engines/` as a separate process with its own database schema and **only call the public Content API**, the same way an external service would. Moving them to their own host later is then a deployment change, not a rewrite.

## 2. The three engines

### 2.1 Scout (scouting and horizon scanning)
Finds what is new, from primary sources only, and turns it into **signals** for editors.
- **Source registry** with trust tiers: Tier 1 primary (regulators, standards bodies, accreditation bodies: OSHA, NIOSH, CSB, HSE, EU-OSHA, ISO and IAF news, ANAB, CQI/IRCA, IOSH, NEBOSH, PMI, ASQ); Tier 2 peer-reviewed (PubMed, Crossref, OpenAlex, journals); Tier 3 reputable media (context only, never the sole basis).
- **Collectors:** official APIs and RSS first (Federal Register, Crossref, PubMed, OpenAlex), then polite scraping of public pages (robots.txt, rate limits, identifiable user agent).
- **Change detection:** content hash and edition/version fields, so "ISO 45001:2018 amended" or "OSHA rule updated" is a signal, not a guess.
- **Signal record:** what changed, source URL, date, quoted excerpt with location, topic tags (Quality / Safety / Project Management), relevance score, duplicate group. A weekly digest goes to editors.
- **Copyright:** store metadata and short quotes with links. Never copy paywalled standards text; reference clause numbers and public summaries only.

### 2.2 Producer (content drafting)
- Input: a signal or an editorial brief + a **content-type template** (section 4).
- It first builds an **evidence pack** (the cited sources, with the exact passages). It writes **only from the evidence pack**, not from open browsing or model memory.
- Every factual claim carries a citation to an evidence item. Output is structured (front matter + Markdown) and lands as a **draft** via the API.
- Voice and identity come from a machine-readable **LIV style guide** (US English, plain and formal, no hype).

### 2.3 Reviewer (scientific and editorial audit)
A separate engine with a **different prompt and, ideally, a different model** from the Producer, so it does not grade its own work.
1. **Claim check:** each claim is matched to its cited passage; unsupported or contradicted claims are flagged.
2. **Standards check:** standard numbers, editions, clause numbers and dates are validated against a standards registry we maintain.
3. **Numbers, units, dates and links:** consistency and link health.
4. **Similarity check** against sources (copyright and plagiarism).
5. **Identity and legal lint:** rules from the legal guardrails: no government or federal implication, no "ISO accredited" or equivalence claims, no guarantees, US spelling, English only, no education-partner promotion, required disclaimers.
6. **Report:** score, blocking flags, suggestions. Result is `pass`, `needs_changes` or `block`.
Publishing requires **no blocking flags AND a named human subject-matter reviewer and an editor** to sign. AI cannot certify truth; it narrows what humans must check.

## 3. Pipeline and freshness
`signal → brief → draft → auto-review → human SME review → editor approval → published → scheduled re-review`

- Every published item has `reviewed_by`, `reviewed_at`, `next_review_at` (default 12 months), the standards and editions it relies on, a version history and an "AI-assisted, human-reviewed" disclosure.
- When Scout detects a new edition of a standard an item cites, the item is automatically marked **stale** and a re-review task is created. "Always current" is the differentiator against static libraries.

## 4. Content types (what the large accreditation sites publish, adapted to LIV)

| Type | Model | Review level |
|---|---|---|
| **Guides** (evergreen explainers: "Guide to ISO 45001 internal audits") | BSI knowledge hub, OSHAcademy articles | SME + editor |
| **Standards and regulations explained**, plus **"What changed"** on each revision | BSI, IRCA technical briefings | SME + editor + legal lint |
| **Accreditation standards and criteria** (LIV's own published requirements for partners, trainers, curricula, methods; versioned) | IRCA course/auditor criteria, NEBOSH centre requirements | Governance board |
| **Case studies** (incident or quality-failure analysis from public investigations such as CSB and OSHA; project failures) with lessons learned | IOSH, NEBOSH | SME + editor; public sources only |
| **Research digests** (plain-language summaries of peer-reviewed studies with citations) | IOSH research | SME + editor |
| **Technical briefings and white papers** | BSI, IRCA | SME + editor |
| **Practical tools** (checklists, audit questionnaires, templates, calculators; later paid booklets) | OSHAcademy, IOSH | SME |
| **News and alerts** (Scout-driven "What's new") | all | Editor |
| **Glossary and FAQs** | all | Editor |
| **Candidate guidance, sample questions, examiner reports** (Phase 9) | NEBOSH, IRCA | Exam board |
| **Course pages** (Phase 6) | NEBOSH, IRCA course finder | Accreditation team |
| **Public registry** of accredited partners and certificate verification (exists) | IRCA directory | Automated |

## 5. Content API (site side)
- Base `/api/v1/content`, authenticated with **service keys** (separate from partner API keys), scoped (`content:draft`, `content:read`), HMAC-signed requests, idempotency keys, rate limits, audit log.
- Engines may: create or update **drafts**, attach evidence and review reports, read status. They may **not** publish, delete or edit published items.
- Site to engines: webhooks on `approved`, `rejected`, `changes_requested` so engines learn from editor decisions.
- OpenAPI spec kept in `docs/`.

New tables (site): `sources`, `signals`, `evidence_items`, `briefs`, `content_versions`, `review_reports`, `review_flags`, `service_keys`; extend `articles` with type, standards, reviewers, `next_review_at`, version, disclosure.

## 6. Build order (1 and 2 built; the model-backed claim check is ready but needs your key and budget)
1. **Content model and Content API on the site** (types, versions, review states, reviewer sign-off, public "Reviewed by / Last reviewed / Sources").
2. **Reviewer first:** useful immediately on human-written content and it becomes the quality gate for everything else.
3. **Producer** using the Reviewer as its gate.
4. **Scout** feeding signals to editors, then to the Producer.
Controls throughout: per-engine budget caps, logs of prompts and sources, kill switch, and a rule that engine output is always a draft.

## 7. Direction: curricula, approved partners and examination
Superseded by `CREDENTIAL-MODEL.md` (owner decision, October 5, 2026): LIV does not deliver training; it designs its own curricula and course packs with its accredited partners, partners train and issue completion certificates, and candidates register with LIV for the examination and the official LIV credential. The Producer and Reviewer engines support the curriculum studio and exam-bank authoring described there, under the impartiality safeguards in that document.

## 8. Decisions needed from the owner
1. Approve the hybrid architecture (external engines, site as source of truth).
2. Which model provider and monthly budget for the engines.
3. Who are the human reviewers (at least one SME per topic: Quality, Safety, Project Management) and the editor.
4. Approve the initial Tier 1 source watch list.
5. Priority topics and content types for the first 90 days.
6. Impartiality safeguards (see `CREDENTIAL-MODEL.md` §4).
