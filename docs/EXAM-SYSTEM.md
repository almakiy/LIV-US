# LIV — Examination system and lean operations (design, for decision)

Status (October 7, 2026): **design proposal**, nothing is built yet. It extends `CREDENTIAL-MODEL.md` and sits at priority 5 of the delivery order. Figures about other bodies come from public summaries and general knowledge (their own pages were not reachable); verify them before quoting. Vendor names are examples, not recommendations; terms, prices and ratios must be confirmed with each vendor.

## 1. Scale this design is sized for
- Year one: a few partners, at most about 5 candidates per partner per year, so on the order of **tens of candidates a year**, not thousands.
- Team of 5 or fewer people, plus outside specialists for curriculum and exam content, a US business agent and lawyers on demand.
- Consequence: **do not buy a heavy proctoring platform with minimum volumes or build camera-AI yourself.** Start with small, scheduled, human-supervised sessions and a lightweight tool stack; add automated proctoring when volume justifies it.

## 2. When exams are held: windows or on demand?
| Model | Example | Good for | Weak for |
|---|---|---|---|
| Fixed public dates | NEBOSH-style sittings several times a year | Control, exam-paper security, easy staffing | Candidate convenience, slow start |
| On demand, tied to course completion and registration | CQI/IRCA-style online exam within a limited period after the course | Convenience, link to training | Needs strong automated security; harder to staff live |

**Recommendation (year one): scheduled windows, tied to eligibility.**
1. A candidate becomes **eligible** only after an accredited partner issues a completion certificate for the matching course (this uses the existing certificate system).
2. The candidate registers with LIV and chooses one of the published windows (for example two sittings a month, small cohorts of up to 10 per supervisor).
3. Eligibility expires after a stated period (suggest 90 days after the course; confirm what suits your partners).
4. Resit rules, waiting period and attempt limits are set in the exam policy.
5. When volume grows, add on-demand slots inside the same rules (not a new system).

### Year-one calendar (proposal)
Expected demand: about 10 partners × up to 5 candidates = **roughly 50 candidates a year, about 4 to 5 a month**.
- **One exam day a month**, published a year ahead (for example the second Saturday; confirm the best day for GCC and MENA weekends).
- **Two sittings that day:** 10:00 and 17:00 Riyadh time (UTC+3), so candidates from the Gulf to North Africa can attend in working hours. Each sitting: up to **6 candidates**, one supervisor plus one backup, 30 minutes check-in plus the exam time.
- Capacity: 12 candidates a month (144 a year), about three times the expected demand.
- If both sittings fill, open an extra sitting the next day. A sitting runs even with a single candidate.
- Registration closes 7 days before the exam day; system and ID check 3 days before; results released after incident review (target 5 working days); resits at the next monthly exam day.
- Scale triggers: more than 12 a month, add a second exam day; more than 30 a month, run a 5-day exam week each month; more than about 60 a month or demand for any-time testing, move to a remote proctoring vendor with on-demand slots.

## 3. How sessions are supervised: options
| Option | How it works | Strengths | Weaknesses | Fit now |
|---|---|---|---|---|
| A. Live remote supervisor on a video call plus recording (your own staff or trained invigilators) | Candidate joins a video room; ID shown; 360-degree room scan; screen share; supervisor watches live | Cheapest, no vendor lock-in, human judgment | Staff time; limited privacy tools; camera angle gaps | **Best for the pilot** (tens of candidates) |
| B. Accredited test centers (partners or third parties) | Supervised in a room | Highest assurance, strongest in disputes | Fewer locations in MENA; cost; scheduling | Good for high-stakes or retests |
| C. Third-party remote proctoring service (AI flagging plus a live or review proctor) | Vendor's secure browser, ID and face check, AI flags, human proctor | Scales, mature workflows, evidence kept | Per-exam fees or minimums; data protection; integration work | **Phase 2**, when volume or risk requires |
| D. Record-and-review only (AI flags, humans review after) | Session recorded; AI marks events; reviewer checks flagged moments | Lowest staffing per candidate | Cheating is found after the fact; weaker deterrent | Only as a supplement |
| E. Build your own AI camera proctoring | Face tracking, gaze, audio, object detection in your platform | Full control | Costly, false positives, privacy law exposure, bias risk | **Not recommended** |

Recommended path: **A for the pilot, B for retests and high-risk cases, C when volume passes what staff can supervise.** Always keep a human decision-maker: AI flags are leads for review, never a finding of misconduct on their own.

## 4. How many candidates can one supervisor watch?
There is no safe universal number; it depends on the vendor, the exam's risk level and the quality of AI flagging. Planning figures for sizing, to be **confirmed with vendors and tested in your own pilot**:

| Mode | Candidates per supervisor at once (planning range) |
|---|---|
| Your own live video room (option A), full attention | 4 to 8 (use 6 as the cap in a pilot) |
| Vendor live proctoring with AI assistance (option C) | roughly 8 to 16 with AI alerts; vendors state their own ratios |
| Record-and-review (option D) | Unlimited live; review time about the exam length for flagged parts |

