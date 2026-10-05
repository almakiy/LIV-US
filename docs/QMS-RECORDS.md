# LIV quality records (readiness for recognition)

Where: **Admin → Compliance** (`/admin/qms`). Super admin only. Purpose: keep the records an assessor expects, created as the work is done, so that a later application (ISO 9001/21001 certification, CPD/IACET, ANAB or NCCA accreditation of the credential scheme) can show that LIV follows its own procedures. This is a records system, not a certification: LIV claims no recognition until it is granted.

## What is recorded
| Area | What the system enforces | Typical assessor question it answers |
|---|---|---|
| **Controlled documents** (policies, procedures, forms, standards, handbooks) | Numbered documents; drafts are editable, **approved versions are immutable**; new revisions create a new version; approver recorded; review date (default 12 months) with overdue flag; approval blocked while placeholders remain; separation of author and approver (see config) | "Show me your document control and the current approved procedure." |
| **Complaints, appeals, feedback** | Case numbers, acknowledgement due in 5 business days and decision due in 30 days, timeline of every step, outcome and reasons; **appeals must be decided by a reviewer independent of the handler and the original decision-maker**; public contact-form complaints and appeals open a case automatically | "How do you handle complaints and appeals? Show a closed case." |
| **Nonconformities and corrective actions** | Source, root cause, correction, corrective action, owner, due date; **cannot be closed** without root cause, action, a verifier and a written check of effectiveness | "How do you correct problems and check it worked?" |
| **Partner surveillance** | Initial, periodic and special reviews of each accredited partner with scope, findings, outcome and next due date; active partners without a current review are flagged | "How do you monitor accredited partners?" |
| **Impartiality declarations** | One declaration per staff member per year, cannot be altered; shows who has not declared | "How do you manage conflicts of interest?" |
| **Management reviews, internal audits, impartiality committee** | Date, participants, inputs, decisions, next due; dashboard flags none held in 12 months | "Show your last management review and internal audit." |
| **Audit log** | Append-only; every entry carries a SHA-256 hash chained to the previous entry; the database refuses updates and deletes; the dashboard verifies the chain and reports the first altered entry | "Can records be changed afterwards?" |
| **Assessor pack** | One ZIP: CSV of every register, the full audit log with hashes, approved documents as text, and a README stating the chain verification result | "Give us your records." |

The **Overview** page shows each area as "in order" or "needs attention" (overdue reviews, late acknowledgements, open actions past due, missing declarations, no review held in 12 months, broken audit chain).

## First steps for the owner
1. Open **Compliance → Documents → Create starter set**: 11 outline documents (impartiality policy, document control, records control, complaints and appeals, corrective action, partner accreditation, partner surveillance, internal audit, management review, data protection and retention, code of conduct). Complete each outline, then approve it. They are headings only; the content is LIV's to write, ideally with an accreditation consultant and counsel.
2. Record each staff member's **declaration** for the year.
3. Create a **surveillance review** for each active partner.
4. Hold and record a **management review**, an **internal audit** and an **impartiality committee** meeting; record the corrective actions they raise.
5. Check the Overview weekly; download the assessor pack before any assessment.

## Configuration
`QMS_ALLOW_SELF_APPROVAL` (default `true`): while LIV has one administrator, one person may author and approve a document or verify their own corrective action; the document version is marked "self-approved". Set to `false` once a second person is available, so approvals and verifications need a different person.

## Limits
- The assessor expects people, not software: competent staff, an independent impartiality committee, real audits and real management decisions. This system records them; it does not replace them.
- Appeal independence is checked by name. The independence itself must be real.
- The hash chain proves entries were not altered after being written. Database administrators with superuser rights can still rebuild the whole chain, so keep database backups and restrict superuser access; for stronger assurance, periodically store the latest `entry_hash` outside the system (for example in a signed email to the governance board).
- Records cover the website's operations. Records kept elsewhere (emails, meeting minutes in other tools) should be summarised here or referenced from the controlled documents.
