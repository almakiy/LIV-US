// LIV credential families and the types of record LIV issues. Public descriptions only; nothing here is offered as an
// assessment until the scheme is published (status 'In development').
// The classification controls certificate wording, verification wording and (later) assessment display, expiry,
// eligibility and lifecycle. Only `available` types can be issued; see docs/FUTURE-CREDENTIAL-ARCHITECTURE.md.
const RECORD_TYPES = {
  training_completion: {
    label: 'Training Completion Credential', heading: 'CERTIFICATE', subheading: 'OF TRAINING COMPLETION', title: 'Certificate of Training Completion',
    statement: 'has successfully completed the training course', shortStatement: 'has successfully completed',
    disclosure: 'Records completion of training delivered by an Authorized Education Partner. It is not a professional qualification or certification.',
    issuer: 'liv', expires: false, assessed: false, available: true,
  },
  assessed_qualification: {
    label: 'Assessed Professional Qualification', heading: 'PROFESSIONAL', subheading: 'QUALIFICATION', title: 'Professional Qualification',
    statement: 'has met the assessment requirements of the', shortStatement: 'has met the assessment requirements of the',
    disclosure: 'The holder met the assessment requirements of the named LIV credential scheme.',
    issuer: 'liv', expires: null, assessed: true, available: false,
  },
  professional_certification: {
    label: 'Professional Certification', heading: 'PROFESSIONAL', subheading: 'CERTIFICATION', title: 'Professional Certification',
    statement: 'has met the certification requirements of the', shortStatement: 'has met the certification requirements of the',
    disclosure: 'Certification decision recorded by LIV under the named scheme, subject to its validity and renewal rules.',
    issuer: 'liv', expires: true, assessed: true, available: false,
  },
  external_pathway: {
    label: 'External Credential Pathway', heading: '', subheading: '', title: '',
    statement: '', shortStatement: '',
    disclosure: 'The credential belongs to and is issued by its external owner. LIV does not issue it or make its certification decisions.',
    issuer: 'external', expires: null, assessed: null, available: false, renderable: false,
  },
};

const SCHEMES = [
  {
    slug: 'hse-governance',
    name: 'HSE Governance',
    status: 'In development',
    tagline: 'From HSE operations to HSE governance.',
    summary: 'A credential family for professionals who design, oversee and assure health, safety and environmental arrangements: who decides, who is accountable, how risk is governed, and how leaders know that controls work.',
    focus: [
      'Governance fundamentals', 'Leadership and accountability', 'Decision rights', 'HSE governance architecture', 'Roles and responsibilities',
      'Risk governance', 'Contractor governance', 'HSE assurance', 'Audit oversight', 'Incident governance', 'Investigation oversight',
      'Corrective and preventive action governance', 'Compliance oversight', 'Performance governance', 'Leading and lagging indicators',
      'Executive HSE reporting', 'Management review', 'Evidence and records', 'Environmental governance interfaces',
      'Quality governance interfaces', 'Leadership and safety culture', 'Ethics and professional conduct',
    ],
    positioning: 'It is not a replacement for, an equivalent of, or affiliated with NEBOSH, IOSH, BCSP or PECB qualifications, ISO 45001, ISO 14001 or ISO 9001 training, or any government-issued qualification. Its focus is governance: accountability, oversight and assurance.',
    // Deliberately undefined until a formal Job Task Analysis and scheme design are complete (docs/HSE-GOVERNANCE-SCHEME-ROADMAP.md).
    pending: ['Credential title and designation', 'Competency weights', 'Eligibility and experience requirements', 'Assessment method, duration, question count and passing standard', 'Validity, renewal and continuing development requirements'],
  },
];
const schemeBySlug = (slug) => SCHEMES.find((s) => s.slug === slug) || null;

module.exports = { RECORD_TYPES, SCHEMES, schemeBySlug };
