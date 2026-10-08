// LIV credential families and the types of record LIV issues. Public descriptions only; nothing here is offered as an
// assessment until the scheme is published (status 'In development').
const RECORD_TYPES = {
  training_completion: { label: 'Training Completion Credential', heading: 'CERTIFICATE', subheading: 'OF TRAINING COMPLETION', available: true },
  professional_qualification: { label: 'Professional Qualification', heading: 'PROFESSIONAL', subheading: 'QUALIFICATION', available: false },
  professional_certification: { label: 'Professional Certification', heading: 'PROFESSIONAL', subheading: 'CERTIFICATION', available: false },
};

const SCHEMES = [
  {
    slug: 'hse-governance',
    name: 'HSE Governance',
    status: 'In development',
    tagline: 'From HSE operations to HSE governance.',
    summary: 'A credential family for professionals who design, oversee and assure health, safety and environmental arrangements: who decides, who is accountable, how risk is governed, and how leaders know that controls work.',
    focus: [
      'Governance fundamentals', 'Roles and accountability', 'Decision rights', 'HSE governance architecture', 'Risk governance',
      'Contractor governance', 'Assurance', 'Audit oversight', 'Incident governance', 'CAPA governance', 'Compliance',
      'Performance governance', 'HSE KPIs', 'Management review', 'Evidence and records', 'Environmental oversight', 'Quality interfaces',
    ],
    positioning: 'It complements operational HSE training and management-system courses (such as ISO 45001, ISO 14001 and ISO 9001 courses) and does not replace or imitate them. Its focus is governance: accountability, oversight and assurance.',
  },
];
const schemeBySlug = (slug) => SCHEMES.find((s) => s.slug === slug) || null;

module.exports = { RECORD_TYPES, SCHEMES, schemeBySlug };
