# Governance editorial library

Status (October 9, 2026): first collection prepared in `content/library/governance/` (14 items) and `content/library/research/` (9 research digests). It is loaded into the site as **drafts only**. Nothing is public until a named reviewer publishes each item.

## Purpose
The library sets out what governance is, how to write it down and how to lead it. It covers organizations of every size, from a single shop to a listed company. It comes first, before any training or credential, so that later courses and assessments rest on a body of knowledge that is already published and cited. This also follows the brief's priority order: Knowledge Hub before credential engines.

The library makes no claim about LIV's own status. It says nothing about accreditation, recognition or approval of LIV, and it does not present any LIV credential as available. The HSE Governance scheme stays IN DEVELOPMENT, and these texts do not define it.

## Editorial rules (the same rules apply to people and to the AI engines)
1. **Primary sources only for requirements.** A statement that something is required, mandatory or "the law" must cite the official text or the regulator. The Reviewer flags any requirement without an official source (`sources.no-official`). Otherwise the text has to say "good practice" or "recommended".
2. **Registered publishers.** Every source must come from a publisher in `engines/data/trusted-sources.json`, which groups them into five trust tiers: official, standards, intergovernmental, professional and research. Any other publisher is flagged (`sources.unlisted-publisher`). Adding a publisher is an editorial decision: record it in the change log below.
3. **Standards are summarized, never copied.** ISO and similar standards are paid and copyrighted. Texts give the title, the edition, the clause numbers and a summary in our own words. The edition is checked against `engines/data/standards-registry.json`.
4. **Research is digested, not republished,** unless its licence allows it. Each research digest gives the full citation, the DOI, the licence as stated by the publisher, the method, the findings in our own words and the limitations.
   - Full text is republished only under a licence that permits redistribution, such as CC BY 4.0, and then with attribution and a note of any changes.
   - NC or ND licences are noted and respected.
5. **Dated and reviewable.**
   - Every source has an access date.
   - Every item has a `next_review` date: 6 months for regulatory maps and 12 months for the rest. The admin list shows "review due" once that date passes.
6. **Human gate.**
   - Items are loaded as drafts. Each carries an automated Reviewer report, and `ai_assisted` is set.
   - Publishing needs a named subject-matter reviewer. If the Reviewer blocks an item, publishing it anyway needs a recorded override reason.
   - The reviewer checks each cited fact against its source before publishing, above all the instrument numbers, dates and amendments in the regulatory maps.
7. **Not legal advice.** Regulatory texts say so, and they point readers to the official text and to counsel.

## How the AI engines use this
- The Reviewer engine applies rules 1 to 3 automatically on every draft: from the library, from the Content API, or written in the editor.
- The Producer engine (Track K.1, not built) must write only from an evidence pack built from registered publishers. The library's sources are the starting evidence base for governance topics.
- The Scout engine (K.2, not built) watches the official sources listed here for amendments and new editions, and raises a signal. It never edits a published text.

## Quality assurance before publication
| Layer | What it checks | Where |
|---|---|---|
| Document control | Audience, scope, edition, preparation and next review dates at the top of every item | `audience`, `scope`, `edition`, `prepared` in each file header (required) |
| Source verification | Publisher tier, edition of each standard, DOI title and license, link status | `npm run check:standards`, `npm run check:sources`, Reviewer `sources` and `standards` checks |
| Plain language and drafting | Sentences over 35 words, average sentence length over 22 words, paragraphs over 150 words, "shall" in guidance (use must, should, may) | Reviewer `style` check, informed by ISO 24495-1:2023 and the ISO/IEC Directives verbs; advisory, never blocks, no conformity claim |
| Expert review | Every statement against its source, each source opened and current, a 12-point quality checklist, a signed reviewer declaration with conflicts of interest | Review pack (Excel, English and Arabic): "Download expert review pack" in the editor, the ZIP link in the library panel, or `npm run review-packs` |
| Publication gate | A named subject-matter reviewer; a recorded reason to override a blocking report | Admin > Knowledge hub content |

The library describes itself only as "prepared with reference to the standards and sources cited" and, once published, "reviewed by" the named reviewer. It never claims accreditation, approval or conformity.

## Verifying sources when a website refuses automated readers
Some official sites (www.iso.org, www.oecd.org, ILO NORMLEX, several journal sites) are behind bot protection and refuse automated readers. Some Gulf government sites cannot be reached from servers outside the region. A refusal is not a broken link. Each kind of source has another authoritative route:

