# Governance editorial library

Status (October 9, 2026): first collection prepared in `content/library/governance/`. It is loaded into the site as **drafts only**. Nothing is public until a named reviewer publishes each item.

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
