# LIV — Global (non-US) market strategy, site structure, marketing and operations

Status: plan (October 5, 2026). Facts about laws, taxes and other bodies are general public knowledge and **must be confirmed with counsel, a tax adviser and the body concerned** before acting or claiming anything.

## 1. Delivery order (owner's priority, with dependencies)

| # | Phase | What it delivers | Notes and dependencies |
|---|---|---|---|
| 1 | **Knowledge engines** | Producer and Scout (Reviewer scaffold exists) | Needs model key, budget, named human reviewers, approved source list. Content is the engine of search traffic and credibility |
| 2 | **Commerce** | Stripe through LIV LLC: partner accreditation and annual fees, per-certificate fees, invoices, digital booklets, bank-transfer invoicing | Needs the small slice of the partner gateway listed in #3 (agreement acceptance, billing contact, password reset, 2FA). Start with manual invoices if cards are uncommon in a market |
| 3 | **Partner gateway** | Public application, document uploads, review workflow, conditions, agreement acceptance, onboarding, renewal reminders, password reset and 2FA | **Pull the account-security and agreement parts forward into step 2**: taking money without them is risky |
| 4 | **Badges** | Open Badges 3.0 and LinkedIn add-to-profile with a badge | Small and visible; strengthens learner value |
| 5 | **Examinations** | Candidate accounts, eligibility from completion records, exam application and payment, proctored exams, the LIV credential | The long-lead items are not software: job-task analysis, exam content outline, item writers, psychometric advice, proctoring vendor, governance board. **Start that non-software work in parallel with #1–#4** |
| 6 | **Course catalogue** (and curriculum studio) | Public course finder, LIV course packs licensed to partners | Needs the exam content outline so curricula and exam share one basis |
| 7 | **Recognition by other bodies** | ISO 9001/21001 for LIV, CPD/IACET, ANAB/NCCA | Mostly records and paperwork; the quality-records system is built. **ISO 9001/21001 and CPD can start in parallel much earlier** (gap assessment, certifier quotes); ANAB/NCCA need an operating record from the exam scheme |
| 8 | **Printing and shipping** | Foil strip, raised seal, order and delivery | Needs commerce and a print vendor |

## 2. Positioning for the world outside the US
- **What LIV is:** a United States–based private accreditation and credentialing organization that makes training and certificates **verifiable anywhere**. Say "serving partners worldwide", **not** "internationally recognized" or "international accreditation" until recognitions are granted.
- **Who it serves:** (a) training providers outside the US that want a credible, verifiable quality mark and certificates; (b) employers and regulators that need to verify a certificate in seconds; (c) learners who want portable, verifiable proof.
- **Promise that can be kept now:** published criteria, a public register of accredited partners, QR verification that works years later, transparent complaints and appeals, an audit trail.
- **Local acceptance:** many governments and sector regulators require *local* licensing or approval of training providers and do not treat a private foreign accreditation as a substitute. Never imply otherwise. Publish a **"Local acceptance" guide per country** (what LIV is, what it is not, what the partner must check with local authorities).
- **Authentication of documents abroad:** some buyers need certificates apostilled or legalized. Offer an optional **apostille/legalization service** (notarization, Virginia Secretary of the Commonwealth apostille for Hague countries, consular legalization otherwise). Check current rules per destination; several countries have joined the Apostille Convention recently.

