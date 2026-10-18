# LIV website blueprint: structure, visitor experience and the Education Partner process

Status (October 18, 2026): briefing document for an external technical review (for example Codex). It describes the live platform as built, the target structure for a professional credentialing body, and the Education Partner authorization process. It does not change anything by itself. Items marked **proposed** need the owner's approval.

Repository: `almakiy/LIV-US`, branch `claude/blissful-sagan-wp14xp`. Live app: Replit "US LIV" (`https://us-project.replit.app`). Planned domain: `livcredentials.org`.

## 1. Who LIV is and what the site must do
- **Identity:** LIV (Leadership Institute of Validation), LIV LLC, Virginia, United States.
  - A U.S. professional credentialing body that develops and awards its own credentials.
  - International approach; serves partners worldwide.
  - GCC and MENA are its first markets.
- **The site serves five audiences:**

  | Audience | Main task on the site |
  |---|---|
  | Employers and regulators | Verify a credential in seconds |
  | Credential holders | Find, share and prove their credential |
  | Training providers | Apply, issue credentials, manage billing |
  | Professionals and researchers | Read the Knowledge Hub, contribute research |
  | LIV staff | Run issuance, partners, content, quality records |

- **Benchmark bodies for structure:** IAPP, IIA, SHRM, CIPD, ICA, ACAMS, PMI, OCEG.
  - The site follows the patterns readers expect from such bodies:
    - verification first;
    - a public register;
    - published schemes;
    - published policies;
    - a knowledge hub;
    - a regional presence.
  - Their text, names and designs are never copied.

### Guardrails (must hold in every proposal)
1. No invented claims, accreditations, approvals, recognitions or regulatory statuses. No present ISO/IEC 17024 accreditation or conformity claim. The current edition is ISO/IEC 17024:2026; any gap analysis uses it.
2. Historical credential PDFs are never regenerated, altered or invalidated.
3. New credentials carry LIV identity only; the training provider appears on the verification record, never on the credential face.
4. No automatic AI publication; a named human reviewer publishes every Knowledge Hub item.
5. The HSE Governance scheme stays IN DEVELOPMENT; its title, rules and fees are not defined on the site.
6. The wording of the public claims statements is under owner review (decision D-C). Proposals may suggest wording but must not change it.
7. Secrets live in Replit Secrets. Do not change DNS or the registrar. Do not break the live deployment. Do not rebuild the platform from scratch or replace working architecture.

## 2. Technology (keep; extend, do not replace)
- **Stack:** Node.js, Express, EJS server-rendered views, PostgreSQL, PDFKit for credentials, Playwright for end-to-end tests.
- **Built modules:**
  - issuance by CSV, Excel, Google Sheets and API;
  - HMAC-signed records, QR codes and public verification;
  - certificate designs;
  - partner portal with 2FA and agreements;
  - billing with Stripe Checkout;
  - quality records with a hash-chained audit log;
  - Knowledge Hub with reviewer gate, automated Reviewer engine, review packs and scheduled release;
  - Content API;
  - credential schemes and partner scopes.
- **Tests:** 82 unit tests and 243 end-to-end checks, all passing.
- **Docs to read first:**
  - `docs/BUILD-PLAN.md` (phases and decisions);
  - `docs/REPOSITIONING.md`;
  - `docs/STRATEGY-JURISDICTION-LANGUAGE.md`;
  - `docs/REFERENCE-FRAMEWORKS.md`;
  - `docs/GOVERNANCE-LIBRARY.md`;
  - `docs/EDITORIAL-CALENDAR.md`;
  - `docs/PARTNER-GATEWAY.md`.

## 3. Site map

### 3.1 Live today (public)
| URL | Page |
|---|---|
| `/` | Home |
| `/verify`, `/verify/:id`, `/verify/:id/pdf` | Verify a credential (search, result, PDF) |
| `/credentials`, `/credentials/:slug` | Credential classes and schemes (scheme pages show "in development" where true) |
| `/partners`, `/partners/:slug` | Public register of authorized training providers, with scope |
| `/knowledge`, `/knowledge/:slug` | Knowledge Hub list and article |
| `/about`, `/contact`, `/fees`, `/apply` | About, contact, fee page (flag), partner application (flag, off) |
| `/rss.xml`, `/sitemap.xml`, `/robots.txt` | Feeds and indexing |
| `/login`, `/portal/*`, `/admin/*` | Partner portal and LIV administration (private) |

