// Trainer records, condition checks, the activation checklist and activation (docs/PARTNER-AUTHORIZATION.md §3 C3, §6; Batch E).
// Activation is a separate step from acceptance, taken by a different position, and only when every item is complete.
// Payment never appears here. Trainer thresholds are pending (P-5): a record is an evidence document plus the assessor's finding.
const { q, tx } = require('../db');
const { audit } = require('./audit');
const pos = require('./positions');
const { ApplicationError, event } = require('./applications');

async function lockApp(c, appId) {
  const { rows: [app] } = await c.query('SELECT * FROM partner_applications WHERE id = $1 FOR UPDATE', [appId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  return app;
}

/** The assessor records an eligible trainer for one of the provider's scopes, backed by C3 evidence of this application. */
async function recordTrainer(appId, user, { scope_id, trainer_name, evidence_id, finding }) {
  await pos.require(user, 'assess');
  const name = String(trainer_name || '').trim().slice(0, 200), why = String(finding || '').trim().slice(0, 4000);
  if (!name) throw new ApplicationError('Enter the trainer\'s name.');
  if (!why) throw new ApplicationError('Record the assessor\'s finding on this trainer.');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    if (['declined', 'withdrawn', 'closed', 'activated'].includes(app.state)) throw new ApplicationError(`Trainer records cannot be added while the application is ${app.state}.`, 409);
    const { rows: [sc] } = await c.query('SELECT id, title FROM partner_scopes WHERE id = $1 AND platform_id = $2', [scope_id, app.platform_id]);
    if (!sc) throw new ApplicationError('That scope does not belong to this provider.');
    const { rows: [ev] } = await c.query(`SELECT id FROM partner_application_evidence WHERE id = $1 AND application_id = $2 AND criterion = 'C3' AND version IS NOT NULL`, [evidence_id, app.id]);
    if (!ev) throw new ApplicationError('Choose a submitted C3 (trainer) evidence document of this application.');
    const { rows: [t] } = await c.query(`INSERT INTO partner_scope_trainers (scope_id, application_id, trainer_name, evidence_id, finding, recorded_by, recorded_by_label)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [sc.id, app.id, name, ev.id, why, user.id, user.email]);
    await audit({ user, platformId: app.platform_id, action: 'application.trainer.record', target: app.id, metadata: { scope: sc.id, trainer: name } }, c);
    return t;
  });
}

/** The assessor confirms a condition of the decision has been met (with a note). Blocking conditions must be closed before activation. */
async function closeCondition(appId, user, conditionId, note) {
  await pos.require(user, 'assess');
  if (!String(note || '').trim()) throw new ApplicationError('Record how the condition was verified.');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    const { rows: [k] } = await c.query(`SELECT k.id FROM partner_application_conditions k JOIN partner_application_decisions d ON d.id = k.decision_id WHERE k.id = $1 AND d.application_id = $2`, [conditionId, app.id]);
    if (!k) throw new ApplicationError('Condition not found.', 404);
    if ((await c.query('SELECT 1 FROM partner_condition_closures WHERE condition_id = $1', [k.id])).rows.length) throw new ApplicationError('That condition is already closed.', 409);
    await c.query('INSERT INTO partner_condition_closures (condition_id, note, closed_by) VALUES ($1,$2,$3)', [k.id, String(note).trim().slice(0, 2000), user.id]);
    await audit({ user, platformId: app.platform_id, action: 'application.condition.close', target: app.id, metadata: { condition: k.id } }, c);
  });
}

/** The activation officer confirms LIV checked a test issuance (test identifiers, never presented as real credentials). */
async function confirmTestIssuance(appId, user, note) {
  await pos.require(user, 'activate');
  if (!String(note || '').trim()) throw new ApplicationError('Record what was checked in the test issuance.');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    if (app.state !== 'accepted_pending_activation') throw new ApplicationError(`The application is ${app.state}, not waiting for activation.`, 409);
    if ((await c.query(`SELECT 1 FROM partner_activation_confirmations WHERE application_id = $1 AND item = 'test_issuance'`, [app.id])).rows.length) throw new ApplicationError('The test issuance is already confirmed.', 409);
    await c.query(`INSERT INTO partner_activation_confirmations (application_id, item, note, confirmed_by) VALUES ($1,'test_issuance',$2,$3)`, [app.id, String(note).trim().slice(0, 2000), user.id]);
    await audit({ user, platformId: app.platform_id, action: 'application.test_issuance.confirm', target: app.id }, c);
  });
}

/** The seven activation items (§6). Each is {key, label, ok, detail}. Reads through the given client so activation checks inside its own lock. */
async function checklist(run, app) {
  const items = [];
  const one = async (sql, p) => (await run(sql, p)).rows;
  const [d] = await one(`SELECT outcome FROM partner_application_decisions WHERE application_id = $1 ORDER BY created_at DESC, id LIMIT 1`, [app.id]);
  const open = await one(`SELECT k.text FROM partner_application_conditions k JOIN partner_application_decisions d ON d.id = k.decision_id
    WHERE d.application_id = $1 AND k.blocking AND NOT EXISTS (SELECT 1 FROM partner_condition_closures x WHERE x.condition_id = k.id)`, [app.id]);
  items.push({ key: 'accepted', label: 'Acceptance recorded, no open blocking condition',
    ok: app.state === 'accepted_pending_activation' && !!d && d.outcome !== 'declined' && !open.length,
    detail: app.state !== 'accepted_pending_activation' ? `The application is ${app.state.replace(/_/g, ' ')}.` : open.length ? `${open.length} blocking condition(s) still open.` : 'Accepted.' });
  const [ag] = await one(`SELECT a.version, x.accepted_name FROM agreements a LEFT JOIN agreement_acceptances x ON x.agreement_id = a.id AND x.platform_id = $1 WHERE a.status = 'active'`, [app.platform_id]);
  items.push({ key: 'agreement', label: 'Active Partner Agreement accepted', ok: !!ag?.accepted_name,
    detail: !ag ? 'No active agreement is published yet (counsel\'s text, P-7).' : ag.accepted_name ? `Version ${ag.version} accepted by ${ag.accepted_name}.` : `Version ${ag.version} not yet accepted by the provider.` });
  const scopes = await one(`SELECT s.id, s.title, (SELECT count(*)::int FROM partner_scope_trainers t WHERE t.scope_id = s.id) AS trainers FROM partner_scopes s WHERE s.platform_id = $1 AND s.status = 'active'`, [app.platform_id]);
  const bare = scopes.filter((s) => !s.trainers);
  items.push({ key: 'scope', label: 'Authorized scope recorded, each with an eligible trainer on record (C3)', ok: !!scopes.length && !bare.length,
    detail: !scopes.length ? 'No active scope is recorded for this provider.' : bare.length ? `No trainer record for: ${bare.map((s) => s.title).join(', ')}.` : `${scopes.length} scope(s), each with a trainer record.` });
  const users = await one(`SELECT email, totp_enabled FROM users WHERE platform_id = $1 AND role = 'platform_admin'`, [app.platform_id]);
  const no2fa = users.filter((u) => !u.totp_enabled);
  items.push({ key: 'two_factor', label: 'Two-factor sign-in on for every provider administrator (P-4)', ok: !!users.length && !no2fa.length,
    detail: !users.length ? 'The provider has no administrator account.' : no2fa.length ? `Not enabled: ${no2fa.map((u) => u.email).join(', ')}.` : 'On for all administrators.' });
  const [pl] = await one('SELECT billing_name, billing_email FROM platforms WHERE id = $1', [app.platform_id]);
  items.push({ key: 'billing', label: 'Billing details complete', ok: !!(pl?.billing_name && pl?.billing_email),
    detail: pl?.billing_name && pl?.billing_email ? 'Provided. Any fee due is decided in P-6; payment alone never activates.' : 'Billing name or email missing.' });
  const [t] = await one(`SELECT note FROM partner_activation_confirmations WHERE application_id = $1 AND item = 'test_issuance'`, [app.id]);
  items.push({ key: 'test_issuance', label: 'Test issuance checked by LIV', ok: !!t, detail: t ? t.note : 'Not yet confirmed.' });
  return items;
}

async function getChecklist(appId) {
  const { rows: [app] } = await q('SELECT * FROM partner_applications WHERE id = $1', [appId]);
  if (!app) throw new ApplicationError('Application not found.', 404);
  const items = await checklist((sql, p) => q(sql, p), app);
  const { rows: trainers } = await q(`SELECT t.*, s.title AS scope_title FROM partner_scope_trainers t JOIN partner_scopes s ON s.id = t.scope_id WHERE t.application_id = $1 ORDER BY t.created_at`, [appId]);
  const { rows: scopes } = await q(`SELECT id, title, status FROM partner_scopes WHERE platform_id = $1 ORDER BY created_at`, [app.platform_id]);
  const { rows: closures } = await q(`SELECT x.* FROM partner_condition_closures x JOIN partner_application_conditions k ON k.id = x.condition_id JOIN partner_application_decisions d ON d.id = k.decision_id WHERE d.application_id = $1`, [appId]);
  const { rows: [act] } = await q('SELECT * FROM partner_activations WHERE application_id = $1', [appId]);
  return { items, trainers, scopes, closures, activation: act || null };
}

/** The activation officer turns the provider on. Refused unless every item is complete. The provider's status changes only here (and by suspension). */
async function activate(appId, user) {
  await pos.require(user, 'activate');
  return tx(async (c) => {
    const app = await lockApp(c, appId);
    if (app.state !== 'accepted_pending_activation') throw new ApplicationError(`The application is ${app.state.replace(/_/g, ' ')}, not waiting for activation.`, 409);
    const items = await checklist((sql, p) => c.query(sql, p), app);
    const missing = items.filter((i) => !i.ok);
    if (missing.length) throw new ApplicationError(`Activation is not possible yet: ${missing.map((i) => i.label).join('; ')}.`, 409);
    await c.query(`UPDATE platforms SET accreditation_status = 'active' WHERE id = $1`, [app.platform_id]);
    await c.query('INSERT INTO partner_activations (application_id, platform_id, checklist, activated_by, activated_by_label) VALUES ($1,$2,$3,$4,$5)', [app.id, app.platform_id, JSON.stringify(items), user.id, user.email]);
    await event(c, app, 'activated', user, 'All activation items complete');
    await audit({ user, platformId: app.platform_id, action: 'platform.activate', target: app.platform_id, metadata: { application: app.id } }, c);
    return { id: app.id, state: app.state };
  });
}

module.exports = { recordTrainer, closeCondition, confirmTestIssuance, checklist, getChecklist, activate };
