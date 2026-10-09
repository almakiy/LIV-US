# LIV Governance Publications: catalogs and digital products (design for a later phase)

Status (October 9, 2026): design only, at the owner's request ("for later stages of the project"). Nothing here is built. It becomes Track P in `BUILD-PLAN.md` and starts only after its prerequisites (§12).

## 1. Purpose
LIV publishes downloadable PDF catalogs and digital products on governance. They are built on established international standards and verified sources, under LIV's own identity and copyright. The aims:
- Spread knowledge with a free series, as a contribution to the field.
- Offer paid, deeper products for organizations that want ready-to-use tools.
- Give LIV a recognizable publication identity that follows the conventions readers expect from standards bodies and credentialing organizations, while remaining distinctly LIV.

## 2. Rules that hold for every publication
1. **Built from the reviewed library.** A publication is assembled only from Knowledge Hub items that a named subject-matter reviewer has published (`GOVERNANCE-LIBRARY.md`, K.8). There is one source of truth, and a correction in the library flows into the next edition.
2. **No status claims.** No publication states or implies that LIV, the publication or any LIV credential is accredited, approved, recognized or endorsed by any body. The approved wording is: "Prepared with reference to the standards and sources cited. Reviewed by [name, specialty]."
3. **Not a credential.** Every publication says, both on the catalog and on its own copyright page, that it is a reference resource. It is not a certificate, a qualification, a course, or a substitute for any accredited certification or for legal advice.
4. **Standards are never reproduced.** ISO, COSO and similar texts are cited by number, edition and clause and summarized in LIV's own words. Licensed research appears only within its license (CC BY: attribution; NC/ND: summary only).
5. **Real data only.** No invented statistics, testimonials or case studies. Examples are labeled as illustrative.
6. **Market references are studied for structure only.** Other publishers' digital stores, including safety-training academies, may be looked at for page order, format tiers and FAQ patterns. Their text, titles, covers, colors and trademarks are never copied or imitated, and no affiliation is implied.
7. **People decide.** No publication is generated and released automatically. Each edition has a named editor and reviewer.

## 3. The catalog and product types
| Type | Content | Format | Access |
|---|---|---|---|
| **Publications catalog** (yearly, updated each edition) | Every LIV publication with its scope, audience, edition, review date, format and access | PDF | Free |
| **Briefs and explainers** | Short items from the library (e.g. ISO 37000 explained, the five-layer framework) | PDF | Free |
| **Tools** | Health check, glossary, delegation of authority matrix, conflict of interest register | PDF (fillable) and editable XLSX/DOCX | Free or paid (owner decision) |
| **Handbooks** | Extended editions of the library guides, with worked examples, templates and exercises | PDF | Paid |
| **Toolkits** | A handbook plus its editable templates | PDF + XLSX/DOCX | Paid |
| **Workshop packs** | Slides with presenter notes for an internal session, e.g. the monthly governance hour | PPTX + PDF | Paid |
| **Regulatory map editions** | The GCC corporate governance map, reissued every six months with a change log | PDF | Paid (single edition or yearly subscription) |
| **Research digest** | The year's research digests in one volume | PDF | Free |
| **Organization license** | Any paid product for use across one organization, sized by number of users or sites | Same files, licensed per organization | Paid |

## 4. Offer ladder (structure adapted from market practice; prices are an owner decision)
1. **Free series:** the catalog, briefs, the glossary, the research digest. Distributed widely under a license that allows sharing with attribution (recommended: CC BY-NC-ND 4.0, to be confirmed with counsel).
2. **Single product:** one handbook in PDF.
3. **Toolkit:** the handbook and its editable templates.
4. **Complete pack:** the toolkit and the workshop pack.
5. **Organization license:** any of the above for internal use across one organization.

Price by depth and how often an item must be updated, not by page count. A regulatory map that is reissued twice a year is worth more than a static brief. Prices are shown in USD, with an indicative SAR amount. Avoid "discount" language: the higher tiers are presented as more complete, not as reductions.

