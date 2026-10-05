#!/usr/bin/env node
// LIV knowledge engines: command line. Usage:
//   node engines/cli.js review-file <draft.json>   review a local draft (offline unless ENGINE_PROVIDER=anthropic)
//   node engines/cli.js review-queue               review the drafts waiting on the site and post the reports
//   node engines/cli.js usage                      model spend this month and the budget
const fs = require('fs');
const cfg = require('./lib/config');
const budget = require('./lib/budget');
const { getProvider } = require('./lib/llm');
const { client } = require('./lib/site-client');
const { reviewDraft } = require('./reviewer');

const show = (r) => {
  console.log(`  result: ${r.result}  score: ${r.score}/100  checks: ${r.checks_run.join(', ')}`);
  r.flags.forEach((f) => console.log(`  [${f.severity}] ${f.check}: ${f.message}${f.location ? `  «${f.location}»` : ''}`));
};

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (budget.killed() && cmd !== 'usage') throw new Error('Engines are switched off (ENGINES_ENABLED=false or KILL file).');
  const llm = getProvider();
  if (cmd === 'review-file') {
    if (!arg) throw new Error('Give the path of a draft JSON file.');
    const r = await reviewDraft(JSON.parse(fs.readFileSync(arg, 'utf8')), { llm });
    show(r); process.exitCode = r.result === 'pass' ? 0 : r.result === 'needs_changes' ? 2 : 3;
  } else if (cmd === 'review-queue') {
    const site = client(); const { items } = await site.reviewQueue(); console.log(`${items.length} draft(s) waiting.`);
    for (const it of items) {
      const draft = await site.getDraft(it.id); console.log(`- ${draft.title} (v${draft.version})`);
      const r = await reviewDraft(draft, { llm }); show(r);
      await site.postReport(it.id, { version: draft.version, result: r.result, score: r.score, flags: r.flags, checks_run: r.checks_run, model: r.model });
    }
  } else if (cmd === 'usage') {
    console.log(`Provider: ${cfg.provider}. Spent this month: $${budget.spentThisMonth().toFixed(4)} of $${cfg.monthlyBudgetUsd.toFixed(2)}. Switched off: ${budget.killed()}.`);
  } else {
    console.log('Commands: review-file <draft.json> | review-queue | usage');
  }
}
main().catch((e) => { console.error(`Error: ${e.message}`); process.exitCode = 1; });
