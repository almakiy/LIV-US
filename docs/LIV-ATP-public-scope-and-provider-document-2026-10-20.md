# LIV ATP: public scope and provider document (20 October 2026)

Specification for the public directory of Authorized Training Providers, the provider page, the authorized scope table and the badge display. It replaces the earlier draft annex of this document. It covers structure and display only; it adds no logic for who receives a badge, when it is earned or how it is upgraded. Badge names, files and display rules follow the existing platform schema.

## Scope of this document
- Place of the directory: program page → Authorized Training Providers → provider directory → provider page → scope details.
- Directory: search by provider name or ATP number, country filter, and a stable link to each provider. Card: logo, legal or display name, ATP number, country, current badge from the platform record, authorization status and a short scope summary.
- Provider page: logo, name, ATP number, country, badge, authorization status as recorded, a permanent provider link with a copy button, and the authorized scope table.
- Scope table: scope title, credential family, status, grant date and end date. Ended scopes are shown and marked "Ended". Internal decision notes are never shown.
- Badge: read from the platform record only. Not inferred from text, file names or visitor input. If no value is recorded, no value is shown.

## What the build provides and what it does not
- Built on existing data: ATP number search, country filter, provider logo (served publicly for each provider that has one), current badge, scope table with dates, provider link with copy button.
- Not built, because the data does not exist in the platform schema: city filter, training domain filter, delivery-method filter in the directory, course-catalogue links per scope, and a provider verification endpoint ("Verify Provider Authorization"). Each needs an owner decision on the data source before it is added.
- Document download of the authorization certificate is not shown: this build does not change how authorization documents are issued.

## Pending
- Owner decisions on the data for city, domain, delivery method and course links (listed in docs/HANDOFF.md final list).
- Owner approval of the public wording before publication.

## Reference material
- The reference images named in the owner's brief (an ANAB directory model, an OSHAcademy provider card and an ISO 17034 process screenshot) were not in the repository when this document was written. They are to be placed in `docs/references/` by the owner. Nothing was copied from them. Logos, seals and wording of other bodies are not reproduced in LIV's interface.
- ISO 17034 concerns the competence of reference material producers and does not cover certification bodies for persons. The future target stated for LIV's professional certification track is ISO/IEC 17024:2026. No accreditation or conformity is claimed.

## Preview of the process page
- Standalone preview: `docs/previews/LIV-ATP-process-page-preview.html`. It is not connected to the live site.
