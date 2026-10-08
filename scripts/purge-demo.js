// Removes the demo partner that `npm run seed` creates ("Demo Safety Training Co.", demo@trainingco.example), so its
// sample credentials never verify on a public server. Dry run by default; add --apply to make the change.
//   npm run purge-demo            shows what would change
//   npm run purge-demo -- --apply deletes the demo credentials and their files, suspends the demo partner, locks its users
// The same action is available to LIV administrators in Admin > System. See src/lib/demo-purge.js.
require('../src/config');
const { pool } = require('../src/db');
const { findDemo, preview, purge } = require('../src/lib/demo-purge');

(async () => {
  const p = await findDemo();
  if (!p) { console.log('No demo partner found. Nothing to do.'); return; }
  const n = await preview(p);
  console.log(`Demo partner: ${p.company_name} (${p.id}), status ${p.accreditation_status}`);
  console.log(`  delete: ${n.credentials} credential(s) with their files and verification logs, ${n.batches} batch(es), ${n.trainees} trainee(s), ${n.templates} template(s)`);
  console.log(`  revoke: ${n.apiKeys} API key(s); lock: ${n.users} user(s); suspend the partner; keep: ${n.invoices} invoice(s) and the audit log`);
  if (!process.argv.includes('--apply')) { console.log('Dry run: nothing changed. Run again with --apply to make these changes.'); return; }
  await purge(p, { actorLabel: 'purge-demo script' });
  console.log('Done: demo credentials removed (their verification links now answer "not found"), partner suspended, users locked.');
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => pool.end());
