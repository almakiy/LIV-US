// The proposed fee schedule (docs/FEES.md) as seed data. Prices are in cents (USD). Edit prices in Admin > Billing > Price catalog.
// plan: null = the same for every plan. For per-certificate usage the rows are graduated bands starting at min_qty (counted beyond the plan's allowance).
const PLANS = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };
const PLAN_DEFAULTS = { starter: { included: 100 }, professional: { included: 500 }, enterprise: { included: 2000 } };

const P = (code, name, category, unit, prices, extra = {}) => ({ code, name, category, unit, prices, description: extra.description || '', phase: extra.phase || 'now', active: extra.active !== false, sort: extra.sort || 100 });
const flat = (cents) => [{ plan: null, min_qty: 1, cents }];
const byPlan = (s, p, e) => [{ plan: 'starter', min_qty: 1, cents: s }, { plan: 'professional', min_qty: 1, cents: p }, { plan: 'enterprise', min_qty: 1, cents: e }];

const CATALOG = [
  P('ACC_APPLICATION', 'Partner application and review', 'accreditation', 'one_time', byPlan(50000, 100000, 200000), { description: 'Documentary review of trainers, curricula and methods, and the decision. Non-refundable once review starts.', sort: 10 }),
  P('ACC_ANNUAL', 'Annual partner authorization fee', 'accreditation', 'annual', byPlan(90000, 240000, 600000), { description: 'Paid in advance. Includes one surveillance review, register listing, partner profile, use of the partner mark, portal and API, and the certificate allowance. Enterprise is quoted.', sort: 20 }),
  P('ACC_SCOPE_COURSE', 'Scope extension: additional course reviewed', 'accreditation', 'per_course', flat(25000), { sort: 30 }),
  P('ACC_SPECIAL_REVIEW', 'Special review (per review day, remote)', 'accreditation', 'per_review_day', flat(45000), { sort: 40 }),
  P('ACC_ONSITE_DAY', 'On-site review (per day; travel at cost)', 'accreditation', 'per_review_day', flat(75000), { sort: 50 }),
  P('ACC_REINSTATE', 'Reinstatement after suspension', 'accreditation', 'one_time', flat(50000), { sort: 60 }),
  P('ACC_APPEAL', 'Appeal of an authorization decision (refunded if upheld)', 'accreditation', 'one_time', flat(30000), { sort: 70 }),
  P('ACC_ADMIN_CHANGE', 'Change of legal name or ownership', 'accreditation', 'one_time', flat(15000), { sort: 80 }),
  P('CERT_ISSUE', 'Certificate issuance beyond the included allowance', 'certificate', 'per_certificate',
    [{ plan: null, min_qty: 1, cents: 400 }, { plan: null, min_qty: 1001, cents: 300 }, { plan: null, min_qty: 5001, cents: 200 }], { description: 'Graduated per plan year: certificates 1-1,000 beyond the allowance at $4.00, 1,001-5,000 at $3.00, above 5,000 at $2.00.', sort: 110 }),
  P('CERT_REISSUE', 'Certificate correction or re-issue (after 30 days)', 'certificate', 'per_certificate', flat(500), { sort: 120 }),
  P('CERT_TEMPLATE_CUSTOM', 'Custom certificate design (setup)', 'certificate', 'one_time', flat(30000), { sort: 130 }),
  P('CERT_VERIFY_LETTER', 'Signed verification letter', 'certificate', 'per_document', flat(2500), { sort: 140 }),
  P('CERT_PRINT', 'Printed certificate with foil and seal', 'certificate', 'per_certificate', flat(1200), { phase: 'printing and shipping', active: false, sort: 150 }),
  P('CERT_APOSTILLE', 'Notarization, apostille or legalization service fee (government fees and courier at cost)', 'certificate', 'per_document', flat(6000), { phase: 'printing and shipping', active: false, sort: 160 }),
  P('VERIFY_API_PRO', 'Verification API Pro (up to 2,000 a month)', 'verification', 'monthly', flat(4900), { phase: 'employer verification', active: false, sort: 210 }),
  P('VERIFY_BULK_RECORD', 'Bulk file check (per record above plan)', 'verification', 'per_record', flat(25), { phase: 'employer verification', active: false, sort: 220 }),
  P('EXAM_FOUNDATION', 'Exam attempt: Foundation', 'candidate', 'per_attempt', flat(9000), { phase: 'examinations', active: false, sort: 310 }),
  P('EXAM_PRACTITIONER', 'Exam attempt: Practitioner', 'candidate', 'per_attempt', flat(15000), { phase: 'examinations', active: false, sort: 320 }),
  P('EXAM_ADVANCED', 'Exam attempt: Advanced', 'candidate', 'per_attempt', flat(25000), { phase: 'examinations', active: false, sort: 330 }),
  P('EXAM_CENTER_SURCHARGE', 'In-person test center surcharge', 'candidate', 'per_attempt', flat(4000), { phase: 'examinations', active: false, sort: 340 }),
  P('EXAM_RESCHEDULE', 'Exam reschedule (inside 7 days)', 'candidate', 'one_time', flat(3000), { phase: 'examinations', active: false, sort: 350 }),
  P('EXAM_APPEAL', 'Appeal of an exam result (refunded if upheld)', 'candidate', 'one_time', flat(10000), { phase: 'examinations', active: false, sort: 360 }),
  P('CRED_MAINTAIN', 'Credential maintenance (per 3 years, if adopted)', 'candidate', 'one_time', flat(7500), { phase: 'examinations', active: false, sort: 370 }),
  P('COURSE_LISTING', 'Course listing in the LIV catalogue (per year)', 'course', 'annual', flat(15000), { phase: 'course catalogue', active: false, sort: 410 }),
  P('CURRICULUM_LICENCE', 'LIV curriculum pack licence (per curriculum, per year)', 'course', 'annual', flat(120000), { phase: 'curriculum studio', active: false, sort: 420 }),
  P('CURRICULUM_LEARNER', 'LIV curriculum: per enrolled learner', 'course', 'per_record', flat(600), { phase: 'curriculum studio', active: false, sort: 430 }),
  P('BOOKLET_DIGITAL', 'Digital booklet or guide', 'resource', 'one_time', flat(2900), { phase: 'commerce', active: false, sort: 510 }),
  P('PARTNER_LIBRARY', 'Partner resource library (monthly)', 'resource', 'monthly', flat(2900), { phase: 'commerce', active: false, sort: 520 }),
];

const DISCOUNT_CATEGORIES = { founding_partner: 'Founding partner', non_profit: 'Non-profit, academic or government unit', multi_year: 'Multi-year prepayment', referral: 'Referral credit', other: 'Other (record the reason)' };
// Names used before the repositioning (Oct 2026). Rows still carrying them are renamed once; edited names are left alone.
const LEGACY_NAMES = {
  ACC_APPLICATION: 'Accreditation application and assessment',
  ACC_ANNUAL: 'Annual accreditation fee',
  ACC_APPEAL: 'Appeal of an accreditation decision (refunded if upheld)',
};

module.exports = { PLANS, PLAN_DEFAULTS, CATALOG, DISCOUNT_CATEGORIES, LEGACY_NAMES };
