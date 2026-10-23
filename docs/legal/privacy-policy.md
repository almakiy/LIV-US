# Privacy Policy

- **Title:** Privacy Policy
- **Version:** 0.1-draft
- **Status:** DRAFT – NOT LEGAL ADVICE – PENDING COUNSEL REVIEW
- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.]
- **Owner:** LIV LLC
- **Applies to:** Visitors, learners, members, applicants, ATP personnel, contributors and purchasers

> This is a proposed initial draft for review, not an effective policy, legal advice, or evidence that a feature is live. Unresolved terms must be completed and approved before operational use. Mandatory rights under applicable law are not waived by this draft.

## 1. Identity
LIV LLC operates the platform as Leadership Institute of Validation in Virginia, United States. This draft describes repository-supported processing and identifies legal questions. PR01–PR03 must be completed before publication.

## 2. Information collected
Direct submissions include names, emails, account/authentication information, profile choices and support requests. ATPs supply learner identity/contact details, courses, completion records and supporting evidence. Credential data include numbers, statuses, integrity information, account claims and decisions.

Partner applications include organization, representative, trainer, scope and evidence information. Commerce records include billing details, invoices, payment references, membership terms, gift recipients, seats and redemption events. Community records include event registrations, contribution proposals and name-display choices. Waitlists collect email and the optional fields shown on their forms. Consents record channel, text, time and source. Audit/security records include actions, actors and timestamps; verification lookups store hashed IP information. Hashing does not necessarily anonymize information.

## 3. Purposes and bases
Data support accounts, application/completion review, issuance, verification, orders, memberships, gifts, groups, support, rights requests, complaints, security and record preservation. PR02 must map each purpose to its lawful basis, necessity, recipients and retention trigger. Contract acceptance, notice acknowledgment and training attendance are not blanket consent to processing or marketing. Newsletter and offers are separate choices. Where consent is relied upon it must be withdrawable without retrospectively invalidating lawful prior processing.

## 4. Public information
See the [Verification Policy](verification-policy.md) for exact public fields. Credential checks show holder name/course details, not learner email or full identity number. Membership names appear only by member choice. Sharing a link enables access to those public fields.
Evidence, support messages, private account and billing details are not directory content. Intended group-manager access is seat email/status plus the manager's purchasing administration. Current display of seat names is gap G04, not an approved expansion of disclosure. Sponsorship does not grant private credential or result access.

## 5. Recipients
Repository materials identify Replit hosting, PostgreSQL database technology and Stripe Checkout. PostgreSQL is software, not itself a contracted recipient. Raw Checkout card data are not stored by LIV; bank-transfer references may be recorded manually. SMTP requires a separately configured provider.
PR04 must verify contracted entities, regions, support access, backups, subprocessors and payment roles. Legal-process and adviser disclosures must be justified and limited. No company-wide no-sale/no-sharing or no-targeted-advertising claim is made solely from the absence of advertising code.

## 6. Transfers
PR05 must establish actual processing locations and required transfer mechanisms. No data-residency guarantee, adequacy finding, transfer-framework certification or signed standard contractual clauses are asserted.

## 7. Security and retention
See the [Security and Incident Notice](security-and-incident-notice.md) and [Records Retention Schedule](records-retention-schedule.md). No system is guaranteed immune to compromise. P-14/I-2 remain open. Non-expiring credentials do not justify indefinite retention of every evidence file. Account closure is a reviewed request, not immediate deletion of all financial, audit and credential records.

## 8. Requests
Use /contact or signed-in support for access, correction, deletion and other applicable rights. The account JSON export is not verified as a complete statutory response. Identity checks must be proportionate and lawful limitations explained. PR06 covers time limits, appeals and regulator contacts. Do not send passwords, full card data or unnecessary identity documents through ordinary messages. Marketing choices do not affect basic credential access.

## 9. Possible jurisdictional requirements
These are counsel-assessment areas, not declarations of coverage or exemption. Mandatory rights do not wait for this draft to be completed.

| Regime | Matters to assess |
|---|---|
| California CCPA as amended by CPRA | Coverage thresholds/exemptions; notice; access, deletion, correction; sale/sharing opt-out and preference signals; sensitive-information limits where applicable; authorized agents and non-discrimination |
| Virginia VCDPA | Scope/exemptions rather than headquarters alone; rights and appeals; controller/processor duties; sensitive data; opt-outs and assessments |
| EU GDPR | Establishment, offering to people in the EU or relevant monitoring; bases, rights, representatives/DPO, transfers. Citizenship alone is not the scope test |
| UK GDPR | UK scope separately; current data and electronic-marketing rules; rights, representation and transfers |
| Saudi PDPL | Processing concerning individuals residing in the Kingdom, including relevant processing abroad; notices, rights, lawful processing, transfers and incidents |
| UAE PDPL | Federal scope/exclusions and relevant free-zone or sector regimes; rights, security and transfers |

Official legal references checked October 23, 2026: [California Attorney General](https://oag.ca.gov/privacy/ccpa), [Virginia legislature](https://law.lis.virginia.gov/vacode/title59.1/chapter53/), [European Commission](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en), [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/who-does-the-uk-gdpr-apply-to/), [SDAIA](https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf), [UAE Government](https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws.). These inform legal review only; LIV facts come from the repository.

## 10. Children and changes
Age/guardian rules remain PR07. Significant processing changes require updated notice and any legally necessary step. Revised wording cannot retrospectively authorize an undisclosed purpose.


## Open points for counsel

- **Effective date:** [OWNER DECISION: approve the effective date after counsel review and operational readiness.] Reason: the draft is not yet adopted.
- **PR01 (P0):** [TO BE CONFIRMED BY COUNSEL: Privacy contact, legal address and any representative/DPO.] Reason: No verified appointments.
- **PR02 (P0):** [TO BE CONFIRMED BY COUNSEL: Purpose/basis inventory and controller/processor roles per data flow.] Reason: Technical access does not determine roles.
- **PR03 (P0):** [TO BE CONFIRMED BY COUNSEL: Applicability and required notices under all listed and other applicable laws.] Reason: Markets, thresholds and exemptions need review.
- **PR04 (P0):** [OWNER DECISION: Confirm vendors, contracts, recipients, regions and sale/sharing/advertising practices.] Reason: Source cannot establish all operational disclosures.
- **PR05 (P0):** [TO BE CONFIRMED BY COUNSEL: Transfer assessments and instruments per flow.] Reason: Locations and transfer agreements unverified.
- **PR06 (P0):** [TO BE CONFIRMED BY COUNSEL: Rights deadlines, identity verification, exceptions, appeals and regulators.] Reason: Export/closure screens provide only part of the workflow.
- **PR07 (P0):** [TO BE CONFIRMED BY COUNSEL: Age eligibility and children's/guardian data processes.] Reason: No approved age policy.

## Drafting trace

Repository baseline: b80919d03520d038c6aae72bf0631b5537872c9d, reviewed October 23, 2026. Sources: required project documents; src/lib/individuals.js; memberships.js; gifts.js; resources.js; community.js; waitlist.js; verify.js; retention.js; src/app.js. See [review index](README.md) for conflicts, implementation gaps, and publication gates.