## 5. What makes a LIV publication distinct
These elements follow the general layout of publications from standards and credentialing bodies, so readers recognize the form. They are combined in a way that is LIV's own:
1. **Series identity:**
   - The series name is "LIV Governance Publications".
   - Each item has a series code: `LIV-GOV-H-001` for a handbook, `-T-` for a tool, `-B-` for a brief, `-M-` for a map, `-R-` for a research digest.
   - Edition numbers are shown on the cover and spine: Edition 1.0, 1.1 and so on.
2. **A verifiable publication.** This is LIV's signature feature, taken from its core work in verification:
   - Each PDF carries a document ID and a QR code that open a LIV verification page for publications. The page shows whether the copy is genuine, whether its edition is current or superseded, and the date of the latest review.
   - For a paid copy, the page also shows the licensee.
   - This protects readers from altered or outdated copies, and it protects LIV from counterfeits.
3. **A fixed opening sequence:**
   - Cover.
   - Copyright and license page (§6).
   - Document control: audience, scope, edition, prepared date, next review date, editor, reviewer.
   - Contents.
   - "How to use this publication".
4. **A fixed closing sequence:**
   - References, with the elements of ISO 690:2021: creator, title, edition or date, publisher, identifier or link, access date.
   - Glossary of the terms used.
   - Review statement.
   - Disclaimer.
   - "How to cite this publication".
   - Colophon.
5. **Visual system:**
   - It follows LIV's own brand and the existing credential design system: seal, colors and typography.
   - Every product uses one cover grid. A color band shows the series: handbook, tool, map or research.
   - The cover carries no third-party logos or marks.
6. **Plain language:** every edition passes the Reviewer's plain-language check and the reader test (K.9) before release.

## 6. Copyright and rights protection
- **Copyright page:**
  - "© 2026 LIV LLC. All rights reserved", or the free-series license.
  - The license terms in short, with a link to the full terms.
  - Trademark notice for "LIV" and "Leadership Institute of Validation" once they are registered (Track O).
- **Per-copy marking for paid products:**
  - The licensee's name or organization, the order number and the download date appear in the page footer.
  - The same details are written into the PDF metadata.
  - Visible and legitimate, and no DRM that breaks accessibility or printing.
- **Embedded metadata (XMP):** title, LIV as author and publisher, rights statement, license URL, document ID and edition.
- **Fingerprint:** a SHA-256 hash of each released file is stored with its record, so a copy can be checked against the original. This reuses the durable `stored_files` design.
- **Registration options (owner decisions with counsel):**
  - Copyright registration with the U.S. Copyright Office, which strengthens enforcement in the U.S.
  - ISBNs for books, for example handbooks and the yearly catalog, through the U.S. ISBN agency.
  - Later, DOIs through a registration agency, for citable research volumes.
- **Takedown procedure:** a documented notice-and-takedown process for infringing copies, run by counsel.

## 7. Product page structure (structure adapted; wording always LIV's own)
1. The problem the product solves, in one or two sentences.
2. Name, series code and a one-line description.
3. Includes: the files, formats and page counts.
4. What you will be able to do: outcome-framed bullets.
5. Contents: topic-framed bullets, five to eight chapters.
6. For whom: audience tags, e.g. owner, board member, company secretary, compliance officer, HSE leader, branch manager, adviser.
7. Details: edition, prepared date, next review, editor, reviewer, languages, license.
8. Also available: the other tiers of the same product.
9. FAQ, always with these five answers:
   - How it is delivered.
   - Device and print compatibility.
   - "Is this a certification or an accredited course? No".
   - What the license allows: sharing within an organization, printing.
   - What happens when a new edition is released.
10. Continue: related free library articles and, only once approved and published, the relevant LIV credential schemes. Never a scheme that is still in development.

## 8. Languages
- Arabic and English are produced as **two separate files**, each laid out in its own direction: Arabic RTL, English LTR.
- Both are translated and adapted by a qualified person, not machine-mirrored.
- Legal texts are quoted from the official Arabic where it prevails.
- File names: `LIV-GOV-H-001-AR.pdf` and `LIV-GOV-H-001-EN.pdf`.
- Buyers choose the language before checkout.
- This follows M.1 and M.4.

