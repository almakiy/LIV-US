// Trainers added after authorization (F2). A provider submits a trainer with a document and the scopes the trainer will teach;
// the reviewer (assessor position) accepts, which records a trainer record for each chosen scope, or returns it or refuses it.
// Same document rules as application evidence: PDF, PNG or JPEG checked by content, up to 10 MB, private, every download logged.
const crypto = require('crypto');
const { q, tx } = require('../db');
const { audit } = require('./audit');
const pos = require('./positions');
const files = require('./files');
const { hasNonLatin } = require('./application-form');
const { ApplicationError, sniff, MAX_EVIDENCE_BYTES } = require('./applications');

const TEXTS = [['trainer_name', 'Trainer name', 200], ['qualifications', 'Qualifications', 2000], ['experience', 'Subject experience', 2000], ['delivery_competence', 'Training-delivery competence', 2000]];

function check(body) {
  const out = {}; const errors = [];
  for (const [k, label, max] of TEXTS) {
    out[k] = String(body[k] ?? '').trim().slice(0, max);
    if (!out[k]) errors.push(`${label}: this is required.`);
    else if (hasNonLatin(out[k])) errors.push(`${label}: write in English (Latin letters). Nothing is translated or converted.`);
  }
  out.scope_ids = [].concat(body.scope_ids || []).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (!out.scope_ids.length) errors.push('Choose at least one scope this trainer will teach.');
  return { out, errors };
}
async function event(c, id, to, actor, note) {
  await c.query('INSERT INTO partner_trainer_events (addition_id, to_status, actor_label, note) VALUES ($1,$2,$3,$4)', [id, to, actor?.email || 'system', String(note || '').slice(0, 4000)]);
  await c.query('UPDATE partner_trainer_additions SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
}
async function ownScopes(c, platformId, ids) {
  const { rows } = await c.query(`SELECT id FROM partner_scopes WHERE platform_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`, [platformId, ids]);
  return rows.map((r) => r.id);
}
function readFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new ApplicationError('Attach the trainer\'s CV or certificates.');
  if (file.buffer.length > MAX_EVIDENCE_BYTES) throw new ApplicationError('Files can be up to 10 MB.');
  const kind = sniff(file.buffer);
  if (!kind) throw new ApplicationError('The document must be a PDF, PNG or JPEG file.');
  return { kind, name: String(file.name || `trainer.${kind.ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 200) };
}

async function submit(platformId, user, body, file) {
  const { out, errors } = check(body);
  if (errors.length) throw new ApplicationError(errors[0]);
  const f = readFile(file);
  return tx(async (c) => {
    const ok = await ownScopes(c, platformId, out.scope_ids);
    if (ok.length !== out.scope_ids.length) throw new ApplicationError('Choose only your own active scopes.');
    const id = crypto.randomUUID(); const key = `trainers/${platformId}/${id}.${f.kind.ext}`;
    await files.putFile(key, file.buffer, c);
    await c.query(`INSERT INTO partner_trainer_additions (id, platform_id, trainer_name, qualifications, experience, delivery_competence, scope_ids, file_key, filename, content_type, bytes, sha256, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, platformId, out.trainer_name, out.qualifications, out.experience, out.delivery_competence, out.scope_ids, key, f.name, f.kind.type, file.buffer.length,
      crypto.createHash('sha256').update(file.buffer).digest('hex'), user?.id || null]);
    await event(c, id, 'submitted', user, 'Submitted');
    await audit({ user, platformId, action: 'trainer.submit', target: id }, c);
    return { id };
  });
}
/** After "needs more", the provider sends the corrected trainer (new text, same or new document). */
async function resubmit(id, platformId, user, body, file) {
  const { out, errors } = check(body);
  if (errors.length) throw new ApplicationError(errors[0]);
  return tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT * FROM partner_trainer_additions WHERE id = $1 AND platform_id = $2 FOR UPDATE', [id, platformId]);
    if (!t) throw new ApplicationError('Trainer submission not found.', 404);
    if (t.status !== 'needs_more') throw new ApplicationError('Only a submission LIV returned can be corrected.', 409);
    if ((await ownScopes(c, platformId, out.scope_ids)).length !== out.scope_ids.length) throw new ApplicationError('Choose only your own active scopes.');
    let doc = { file_key: t.file_key, filename: t.filename, content_type: t.content_type, bytes: t.bytes, sha256: t.sha256 };
    if (file?.buffer?.length) {
      const f = readFile(file); const key = `trainers/${platformId}/${id}-${Date.now()}.${f.kind.ext}`;
      await files.putFile(key, file.buffer, c);
      doc = { file_key: key, filename: f.name, content_type: f.kind.type, bytes: file.buffer.length, sha256: crypto.createHash('sha256').update(file.buffer).digest('hex') };
    }
    await c.query(`UPDATE partner_trainer_additions SET trainer_name=$2, qualifications=$3, experience=$4, delivery_competence=$5, scope_ids=$6, file_key=$7, filename=$8, content_type=$9, bytes=$10, sha256=$11, reviewer_id=NULL, reviewer_label=NULL, finding=NULL WHERE id = $1`,
      [id, out.trainer_name, out.qualifications, out.experience, out.delivery_competence, out.scope_ids, doc.file_key, doc.filename, doc.content_type, doc.bytes, doc.sha256]);
    await event(c, id, 'submitted', user, 'Corrected and submitted again');
    return { id };
  });
}
async function withdraw(id, platformId, user) {
  return tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT status FROM partner_trainer_additions WHERE id = $1 AND platform_id = $2 FOR UPDATE', [id, platformId]);
    if (!t) throw new ApplicationError('Trainer submission not found.', 404);
    if (!['submitted', 'needs_more'].includes(t.status)) throw new ApplicationError(`The submission is already ${t.status}.`, 409);
    await event(c, id, 'withdrawn', user, 'Withdrawn by the provider');
  });
}