## 3. Site structure to add (public)
| Page or feature | Why |
|---|---|
| **Public register** of accredited partners (search, status, scope, country) and of credentials | Core trust signal; employers and regulators check it |
| **Partner profile pages** (logo, accreditation status and date, courses, verification stats) | Gives partners a reason to link to LIV (backlinks, referrals) |
| **How accreditation works** (criteria, stages, timelines, fees), **Accreditation standards** (versioned PDF/HTML), **Fee schedule** | Transparency is the product |
| **Governance** (board, advisory committees, impartiality policy, conflict-of-interest summary), **Complaints and appeals** (public procedure, wired to the quality register), **Transparency report** (yearly numbers) | What assessors and cautious buyers look for |
| **Verify** hub: by QR, ID, API; **bulk verification for employers**; **Report a fake certificate** channel | Anti-fraud reputation |
| **Brand and logo-use rules for partners** (accredited-partner mark, what may and may not be claimed) and a misuse reporting process | Protects the mark |
| **Terms, Privacy, Cookies, Accessibility statement (WCAG 2.1 AA), Partner Agreement, Verification terms, Security page and `security.txt`** | Legal and trust baseline |
| **Press kit, About, Contact with regional hours, Status page** | Credibility and support |
| **Multi-language readiness** | English stays the primary language (decision to date); plan translation of key public pages and an optional translated line on certificates later, with `hreflang` |

## 4. Product features that help the global market
- **Open Badges 3.0 and LinkedIn**; a learner **wallet** with all LIV credentials; shareable verification links.
- **Employer API and webhooks**: verify, revocation status, bulk lookup.
- **Public revocation and suspension notices**, with reasons recorded.
- **Identity fields for many countries** (national ID, passport, no ID); name transliteration policy; date formats that avoid ambiguity.
- **Partner dashboard analytics**: certificates issued, verifications, countries of verifiers.
- **Fast verification worldwide**: CDN in front of the verify pages, caching rules that never serve a revoked status as valid.
- **Continuity commitment**: certificates stay verifiable for a stated period (for example 20+ years) with a documented continuity and archive plan, so a buyer is not exposed if LIV changes.

## 5. Commercial model
- Partner fees: application/assessment fee, annual accreditation fee, per-certificate fee, optional listing and badge packages. Founding-partner pilot pricing for the first cohort in exchange for case studies.
- Candidate fees (Phase 5 onward): exam registration, resit, appeals; course-pack licence fees to partners.
- Price in **USD** with clear conversion at checkout; bank-transfer invoices for markets where cards are uncommon; confirm Stripe availability and payout rules for each region.
- **Agents or regional representatives** may sell and support but must never influence accreditation or exam decisions (impartiality); pay them by referral, not by outcome.

## 6. Legal and compliance for selling abroad (confirm with advisers)
- **Sanctions and export controls:** as a US company LIV must screen partners, payees and payers against the US sanctions lists and avoid comprehensively sanctioned jurisdictions. Build screening into partner onboarding and payments.
- **Privacy:** GDPR/UK GDPR apply when serving people in Europe or the UK; other regions have their own laws (for example Saudi Arabia and the UAE). Needs a privacy notice, cookie consent where required, data-processing terms with partners, a lawful basis for the national-ID hash and last four digits, transfer mechanisms, retention schedule (in the quality records).
- **Indirect taxes:** selling digital services to foreign customers can trigger VAT/GST registration or collection in some countries (EU, UK, Saudi Arabia, UAE and others), especially for consumers. Tax adviser to set thresholds and a collection approach.
- **Anti-bribery and anti-money-laundering:** payment and agent rules; keep records of who paid whom.
- **Contracts:** Partner Agreement (scope, fees, logo use, audits, suspension, liability limits, governing law and dispute resolution), candidate terms for exams, data-processing addendum.
- **Intellectual property:** trademark searches and filings for "LIV" and "Leading Institute of Verification" in target markets (for example through the Madrid system), domain names, rules on the use of other bodies' names (never imply their approval).
- **Insurance:** professional liability / errors and omissions and cyber cover before taking exam fees.
- **Virginia:** assumed-name filing and counsel review remain pre-launch items (see the architecture document).

