// Claim check: each cited sentence is compared with the excerpt of the source it cites.
// Two methods: "lexical" (offline, free; judges word and number overlap) and "model" (a language model judges support). Both only advise.
const { paragraphs, wordsOf } = require('./checks');

const STOP = new Set('this that with from have been were which their there these those into than then also such more most other some only over under about after before between while where when what will would could should shall must your they them each both very much many'.split(' '));
const content = (s) => wordsOf(s).filter((w) => w.length >= 4 && !STOP.has(w));

/** Sentences carrying a citation: [{ text, cites: [n] }], at most `max`. */
function extractClaims(body, max = 25) {
  const claims = [];
  for (const p of paragraphs(body)) {
    if (/^(#|\||```)/.test(p)) continue;
    for (const s of p.split(/(?<=[.!?])\s+/)) {
      const cites = [...s.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]));
      if (cites.length) claims.push({ text: s.replace(/\[\d{1,3}\]/g, '').replace(/\s+/g, ' ').trim(), cites });
      if (claims.length >= max) return claims;
    }
  }
  return claims;
}

function lexicalJudge(claim, sources) {
  const excerpts = claim.cites.map((n) => sources[n - 1] && sources[n - 1].excerpt).filter(Boolean);
  if (!excerpts.length) return { verdict: 'no_evidence', note: 'No source excerpt to compare with.' };
  const ex = new Set(excerpts.flatMap((e) => content(e))); const exText = excerpts.join(' ').toLowerCase();
  const words = content(claim.text); if (!words.length) return { verdict: 'no_evidence', note: 'Nothing to compare.' };
  const ratio = words.filter((w) => ex.has(w)).length / words.length;
  const nums = claim.text.replace(/\bISO(?:\/IEC)?\s?\d{3,6}(?:-\d+)?(?::\d{4})?/g, '').match(/\d[\d,.]*/g) || []; const numMiss = nums.filter((n) => !exText.includes(n.replace(/[,.]$/, '')));
  if (numMiss.length) return { verdict: ratio >= 0.6 ? 'partial' : 'unsupported', note: `Number ${numMiss[0]} does not appear in the cited excerpt.` };
  if (ratio >= 0.6) return { verdict: 'supported', note: '' };
  if (ratio >= 0.35) return { verdict: 'partial', note: 'Only part of the wording is found in the cited excerpt.' };
  return { verdict: 'unsupported', note: 'The cited excerpt does not seem to contain this claim.' };
}

const SYSTEM = 'You are a strict fact-checking assistant for an accreditation body. For each claim decide whether the cited source excerpts support it. Use only the excerpts. Answer with a JSON array only.';
function buildPrompt(claims, sources) {
  const ev = sources.map((s, i) => `[${i + 1}] ${s.title}\n${(s.excerpt || '(no excerpt available)').slice(0, 2000)}`).join('\n\n');
  const cl = claims.map((c, i) => `${i}. ${c.text} (cites ${c.cites.map((n) => `[${n}]`).join('')})`).join('\n');
  return `SOURCES\n${ev}\n\nCLAIMS\n${cl}\n\nReturn a JSON array with one object per claim: {"i": <claim number>, "verdict": "supported" | "partial" | "unsupported" | "no_evidence", "note": "<short reason>"}.`;
}
function parseVerdicts(text, n) {
  try {
    const m = /\[[\s\S]*\]/.exec(String(text)); const arr = JSON.parse(m ? m[0] : text);
    const out = new Array(n).fill(null);
    for (const r of arr) if (Number.isInteger(r.i) && r.i >= 0 && r.i < n && ['supported', 'partial', 'unsupported', 'no_evidence'].includes(r.verdict)) out[r.i] = { verdict: r.verdict, note: String(r.note || '').slice(0, 200) };
    return out;
  } catch (_) { return null; }
}

/** Returns { flags, method }. `llm` is a provider from lib/llm.js; offline providers use the lexical method. */
async function checkClaims(article, llm) {
  const sources = Array.isArray(article.sources) ? article.sources : []; const claims = extractClaims(article.body_md);
  const flags = []; if (!claims.length) return { flags, method: 'none' };
  let verdicts = null; let method = 'lexical'; let note = '';
  if (llm && !llm.offline && llm.name !== 'mock') {
    try { const res = await llm.complete({ system: SYSTEM, prompt: buildPrompt(claims, sources), engine: 'reviewer' }); verdicts = parseVerdicts(res.text, claims.length); method = verdicts ? 'model' : 'lexical'; if (!verdicts) note = 'The model answer could not be read; used the offline method.'; }
    catch (e) { note = `Model unavailable (${e.message}); used the offline method.`; }
  }
  if (note) flags.push({ id: 'claims.fallback', severity: 'info', check: 'claims', message: note });
  const sev = method === 'model' ? 'block' : 'warn';
  let noEv = 0;
  claims.forEach((c, i) => {
    const v = (verdicts && verdicts[i]) || lexicalJudge(c, sources);
    if (v.verdict === 'no_evidence') noEv++;
    else if (v.verdict === 'unsupported') flags.push({ id: 'claims.unsupported', severity: sev, check: 'claims', message: `Claim not supported by its source. ${v.note}`.trim(), location: c.text.slice(0, 90) });
    else if (v.verdict === 'partial') flags.push({ id: 'claims.partial', severity: 'warn', check: 'claims', message: `Claim only partly supported. ${v.note}`.trim(), location: c.text.slice(0, 90) });
  });
  if (noEv) flags.push({ id: 'claims.no-evidence', severity: 'info', check: 'claims', message: `${noEv} cited claim(s) could not be checked automatically because no source excerpt was provided. A human must verify them against the sources.` });
  return { flags, method };
}
module.exports = { checkClaims, extractClaims, lexicalJudge, parseVerdicts, buildPrompt };
