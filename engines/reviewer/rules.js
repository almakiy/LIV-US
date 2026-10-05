// Identity and legal rules for LIV content (see "Legal guardrails" in docs/ROADMAP.md). A match is a blocking finding:
// a person may publish anyway only by recording an override reason on the site.
const BLOCK = [
  { id: 'recognition-iso', re: /\bISO[-\s]?(?:accredited|approved|recognized|recognised)\b/i, why: 'Do not state that LIV or its credentials are ISO accredited, approved or recognized unless that has been granted.' },
  { id: 'recognition-body', re: /\b(?:accredited|approved|endorsed|recognized|recognised|certified)\s+by\s+(?:ISO|IAF|ANAB|ANSI|OSHA|NIOSH|PMI|IRCA|NEBOSH|IOSH|BSI|CQI|ASQ)\b/i, why: 'A claim of accreditation, approval or endorsement by a named body needs that body\'s written approval.' },
  { id: 'government', re: /\b(?:government|federal|state)[-\s](?:approved|accredited|endorsed|recognized|recognised|backed)\b|\bofficial\s+(?:U\.?S\.?|United States|federal)\s+(?:government|agency|certificate|credential)\b/i, why: 'Never imply government approval or endorsement; LIV is a private organization.' },
  { id: 'guarantee', re: /\b(?:guarantee[sd]?|assured|100\s?%)\s+(?:a\s+)?(?:pass|passing|success|job|employment|results?)\b/i, why: 'No guarantees of passing, jobs or results.' },
  { id: 'equivalence', re: /\b(?:equivalent\s+to|same\s+as|as\s+good\s+as)\s+(?:an?\s+)?(?:ISO|PMP|NEBOSH|IOSH|IRCA|CSP|CQE)\b/i, why: 'Do not claim equivalence to another body\'s credential.' },
];
// US spelling is the house style (warnings only).
const BRITISH = ['organisation', 'organisations', 'programme', 'programmes', 'colour', 'centre', 'centres', 'behaviour', 'licence', 'analyse', 'analysed', 'realise', 'realised', 'prioritise', 'standardise', 'minimise', 'optimise', 'whilst', 'labour', 'catalogue', 'judgement', 'defence', 'favour', 'neighbour'];
module.exports = { BLOCK, BRITISH };