Main navigation now: Verify · Credentials · Partners · Knowledge · About · Contact, with a utility bar link "Verify a Credential".

### 3.2 Target information architecture (proposed)
```
Home
├── Verify                  verify by ID or QR · bulk verification for employers · report a suspected fake
├── Credentials             credential classes · schemes (status shown honestly) · how credentials work
│   └── Scheme page         purpose · body of knowledge · eligibility · assessment · validity · fees · policies (only when approved)
├── Training Providers      the program · how authorization works · criteria · fees · apply · public register
│   └── Register entry      partner · country · authorized scope · dates · status
├── Knowledge Hub           guides · reference frameworks · research digests · tools/templates · glossary
│   ├── Collections         by monthly theme (editorial calendar)
│   └── Research program    call for topics · submission guidelines · published contributions
├── Standards & Policies    LIV standards (Track S) · policies: impartiality, complaints and appeals, verification,
│                           privacy, terms, use of the LIV mark, records retention
├── Regions                 MENA and GCC hub (English and Arabic): regional application content, country acceptance guides, contacts
├── About                   who we are · governance (bodies and committees once formed) · people · annual transparency report
└── Contact                 enquiry routing: verification, partners, holders, media
Footer: policies · register · verify · RSS · LinkedIn · legal identity (LIV LLC, Virginia)
```
Navigation target: **Verify · Credentials · Training Providers · Knowledge · Standards & Policies · Regions · About**, with the "Verify a Credential" button kept in the utility bar.

## 4. Page blueprints (visitor experience)
Each page lists its sections in order. Existing pages are improved in place.

### 4.1 Home
1. **Hero.**
   - One sentence on what LIV does.
   - Two actions: "Verify a credential" and "Become an Education Partner".
2. **Verification strip.** Inline credential ID field with a link to bulk verification.
3. **What we do.** Three cards: credentials, training provider authorization, knowledge.
4. **Credential classes.** Training Completion Credential, and the classes in development, each with an accurate status.
5. **Latest from the Knowledge Hub.** Three newest released items, from scheduled release.
6. **Public register teaser.** Count of authorized partners and a search link.
7. **Regions.** A small band naming MENA and GCC as served regions, with a link to the hub.
8. **Footer.**

### 4.2 Verify (most important page)
- **Search.** Search by credential ID or QR scan. A short note explains what verification confirms.
- **Result card:**
  - status (valid, revoked, suspended);
  - holder name as issued;
  - credential title and record type;
  - issue date;
  - issuer LIV;
  - education provider and its authorized scope;
  - signed-record check;
  - PDF download.
- **Failure states:**
  - "No record found", with guidance;
  - a "report a suspected fake" link.
- **Planned:**
  - bulk verification for employers (CSV upload or API);
  - verification API docs for integrators.
- **Performance and caching.** Fast worldwide, but never cache a revoked status as valid.

### 4.3 Credentials and scheme pages
- **Credential classes page.** Shows what each class means, how it is earned, and what it does and does not assess, in positive wording.
- **Scheme page layout.** It follows the bodies above:
  - purpose and target roles;
  - body of knowledge or competence standard;
  - eligibility;
  - assessment method;
  - validity and renewal;
  - fees;
  - candidate handbook;
  - policies;
  - status and version.
- **Unapproved content stays off the page.** Sections without approved content are not shown. The scheme shows "In development" and a "notify me" option.

### 4.4 Training Providers
- **Program overview.** Who can apply, benefits, and responsibilities.
- **"How authorization works".** The steps in §5, shown as a timeline.
- **Criteria, fees, agreement summary and apply button.** The button links to the application once Phase 2 opens it.
- **Public register.**
  - Search and filter by country, scope and status.
  - Each entry shows authorization dates and status per scope.

