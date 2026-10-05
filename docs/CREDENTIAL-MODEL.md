# LIV — Credential model: curricula, approved partners, examination (design)

Status: design only (October 5, 2026). Supersedes §7 of `KNOWLEDGE-ENGINES.md` where they differ. Direction set by the owner: LIV does **not deliver training**. LIV **designs its own curricula and courses** in collaboration with its accredited partners; partners train the candidates; candidates then **register with LIV for the examination** and receive the official LIV credential.

Reference model: the credentialing-body model used by PMI (partners deliver training with approved content; the candidate applies to the body for the examination). Note: pmi.org could not be opened from the build environment, so this section reflects publicly known practice and must be verified against PMI's current published rules before we copy any process detail. We copy the structure only, never PMI documents, wording or branding, and we never imply PMI approval or equivalence.

## 1. Two different certificates (important)

| | **Certificate of Completion** | **LIV Credential** |
|---|---|---|
| Issued by | The education partner (may be produced through the LIV platform, as today) | LIV |
| Proves | The candidate completed the training (hours, course) | The candidate **passed the LIV examination** and meets the credential requirements |
| Role | Eligibility evidence for the exam | The official accreditation certificate |
| Wording | "Issued by LIV on the basis of the completion report of an accredited education partner" (today's text) | "Has passed the LIV examination for …" (new text, Phase 9) |
| Expiry | None (decided) | Open decision: lifetime, or renewal cycle with continuing education |

The verification page must show which of the two it is, so a completion record is never mistaken for a credential.

## 2. Candidate journey
1. **Train** with an accredited partner on an LIV-approved course (LIV curriculum or an aligned partner curriculum).
2. **Completion record:** the partner reports completion (today's CSV/Excel/Sheets import) and the candidate receives the completion certificate. The import already stores a keyed hash of the holder's ID, so the later application can be matched to the completion record without exposing the ID.
3. **Create a candidate account** and apply for the exam: identity details, accommodations request, upload or auto-match of the completion record, eligibility check (for example minimum verified contact hours), exam fee payment.
4. **Candidate handbook acknowledged** (scope, format, rules, ID requirements, results timing, resit and appeals).
5. **Sit the proctored LIV exam** (Phase 9).
6. **Result and credential:** pass → the LIV credential is issued automatically with a verification page; fail → resit rules (fee, alternative paper, waiting period, attempt limits).
7. **Maintenance (decision):** none, or renewal with continuing education.

## 3. Product lines and phases
- **Phase 6 — Course catalogue:** structured course records (title, level, outcomes, syllabus, hours, mode, language, price range, accreditation status, which approved partners offer it, link to enroll with the partner). Partner enrollment stays with the partner; the page shows LIV information and a path to register for the exam.
- **Phase 7 — Curriculum studio:** LIV builds curricula and course packs (competence framework → learning outcomes → modules → assessment blueprint → trainer requirements). The Producer drafts, the Reviewer checks consistency with the LIV accreditation criteria, humans approve. Partners receive **approved course packs** under license.
- **Phase 8 — Candidate accounts:** accounts, eligibility matching to completion records, exam application and payment (Stripe via LIV LLC), candidate dashboard.
- **Phase 9 — Examinations** (see `ROADMAP.md`) and the **LIV credential** with its own certificate design and verification record.

Commercial model to decide: partner accreditation fee, course-pack licence fee, exam registration fee per candidate, resit fee, any partner share.

## 4. Impartiality safeguards (needs counsel and an accreditation consultant)
Providing curricula while examining the same people is the sensitive point. Standards for bodies that certify persons (the ISO/IEC 17024 family) expect impartiality and restrict a certification body from helping candidates prepare in ways that compromise it; whether publishing curricula and approved course packs is acceptable depends on the safeguards below and must be confirmed by a qualified consultant before Phases 7 and 9 are built.
1. **One published basis for both:** a job-task analysis produces a public **Exam Content Outline**; curricula and the exam are both derived from it, so no one gets exam content through the course.
2. **Separation of people:** curriculum designers and trainers are **not** exam item writers or markers; item banks are confidential and never shared with partners.
3. **No self-examination:** partners do not set, proctor or mark their own candidates' LIV exams; exams are run by LIV or an independent proctoring service.
4. **No pass guarantees** in any course or marketing material; fees and resit rules are public.
5. **Governance:** an impartiality policy, a governance board that decides partner accreditation and credential rules, conflict-of-interest declarations, and a published complaints and appeals procedure.
6. **Separate branding of roles** in the product: "LIV Accredited Partner" for training, "LIV Examination" for assessment.

## 5. Legal wording rules (carry over)
Never imply government or federal endorsement, never claim ISO accreditation or equivalence to another body's credential, never promise outcomes, and keep the non-college disclaimer. The credential is a private US credential; its value comes from published standards, a controlled exam and public verification.

## 6. Decisions needed from the owner
1. First credential(s) to design: topic and level (Quality, Safety, Project Management).
2. Eligibility rule: required training hours and any experience requirement.
3. Credential lifetime: lifetime or renewal cycle.
4. Exam delivery: online proctored, test centers, or both; vendor selection.
5. Fee structure and partner share.
6. Appointment of a governance board and an accreditation consultant before Phases 7 and 9.