Capacity formula: concurrent candidates = supervisors on shift × ratio. At pilot volume (tens a year), **one supervisor and one backup per sitting, cohort of up to 6**, is enough.
Also required per sitting: a technical support person (can be the same backup), an agreed incident channel, and a record of who supervised.

## 5. Security layers that matter more than the camera
1. **Eligibility and identity:** registration against a completion certificate, government photo ID with name match, face-to-ID check by the supervisor (later automated).
2. **Exam design:** blueprint from a job/task analysis, large item bank, **multiple forms and randomized order**, time limits, scenario questions that are hard to look up, open-book only if the design makes lookup useless (CQI/IRCA uses open-book lead-auditor exams).
3. **Environment control:** room scan, no second person, no phones or notes (unless the design allows approved material), single monitor; secure browser or lockdown where available.
4. **Evidence:** recording of the session, supervisor notes, incident log, retained for a stated period then deleted.
5. **Post-exam analytics:** answer-similarity checks between candidates, timing anomalies, item statistics; independent review of results (PMI states it reviews results daily with outside experts).
6. **Consequences announced in advance:** score cancellation, certificate revocation, ban, notification to the sponsor/employer where lawful.
7. **Item bank security:** access control, versioning, no exam content in AI chats or in tools that train on inputs, exam writers under confidentiality agreements.
8. **Impartiality:** exam writers and supervisors must not have trained the candidates (LIV does not train); partners must not influence marking or supervision.

## 6. Data protection and law (must be checked by counsel)
Camera, voice, ID and face data are sensitive. Needed: explicit consent before each session, clear purpose, short retention, access log, secure storage, a deletion process, a complaints route, and a vendor data-processing agreement. Check the rules of the countries where candidates sit (for example UAE, Saudi Arabia and any EU candidates). Do not use biometric face matching until counsel clears it; start with human ID comparison.

## 7. Incident and appeal workflow
Suspected misconduct → supervisor flags with timestamps → session may continue or stop → second person reviews evidence → decision (clear, warn, cancel score, ban) recorded with reasons → candidate told and can appeal within a stated period to a person who was not involved. Technical failure → documented, free resit if not the candidate's fault. All steps go into the audit log and the quality records module.

## 8. What the site must have (build order)
| Phase | Build | Needs a vendor? |
|---|---|---|
| E1 | Exam policy documents in the quality module; blueprint and item-bank module (authoring, review, versions, tagging, retire); candidate registration with eligibility check against certificates | No |
| E2 | Sittings: window calendar, seat booking, candidate dashboard, consent capture, supervisor checklist and incident log, evidence attachment, result entry and release, certificate issue on pass | No (video call tool only) |
| E3 | In-browser exam delivery: randomized forms, timers, autosave, answer capture, marking, item statistics | No |
| E4 | Remote proctoring integration (option C), identity automation, similarity analytics | Yes |
| E5 | Test-center network (option B), psychometrics, recognition work (17024 alignment) | Partners |

Do not claim ISO/IEC 17024 conformity or recognition until it is assessed; "designed with reference to ISO/IEC 17024 principles" is the most that is accurate while it is not accredited (confirm wording with counsel).

## 9. Running a five-person organization with AI and automation
Principle: **AI drafts, summarizes, triages and checks; people decide, sign and are accountable.** Never let an AI make an accreditation decision, score an exam alone, sanction a candidate, sign a contract, move money or give legal/tax advice.

| Function | What to automate (safe) | What stays human |
|---|---|---|
| Partner onboarding and accreditation | Intake forms, document checklists, completeness checks, draft assessment summaries against the criteria, reminders, status updates | Assessment decision, impartiality check, sanctions |
| Curriculum and exam content | Drafts, gap analysis, terminology consistency, item drafts for subject experts, review checklists (the Reviewer engine) | Expert approval, exam sign-off, cut scores |
| Contracts and licensing | Template filling, clause comparison, obligation tracking, renewal dates | Counsel review and signature |
| Finance | Invoicing (built), payment matching, overdue reminders, monthly summaries, export for the accountant | Approving refunds, tax positions, payments |
| Sales and partner pipeline | Lead lists, outreach drafts, follow-ups, meeting briefs, CRM updates | Pricing exceptions, relationships |
| Meetings and governance | Agendas, notes, action items, minutes drafts, quality-record updates (with participants' consent to recording) | Approval of minutes, decisions |
| Support and complaints | Triage, draft replies, case log, deadline tracking | Decisions, appeals |
| Compliance and records | Document control reminders, review cycles, assessor pack generation (built) | Management review, internal audit |
| Content and marketing | Knowledge-hub drafting and fact-check flow (built) | Publication |
Controls: keep a log of AI-assisted outputs, forbid pasting exam items, candidate data or secrets into general chat tools, use business accounts with data-training disabled, name an owner for each automation, review prompts quarterly.

## 10. Decisions needed
1. Approve the scheduled-windows model for year one (and the 90-day eligibility period).
2. Approve option A for the pilot with a cap of 6 candidates per supervisor, and option C as phase 2.
3. Name who supervises (staff or trained invigilators) and who reviews incidents.
4. Choose the first subject area and who writes and reviews its exam content.
5. Ask counsel to review consent, biometric use, retention and the cross-border data position.
6. Approve building E1 and E2 next.
