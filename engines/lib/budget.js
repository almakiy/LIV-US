// Spend guard: a monthly cap, an append-only usage ledger, and a kill switch (ENGINES_ENABLED=false or a file named KILL in the data dir).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const ledgerPath = (dir) => path.join(dir, 'usage.jsonl');
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

function readLedger(dir = cfg.dataDir) {
  try { return fs.readFileSync(ledgerPath(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; }
}
const spentThisMonth = (dir = cfg.dataDir, now = new Date()) => readLedger(dir).filter((e) => String(e.ts).startsWith(monthKey(now))).reduce((s, e) => s + (e.cost_usd || 0), 0);
const costUsd = (inTok, outTok, pIn, pOut) => (inTok * pIn + outTok * pOut) / 1e6;
const killed = (dir = cfg.dataDir) => !cfg.enabled || fs.existsSync(path.join(dir, 'KILL'));

/** Throws if a paid call is not allowed right now. `estimate` is a worst-case cost in USD for the call about to be made. */
function assertCanSpend(estimate, { dir = cfg.dataDir, budget = cfg.monthlyBudgetUsd, now = new Date() } = {}) {
  if (killed(dir)) throw new Error('Engines are switched off (ENGINES_ENABLED=false or KILL file present).');
  if (!(budget > 0)) throw new Error('No monthly budget set (ENGINE_BUDGET_USD). Paid model calls are disabled.');
  const spent = spentThisMonth(dir, now);
  if (spent + estimate > budget) throw new Error(`Monthly budget would be exceeded (spent $${spent.toFixed(4)} of $${budget.toFixed(2)}).`);
}
function record(entry, dir = cfg.dataDir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(ledgerPath(dir), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}
module.exports = { spentThisMonth, costUsd, assertCanSpend, record, killed, readLedger, monthKey };
