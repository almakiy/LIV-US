// Reviewer engine: runs the checks on one draft and returns a report. It never edits or publishes anything.
const fs = require('fs');
const path = require('path');
const checks = require('./checks');
const { checkClaims } = require('./claims');

const readData = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const defaultRegistry = () => readData('standards-registry.json');
const defaultSources = () => readData('trusted-sources.json');

function summarize(flags) {
  const blocks = flags.filter((f) => f.severity === 'block').length; const warns = flags.filter((f) => f.severity === 'warn').length;
  return { result: blocks ? 'block' : warns ? 'needs_changes' : 'pass', score: Math.max(0, 100 - 25 * blocks - 5 * warns), blocks, warns };
}

async function reviewDraft(article, { llm = null, registry = defaultRegistry(), sourceRegister = defaultSources(), today = new Date() } = {}) {
  const flags = [...checks.identity(article), ...checks.citations(article), ...checks.standards(article, registry), ...checks.sources(article, sourceRegister), ...checks.similarity(article), ...checks.structure(article, today), ...checks.style(article)];
  const claims = await checkClaims(article, llm);
  flags.push(...claims.flags);
  const s = summarize(flags);
  return {
    engine: 'reviewer', version: article.version, result: s.result, score: s.score, flags,
    checks_run: ['identity', 'citations', 'standards', 'sources', 'similarity', 'structure', 'style', `claims:${claims.method}`],
    model: { provider: claims.method === 'model' ? llm.name : 'none', name: claims.method === 'model' ? llm.model : claims.method },
  };
}
module.exports = { reviewDraft, summarize, defaultRegistry, defaultSources };
