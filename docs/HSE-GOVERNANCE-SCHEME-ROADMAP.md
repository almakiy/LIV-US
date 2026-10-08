# HSE Governance — credential scheme roadmap

Status (October 8, 2026): **in development**. No title, designation, weights, eligibility, exam rules, validity, renewal or CPD requirement has been set. The public page `/credentials/hse-governance` says so and shows only the positioning and indicative competency areas.

## Positioning
"From HSE operations to HSE governance." A credential family for professionals who design, oversee and assure HSE arrangements. It is not a replacement for, an equivalent of, or affiliated with NEBOSH, IOSH, BCSP or PECB qualifications, ISO 45001, ISO 14001 or ISO 9001 training, or any government-issued qualification.

## Indicative competency areas (input to the Job Task Analysis, not a framework)
Governance fundamentals · Leadership and accountability · Decision rights · HSE governance architecture · Roles and responsibilities · Risk governance · Contractor governance · HSE assurance · Audit oversight · Incident governance · Investigation oversight · Corrective and preventive action governance · Compliance oversight · Performance governance · Leading and lagging indicators · Executive HSE reporting · Management review · Evidence and records · Environmental governance interfaces · Quality governance interfaces · Leadership and safety culture · Ethics and professional conduct.

## Scheme design stages
| Stage | Output | Who | Gate |
|---|---|---|---|
| 1. Scheme charter | Purpose, target roles, class (assessed qualification first, certification later), scope, impartiality plan | LIV + advisory panel | Owner approval |
| 2. Scheme committee | 3–5 subject experts with declared interests, terms of reference | LIV | Declarations recorded in QMS |
| 3. Job Task Analysis | Role definition, tasks, knowledge and skills, survey of practitioners in the GCC/MENA target market | Committee + psychometric adviser | Survey sample and response analysis documented |
| 4. Competency framework | Domains, weights, levels | Committee | Approved QMS document |
| 5. Eligibility rules | Education, experience, prerequisites, evidence | Committee | Approved, legally reviewed |
| 6. Assessment specification | Method, blueprint, item types, duration, standard-setting method | Committee + psychometrician | Approved |
| 7. Item development | Item bank with references and reviews | Item writers and reviewers (not partner trainers) | Bank meets blueprint counts |
| 8. Standard setting and pilot | Cut score study, pilot sitting, item analysis | Psychometrician | Pilot report |
| 9. Policies | Credential rules, validity and renewal, CPD, ethics, appeals, retakes, accommodations | LIV | Approved; counsel review |
| 10. Education Partner curriculum | Curriculum pack, partner authorization criteria for this scheme | LIV with partners | Partner scope records |
| 11. Launch | Published scheme version, fees, directory page | LIV | Owner approval; claims review |

## Pilot architecture (smallest useful build)
1. `credential_schemes` and `scheme_versions` with status `in_development` (data for the existing public page).
2. `partner_scopes` so a partner can be authorized for HSE Governance education and the scope shows on its register page and on verification records.
3. `certificates.record_type` and `scheme_id` so Training Completion Credentials for HSE Governance courses are labelled correctly before any assessment exists.
4. Later: applications, authorization to test, item bank, decisions (see `FUTURE-CREDENTIAL-ARCHITECTURE.md`).

## Open decisions for the owner
1. Who sits on the scheme committee, and how members are paid or volunteer.
2. Budget for a psychometric adviser for the Job Task Analysis and standard setting.
3. First class to launch: Assessed Professional Qualification (recommended first) or Professional Certification (needs eligibility, decision and renewal machinery).
4. Countries for the Job Task Analysis survey.