### 4.5 Knowledge Hub
- **Listing.** Filters by category, kind and jurisdiction, plus a collection (monthly theme) view and RSS.
- **Article page:**
  - document control block (audience, scope, edition, dates);
  - body;
  - numbered sources with access dates;
  - "Reviewed by" name;
  - AI-assistance disclosure when used;
  - related items.
- **Release.** One reviewed item a week, Tuesday 12:00 UTC, by scheduled release.
- **Research program page (S.7):**
  - topics;
  - submission template;
  - author agreement and license;
  - conflict-of-interest declaration;
  - review process;
  - published contributions with author names.

### 4.6 Standards & Policies (proposed new section)
- **LIV standards.** Each standard follows `docs/STANDARD-TEMPLATE.md` and shows:
  - code, version and status;
  - public comment window;
  - comment log.
- **Policies.** Rendered from approved controlled documents in the quality records (task 1.6):
  - impartiality statement;
  - complaints and appeals;
  - credential verification policy;
  - privacy notice and terms;
  - use of the LIV name and mark by partners and holders;
  - records retention.
- **Rule.** A page cannot be published until its document is approved.

### 4.7 Regions (proposed new section, task M.5)
- **MENA and GCC hub**, in English and Arabic:
  - regional application content (the GCC governance map);
  - country acceptance guides written from official sources;
  - regional contacts;
  - Arabic editions of selected Knowledge Hub items, with English as the authoritative text.
- **Homepage identity stays international.**

### 4.8 About
- Who LIV is, and legal identity.
- Governance: bodies and committees, shown only once formed.
- People.
- Annual transparency report: figures on issuance, verification and complaints, published once there is an operating year.

## 5. How Training Providers are authorized
"Authorization" is LIV's term for approving a training provider to deliver training that leads to LIV credentials, within a defined scope. Partners are "Authorized Training Providers", not "accredited". LIV issues the credential; the partner delivers the training and reports completions.

### 5.1 The process (target)
| Step | What happens | Records | Status |
|---|---|---|---|
| 1. Enquiry and application | Online form: legal entity, country, contacts, the programs and scope requested, documents | Application record | Form built, behind a flag (`PUBLIC_APPLY`); v2 with document uploads in Phase 2 (task 2.4) |
| 2. Screening | Identity and legal standing checked; sanctions screening against official lists; conflict-of-interest check of LIV reviewers | Screening record (list, date, result, reviewer) | Planned (task 2.7) |
| 3. Document review | Reviewer assesses the application against published criteria (§5.2); may request information | Review notes; states: submitted, under review, information requested | Planned (task 2.4) |
| 4. Assessment | Evidence of trainers' competence, course content against the LIV scope, facilities or delivery platform, assessment and records practice; remote or on-site review as the criteria require | Assessment report | Criteria **proposed**, owner approval needed |
| 5. Decision | A named LIV decision-maker (not the reviewer who assessed) decides: approved, approved with conditions, or declined, with a recorded reason | Decision note; conditions with due dates | Planned (task 2.4) |
| 6. Agreement | Partner accepts the active Partner Agreement (typed name, time, version recorded) | Acceptance record | **Built** (`/portal/agreement`); agreement text from counsel still needed |
| 7. Scope and catalog | LIV records the authorized scope (credential family, from/until dates, basis note) and the partner's course catalog under it | `partner_scopes`, catalog | Scopes **built**; catalog in Phase 1 (task 1.3) |
| 8. Onboarding | Checklist: agreement, billing details, 2FA, first certificate template, test issuance | Checklist | Planned (task 2.5); 2FA and billing details built |
| 9. Listing | Partner appears on the public register with country, scope, dates and status | Register entry | **Built**; dates per scope in Phase 1 (task 1.5) |
| 10. Issuance | Partner reports completions (CSV, Excel, Sheets or API); LIV issues signed, verifiable credentials within the scope and catalog | Batches, credentials, audit log | **Built**; out-of-catalog warning, then block (D-1.2) |
| 11. Monitoring | Annual review; sampling of issued credentials against training records; complaints handling; invoice and conduct checks | Review records, cases, actions | Quality records and cases **built**; schedule **proposed** |
| 12. Renewal, suspension, withdrawal | Authorization renews on review. Suspension or withdrawal of a scope is shown on the register and on affected verification records. Credentials already issued stay verifiable | Status history, audit log | Scope status **built**; reminders in Phase 2 (task 2.6) |