/** The reviewer decides. Accepting records one trainer record per chosen scope that is still active. */
async function review(id, user, { outcome, finding }) {
  await pos.require(user, 'assess');
  const why = String(finding || '').trim();
  if (!why) throw new ApplicationError('Write the finding. It is shown to the provider.');
  if (!['accepted', 'refused', 'needs_more'].includes(outcome)) throw new ApplicationError('Choose an outcome.');
  const r = await tx(async (c) => {
    const { rows: [t] } = await c.query('SELECT * FROM partner_trainer_additions WHERE id = $1 FOR UPDATE', [id]);
    if (!t) throw new ApplicationError('Trainer submission not found.', 404);
    if (t.status !== 'submitted') throw new ApplicationError(`The submission is ${t.status.replace(/_/g, ' ')}, not waiting for review.`, 409);
    let scopes = [];
    if (outcome === 'accepted') {
      scopes = await ownScopes(c, t.platform_id, t.scope_ids);
      if (!scopes.length) throw new ApplicationError('None of the chosen scopes is active any more.', 409);
      for (const sid of scopes) await c.query(`INSERT INTO partner_scope_trainers (scope_id, application_id, trainer_name, evidence_id, finding, recorded_by, recorded_by_label, addition_id)
        VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [sid, t.trainer_name, why, user.id, user.email, id]);
    }
    await c.query('UPDATE partner_trainer_additions SET reviewer_id = $2, reviewer_label = $3, finding = $4 WHERE id = $1', [id, user.id, user.email, why]);
    await event(c, id, outcome, user, why);
    await audit({ user, platformId: t.platform_id, action: `trainer.${outcome}`, target: id, metadata: { scopes: scopes.length } }, c);
    return { id, platformId: t.platform_id, name: t.trainer_name, outcome, why, scopes: scopes.length };
  });
  await require('./email').queueToPlatform(r.platformId, 'title_outcome', { title: `Trainer: ${r.name}`, outcome: { accepted: 'accepted', refused: 'refused', needs_more: 'needs more information' }[outcome], reason: why }, `trainer:${id}:${outcome}:${Date.now()}`).catch(() => {});
  return r;
}

async function listOwn(platformId) { return (await q('SELECT id, trainer_name, status, updated_at FROM partner_trainer_additions WHERE platform_id = $1 ORDER BY updated_at DESC', [platformId])).rows; }
async function getOwn(id, platformId) {
  const { rows: [t] } = await q('SELECT * FROM partner_trainer_additions WHERE id = $1 AND platform_id = $2', [id, platformId]);
  if (!t) throw new ApplicationError('Trainer submission not found.', 404);
  const { rows: events } = await q('SELECT to_status, actor_label, note, created_at FROM partner_trainer_events WHERE addition_id = $1 ORDER BY created_at, id', [id]);
  return { ...t, events };
}
async function scopesOf(platformId) { return (await q(`SELECT id, title FROM partner_scopes WHERE platform_id = $1 AND status = 'active' ORDER BY title`, [platformId])).rows; }
async function listAll() { return (await q(`SELECT a.id, a.trainer_name, a.status, a.updated_at, p.company_name FROM partner_trainer_additions a JOIN platforms p ON p.id = a.platform_id ORDER BY (a.status = 'submitted') DESC, a.updated_at DESC`)).rows; }
async function getForStaff(id) {
  const { rows: [t] } = await q('SELECT a.*, p.company_name FROM partner_trainer_additions a JOIN platforms p ON p.id = a.platform_id WHERE a.id = $1', [id]);
  if (!t) throw new ApplicationError('Trainer submission not found.', 404);
  const { rows: events } = await q('SELECT to_status, actor_label, note, created_at FROM partner_trainer_events WHERE addition_id = $1 ORDER BY created_at, id', [id]);
  const { rows: scopes } = await q('SELECT id, title FROM partner_scopes WHERE id = ANY($1::uuid[])', [t.scope_ids]);
  return { ...t, events, scopes };
}
/** Reads the document for the provider (platformId) or LIV staff; every read is logged. A foreign id returns 404. */
async function readDocument(id, user, { platformId, staff = false }) {
  if (staff && user?.role !== 'super_admin') throw new ApplicationError('Document not found.', 404);
  const { rows: [t] } = await q('SELECT * FROM partner_trainer_additions WHERE id = $1 AND ($2::uuid IS NULL OR platform_id = $2)', [id, staff ? null : platformId]);
  if (!t || (!staff && !platformId)) throw new ApplicationError('Document not found.', 404);
  const f = await files.getFile(t.file_key);
  if (!f) throw new ApplicationError('The document is missing from storage.', 500);
  await audit({ user, platformId: t.platform_id, action: 'trainer.document.download', target: id });
  return { content: f.content, type: t.content_type, filename: t.filename };
}

module.exports = { submit, resubmit, withdraw, review, listOwn, getOwn, scopesOf, listAll, getForStaff, readDocument };