## 7. Marketing plan (credibility first, volume second)
1. **Proof assets:** public register, published standards, sample certificate page, verification demo, "How to verify a LIV certificate in 10 seconds" video, partner case studies (with permission), transparency report.
2. **Content engine:** the knowledge hub (guides, standards explained and "what changed", case studies, research digests) feeds search traffic; keep every item reviewed and dated. Add structured data (Organization, Article, Course, EducationalOccupationalCredential, FAQ).
3. **Partner acquisition:** direct outreach to training providers in target regions; webinars on "what accreditation means and what it does not"; referral program; regional representatives (see impartiality note).
4. **Employer and regulator awareness:** verification explainers, bulk-verify API docs, short guides for HR and procurement teams.
5. **LinkedIn first:** company page, badges that link back to verification, thought-leadership by the named advisory board.
6. **Associations and conferences:** speaking and sponsorship at quality, safety and project-management events; seek written alignment agreements, never claim endorsement without one.
7. **Reputation hygiene:** a clear fraud-reporting channel, fast takedown of fake LIV certificates, public handling of complaints.
8. **Claims discipline:** no "internationally recognized", "ISO accredited", government or federal implication, guarantees of jobs or passing; the Reviewer engine already blocks these in content.

## 8. Operations
- **Support:** published hours that cover major time zones, response targets, ticketing; a status page; an escalation path.
- **Partner onboarding SLA:** target time from application to decision, with stages visible to the applicant.
- **Reliability:** uptime target for verification, monitoring and alerts, backups with restore tests, disaster recovery plan, incident response and breach-notification procedure.
- **Security:** 2FA for staff and partners, least-privilege access, dependency scanning, periodic penetration test, vulnerability disclosure policy; SOC 2 or ISO 27001 later if enterprise buyers ask.
- **Email deliverability:** SPF, DKIM, DMARC on the sending domain before Phase 2b.
- **Business continuity:** documented plan for keeping the register and verification alive if LIV is acquired, closes or loses key people.

## 9. Measures of success (review quarterly)
Accredited partners (by country), applications and time to decision, certificates issued, verifications per month and by country, share of verifications by employers, complaint rate and time to close, partner renewal rate, revenue by line, content traffic and conversions, fake-certificate reports and time to takedown, recognitions in progress and granted.

## 10. Risks to manage
| Risk | Response |
|---|---|
| Buyers assume LIV replaces local approval | Local-acceptance guides, contract wording, clear public disclaimers |
| Overclaiming ("international", "ISO") | Claims discipline, Reviewer blocks, counsel review of all pages |
| Conflict of interest (curricula, accreditation, exams) | Safeguards in `CREDENTIAL-MODEL.md` §4, governance board, impartiality committee |
| Sanctions or payment-compliance breach | Screening in onboarding and payments, written policy, records |
| Fraud and fake certificates | Verification design, takedown process, public reporting |
| Single-person dependency | Documented procedures (quality records), second administrator, backups |
| Slow credibility build | Start ISO 9001/21001 and CPD paperwork early; publish the proof assets from day one |

## 11. Decisions needed from the owner
1. Confirm the delivery order and the "pull forward" of account security and agreements into the commerce step.
2. Target regions for the first 12 months (to choose languages for key pages, tax and sanctions review, and legalization needs).
3. Whether to offer apostille/legalization support.
4. Which professional advisers to appoint first: counsel (US plus one target region), tax adviser, accreditation consultant.
5. Appoint a governance board and an advisory committee (names and credentials to publish).
6. Pricing approach: pilot cohort terms and the fee schedule.
7. Budget for the engines and for marketing in the first year.

## 12. Owner decisions (October 5, 2026): GCC and MENA first

**Decided:** delivery order and the two adjustments in §1 approved. Target markets for the first 12 months: **GCC and the wider MENA region**. Advisers: LIV already works with a US business-services agent that has lawyers available on request, so no separate appointments for now. **No governance board exists yet.**