### 5.2 Authorization criteria (proposed, for owner approval)
- **Legal standing:** registered legal entity in good standing; named responsible person.
- **Delivery capability:** qualified trainers for the scope (CVs and evidence), course outlines mapped to the LIV scope, suitable facilities or online platform.
- **Learner protection:** enrollment terms, records of attendance and completion kept for a stated period, complaints procedure.
- **Integrity:** no conflict that would compromise the training; honest marketing that uses LIV's name and mark only as the partner agreement allows; consent to sampling and review.
- **Local compliance:** the partner holds any local license its country requires for training. LIV authorization does not replace local approval.

### 5.3 Impartiality safeguards (proposed)
- **Separation of roles.**
  - Reviewers do not train candidates.
  - The person who assesses a partner does not decide on it.
- **Agents and regional representatives** may introduce partners but never influence decisions. They are paid by referral, not by outcome.
- **Appeals.** Decisions can be appealed under the published complaints and appeals policy.

## 6. Design system and quality standards
- **Visual identity.**
  - LIV seal, colors and typography from `public/brand/` (served at `/static/brand/`).
  - Three certificate designs: Executive, Classic and Modern.
  - Design changes are previewed before they are applied.
- **Accessibility:** WCAG 2.1 AA (contrast, keyboard navigation, focus states, alt text, form labels).
- **Languages:**
  - English is the language of record.
  - Arabic right-to-left pages for key pages and the Regions hub (tasks M.1, M.5).
  - `hreflang` on translated pages.
  - Arabic exams only later, under the ITC guidelines.
- **Search and sharing:**
  - JSON-LD (Organization site-wide; Article on articles);
  - sitemap and RSS;
  - social cards;
  - clean URLs.
- **Security:**
  - HTTPS;
  - secure cookies in production;
  - CSRF on every form;
  - 2FA for staff, and later for partners;
  - rate limits on login and verification;
  - `security.txt`;
  - no secrets in the repository.
- **Performance:** server-rendered pages, compressed assets, image sizing, CDN for verification pages.
- **Records:** every publishing, issuance, scope and decision action is written to the audit log.

## 7. Phased roadmap (from `BUILD-PLAN.md`)
| Phase | Focus |
|---|---|
| 0 | Protect what is live (built; owner checks pending: production mode, secrets, backups) |
| 1 | Finish repositioning; partner scope and catalog; policy pages; register dates; structured data |
| 2 | Email; full partner gateway (application v2, onboarding, reminders, sanctions screening) |
| 3 | Scheme governance and internal clean-up |
| 4 | Holder accounts, transcript and digital badges (Open Badges 3.0) |
| 5–7 | Assessed qualification pilot, examination engine, certification lifecycle, CPD, membership |
| Tracks | K (Knowledge Hub), M (Arabic and Regions), S (LIV standards, research program), P (publications), O (owner and counsel) |

## 8. Questions for the reviewer
1. **Information architecture.** Is the target in §3.2 the right shape for a credentialing body serving U.S. and MENA audiences? Is anything missing, or anything that should be merged?
2. **Verification experience.** What would make verification faster and more trustworthy for employers? Consider bulk checks, the API, and fraud reporting.
3. **Partner process.** Is §5.1 complete and in the right order? Which steps should be automated first in Phase 2?
4. **Navigation and Regions.** How should navigation and the Regions hub be built in the current Express and EJS stack, with an Arabic right-to-left layout, without a rewrite?
5. **Readiness for a future ISO/IEC 17024:2026 gap analysis.** Which records, separations of duty and published documents should the platform support early, so a later analysis is easier? This is preparation only, with no conformity claim.
6. **Accessibility, performance and security gaps.** Which gaps do you see in the current views?
7. **Order of work.** What sequence of changes do you recommend, keeping every guardrail in §1?

Please answer as a reviewed proposal: findings, recommended changes per page, and their order. Do not change code until the owner approves.