## 9. Production pipeline (technical design)
- **Rendering:**
  - Each publication is assembled from library items into an HTML layout, then printed to PDF with headless Chromium. Playwright is already in the project.
  - Chromium shapes Arabic text correctly and can produce tagged PDFs.
  - The PDFKit engine used for credentials stays for credentials only.
- **Archival and accessibility targets:** PDF/A-2u for long-term archiving and PDF/UA for accessibility, both validated before release, for example with veraPDF.
- **Records:** publications, editions and files, plus licenses, orders and downloads.
  - Files are stored write-once in `stored_files` with their SHA-256.
  - A new edition never overwrites the previous one, which stays verifiable as "superseded".
- **Sales:** the existing billing module and Stripe Checkout. Download links are signed, time-limited and logged. An organization license lists its permitted users.
- **Verification page:** `/verify/publication/<document ID>` shows the authenticity, edition status and, for paid copies, the licensee name only. It never shows contact details.

## 10. First catalog proposal (drawn from the existing library)
| Code | Title (working) | Type | Access |
|---|---|---|---|
| LIV-GOV-C-2027 | LIV Governance Publications Catalog 2027 | Catalog | Free |
| LIV-GOV-B-001 | Governance Explained: ISO 37000 and the G20/OECD Principles | Brief | Free |
| LIV-GOV-T-001 | Governance Health Check: 30 Questions (fillable) | Tool | Free |
| LIV-GOV-T-002 | Governance Glossary | Tool | Free |
| LIV-GOV-H-001 | Governance Handbook for Small Businesses, Shops and Branches | Handbook / Toolkit | Paid |
| LIV-GOV-H-002 | Family Business Governance Toolkit: charter, council, employment policy, succession | Toolkit | Paid |
| LIV-GOV-H-003 | Board Governance Toolkit: delegation of authority, conflicts register, board evaluation | Toolkit | Paid |
| LIV-GOV-H-004 | HSE Governance for Owners and Boards, with an indicators workbook | Toolkit | Paid |
| LIV-GOV-W-001 | The Monthly Governance Hour: workshop pack | Workshop pack | Paid |
| LIV-GOV-M-001 | GCC Corporate Governance Regulatory Map, semi-annual edition | Map | Paid / subscription |
| LIV-GOV-R-2026 | LIV Governance Research Digest 2026 | Research | Free |

## 11. Release checklist (every edition, both languages)
- [ ] Every source item is published in the library under a named reviewer, and its review date has not passed.
- [ ] `npm run check:standards` and `npm run check:sources` pass, with any "protected" links confirmed by a person.
- [ ] Arabic and English files are complete, each laid out in its own direction, with fonts embedded.
- [ ] Cover, copyright and license page, document control, contents, references, review statement, disclaimer, how-to-cite and colophon are all present.
- [ ] The "not a credential, not legal advice, no accreditation" statement appears on the copyright page, and also on the catalog and the product page.
- [ ] There are no third-party logos or marks, and no standards text is reproduced.
- [ ] Page numbers, bookmarks and a clickable contents list work.
- [ ] PDF/A-2u and PDF/UA validation pass. File size suits download.
- [ ] Document ID, QR verification, XMP metadata and SHA-256 are recorded, and the previous edition is marked superseded.
- [ ] For paid products, per-copy footer marking works on a test purchase.
- [ ] Product page, FAQ, prices and license text are approved by the owner, with counsel approving the license.
- [ ] No content, title or visual is copied from any market reference.

## 12. Prerequisites and position in the plan
- K.8, expert review of the library items that a publication draws on.
- M.1 and M.4, the Arabic editions.
- Phase 2, email, for purchase receipts and download links.
- Track O:
  - counsel for the license terms, the takedown procedure and copyright and trademark registration;
  - the trademark filing;
  - the ISBN and DOI decisions.
- Phase 9, printing, for print-on-demand editions of handbooks.

Suggested order once the prerequisites are met:
1. The free catalog and free briefs (P.1 to P.3). These build reach and test the pipeline.
2. The paid handbooks and toolkits (P.4 to P.6).
3. Organization licenses and the subscription map (P.7, P.8).