### 12.1 What this means for the plan (confirm each point with the agent's lawyers and local advisers)
- **Language.** English remains the primary language of the platform and certificates. For GCC/MENA, plan **Arabic (right-to-left) versions of the key public pages** (home, how accreditation works, register, verify, local-acceptance guides, contact) and, as an open decision, an optional Arabic line on certificates (for example the holder's name). Arabic names appear on the certificate in Latin letters as in the holder's passport, with a stated transliteration policy. This revisits the earlier "English only" rule for the public site; the certificate rule stays English until the owner decides.
- **Local acceptance guides** for each target country: what LIV is and is not, and which local authority approves or licenses training providers or recognises credentials for work permits and employers (for example training regulators and education quality authorities in Saudi Arabia, the UAE, Bahrain, Oman and others; the exact bodies and rules must be confirmed per country and per sector before publication). Employers in the region commonly ask for established safety and quality credentials; LIV must not present itself as a replacement for those or for local approval.
- **Weekend and hours.** Support hours that cover Sunday-Thursday and Monday-Friday working weeks; Ramadan and holiday schedules for partner onboarding.
- **Payments.** Cards are widespread in the Gulf; also offer bank-transfer invoicing and confirm which local card schemes and wallets can be accepted by a US merchant. Prices in USD.
- **Indirect tax.** Several Gulf states charge VAT on digital services (rates and rules differ; some have none). The tax adviser sets registration and collection for foreign suppliers.
- **Privacy.** Saudi Arabia and the UAE have their own personal-data laws, with rules on cross-border transfers; the privacy notice and partner data-processing terms must reflect them.
- **Sanctions.** Screen partners and payers by country; some countries in the region are subject to US sanctions and the rules change over time.
- **Relationships and channels.** Regional business is relationship-led: a regional representative or distributor (with the impartiality safeguard in §5), WhatsApp Business for partner support, regional events, and Arabic-language marketing content.

### 12.2 Document attestation (apostille and legalization), in plain terms
A foreign authority will often want proof that the signature on a document is genuine before it accepts it. This is **attestation**. It proves **who signed**, not that the content is approved or recognised.
1. **Notarization.** An authorized LIV signatory signs the document (for example a "certificate of authenticity" or a printed certificate) in front of a notary.
2. **Apostille.** For countries in the **Hague Apostille Convention**, the Virginia Secretary of the Commonwealth issues one apostille certificate that confirms the notary's authority. Several Gulf states have joined in recent years; the list changes, so check it for each destination.
3. **Legalization (non-Hague destinations).** The document is authenticated by the US State Department and then legalized by the destination country's embassy or consulate; the destination country's foreign ministry may add its own stamp in-country.
**Offer:** an optional paid service for partners and holders: "notarized and apostilled/legalized copy" with courier delivery. It depends on printing and shipping (Phase 8), so it arrives with that phase. A lighter option available earlier: a **signed digital verification letter** that states the certificate's details and verification link (it is not an apostille). The US agent may already handle notarization and apostille by courier; ask them for price and turnaround. LIV must state clearly that attestation does not create local recognition.

### 12.3 Advisers: use the existing agent and lawyers
Ask the agent and their lawyers (in writing) to cover: Virginia assumed-name filing and good standing; trademark searches and filings in the US and the target countries; the Partner Agreement, exam candidate terms, Terms, Privacy and cookie texts; sanctions-screening policy; data-processing terms for GCC/MENA; insurance (professional liability and cyber); apostille handling and cost; and a tax adviser referral for VAT/digital services and US filings. Keep the answers in the controlled documents (Admin → Compliance) so there is a record.

### 12.4 Governance while there is no board
- Until a board exists, do **not** publish the words "board" or "committee" on the site; say "governance in formation".
- The quality records (Compliance dashboard) will show impartiality committee and management review as "needs attention": that is accurate and expected.
- **Recommended interim step:** a **founding advisory panel** of 3 to 5 volunteers (at least one each from safety, quality and project management, plus one person independent of LIV's business), appointed for one year by written terms (confidentiality, conflict-of-interest declaration, no pay tied to decisions). Publish names only with each person's written consent. The panel reviews the accreditation criteria, impartiality policy and complaints/appeals outcomes, and its meetings are recorded under "Reviews and audits".
- Before any exam scheme (Phase 5) the owner should not be the sole decision-maker on credentials: a separate credential committee is expected by assessors.