| Source | Route used | Command |
|---|---|---|
| ISO standards (title, edition, date, status, amendments, revisions in progress) | **ISO Open Data**: the full ISO catalog that ISO publishes as a download (`iso_deliverables_metadata.jsonl`) | `npm run check:standards` (add `-- --write` to update `engines/data/standards-registry.json`) |
| ISO catalog links in the library | The page id (`/standard/<id>.html`) is looked up in ISO Open Data, and the source title must start with ISO's reference for that id | `npm run check:sources` |
| Journal articles and reports with a DOI (title, publisher, license) | **Crossref** (the publisher's own deposit), then **DataCite** (reports and datasets), then **OpenAlex** when a publisher deposits only its site policy | `npm run check:sources` |
| OECD publications | Cited by DOI (`doi.org/10.1787/...`) and checked in Crossref; the register maps the 10.1787 prefix to OECD (intergovernmental) | `npm run check:sources` |
| Gulf regulators | The regulators' own PDF texts where they load (Saudi CMA, HRSD, SAMA rulebook, UAE Capital Market Authority, UAE Ministry of Economy and Tourism, QFMA, Kuwait CMA, SDAIA) | `npm run check:sources` |
| Anything still "protected" or "unreachable" | A person opens it in a browser, ideally from the region, and confirms it during review. Official PDFs may be saved under `content/evidence/` (not published) for the reviewer. | n/a |

`check:sources` classifies every link as ok, protected (open it in a browser), unreachable from this network, or broken. It fails only on a broken link or a DOI or ISO record that disagrees with the library. The checks need network access, so they run on demand, not in CI. Run them before loading new library items and at each review date.

Results on October 9, 2026: every library source was reached through an official route (ISO Open Data, Crossref, DataCite, OpenAlex, or the official host itself, including the ILO authentic convention texts, Bahrain LLOC, the Oman Official Gazette and the Saudi Ministry of Commerce). Official texts retrieved for review are kept outside the repository; points that no official text confirms are listed under "Points still being verified" in the GCC map. `check:standards` found four registry editions out of date and corrected them: ISO/IEC 17024:2026 (third edition, March 31, 2026), ISO 9000:2026, ISO 19011:2026 and ISO 21001:2025.

## Loading the library
In **Admin → Knowledge hub content**, the "Editorial library" panel shows how many items are not on the site yet. **Load library drafts** adds those items as drafts, each with an automated review report.
- An item that already exists (same slug) is never overwritten, so changes made on the site are kept.
- A deleted draft can be loaded again.
- Files with errors are listed and not loaded.

File format (`content/library/<collection>/<nn>-<slug>.md`):
```
---
id: gov-01-what-governance-is
slug: what-governance-is-and-is-not
title: ...
summary: ...            (up to 300 characters)
category: governance    (a key from src/lib/content.js CATEGORIES)
kind: standards         (a key from KINDS)
jurisdiction: International
collection: governance-foundations
order: 1
tags: governance, iso 37000
standards: ISO 37000:2021
next_review: 2027-04-09
audience: ...           (who the text is for, up to 200 characters)
scope: ...              (what it covers and what it does not, up to 300 characters)
edition: 1.0
prepared: 2026-10-09
sources:
- Title | https://publisher/page | Publisher | 2026-10-09
---
Markdown body citing sources as [1], [2] in the order listed.
```
`npm run test:unit` runs every library file through the Reviewer. A file fails the test if it has a blocking finding, a source from an unregistered publisher, a source it never cites, a standard missing from the registry or with an unexpected edition, or British spelling.

## Change log of the trusted-source register
| Date | Change | By |
|---|---|---|
| 2026-10-09 | Register created: standards bodies, intergovernmental organizations, GCC regulators and legislation portals, UK and U.S. regulators, professional bodies, open-access publishers. | Engineering (for editorial review) |
| 2026-10-09 | Added cma.gov.sa, uqn.gov.sa, uaecma.gov.ae (the UAE regulator's new name), moet.gov.ae, dmt.gov.ae, lrfoundation.org.uk, gov.uk, op.europa.eu, and DOI prefixes for OECD, World Bank and the EU Publications Office. qanoon.om and kdipa.gov.kw are listed as professional (unofficial reproductions), so they cannot support a legal requirement on their own. | Engineering (for editorial review) |
