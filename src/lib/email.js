// Email foundation (task 2.1). Messages are queued, sent by a worker with retries, and kept for audit.
// Drivers: 'smtp' (SMTP_URL), 'log' (prints; development), 'off' (messages stay queued). A message to a suppressed address is
// recorded as suppressed and never sent. A dedupe key makes an event that fires twice send only once.
// Footer: only LIV's name and a contact line; the registered-company details come from counsel before launch.
const cfg = require('../config');
const { q, tx } = require('../db');
const { audit } = require('./audit');

const MAX_ATTEMPTS = 5;
const backoffMinutes = (attempts) => Math.min(60, 2 ** attempts); // 2, 4, 8, 16, 32 minutes
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (v, n = 1000) => String(v ?? '').slice(0, n);

// Service targets promised to applicants (owner decision, October 19, 2026). They are commitments, monitored later in Batch H.
const TARGETS = ['A member of the LIV partner relations team will contact you within 2 working days.',
  'The completeness check is done within 5 working days of receiving the application fee.',
  'A decision follows within 30 days of a complete file.'];

function layout(title, paragraphs, action) {
  const text = [title, '', ...paragraphs.map((p) => (Array.isArray(p) ? p.map((l) => `- ${l}`).join('\n') : p)), ...(action ? ['', `${action.label}: ${action.url}`] : []), '', '--', 'Leadership Institute of Validation (LIV)', cfg.baseUrl].join('\n');
  const body = paragraphs.map((p) => (Array.isArray(p) ? `<ul>${p.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p>${esc(p)}</p>`)).join('');
  const btn = action ? `<p><a href="${esc(action.url)}" style="background:#0B2545;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${esc(action.label)}</a></p>` : '';
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1d2733;max-width:560px;margin:0 auto"><div style="background:#0B2545;color:#fff;padding:14px 18px;font-weight:bold">Leadership Institute of Validation</div><div style="padding:18px"><h2 style="margin-top:0">${esc(title)}</h2>${body}${btn}</div><div style="color:#667;font-size:12px;padding:0 18px 18px">Leadership Institute of Validation (LIV) · ${esc(cfg.baseUrl)}</div></body></html>`;
  return { text, html };
}

const TEMPLATES = {
  account_created: (d) => ({ subject: 'We received your LIV Authorized Training Provider account', ...layout(`Welcome, ${clip(d.name, 100)}`, [
    `Your account for ${clip(d.company, 200)} is ready. Nothing has been submitted yet.`, 'What happens next:',
    ['Complete the application in short stages (about 25 minutes in all). Each stage saves on its own, so you can stop and return at any time.', 'At the end you submit and pay the application fee. Paying it does not authorize you; authorization depends on the review.', ...TARGETS]],
  { label: 'Open your application', url: `${cfg.baseUrl}/portal/application` }) }),
  application_submitted: (d) => ({ subject: `Application received (version ${Number(d.version) || 1})`, ...layout('We have your application', [
    `LIV received version ${Number(d.version) || 1} of the application for ${clip(d.company, 200)}.`, d.feeDue ? 'The application fee invoice is open. LIV starts the review once the fee is received.' : 'LIV will tell you here if anything else is needed.', ...TARGETS],
  { label: 'View your application', url: `${cfg.baseUrl}/portal/application` }) }),
  application_request: (d) => ({ subject: 'LIV needs more from you on your application', ...layout('A request from LIV', [
    `LIV reviewed the application for ${clip(d.company, 200)} and needs the following:`, clip(d.reason, 1500), 'Update the stages or documents and submit again.'],
  { label: 'Open your application', url: `${cfg.baseUrl}/portal/application` }) }),
  title_outcome: (d) => ({ subject: `Your title request: ${clip(d.title, 120)}`, ...layout('An update on your title request', [
    `LIV reviewed the title "${clip(d.title, 200)}". Outcome: ${clip(d.outcome, 60)}.`, clip(d.reason, 1500),
    d.outcome === 'authorized' ? 'The title is now part of your authorized scope.' : 'Open the request to see what happens next.'],
  { label: 'Open your title requests', url: `${cfg.baseUrl}/portal/titles` }) }),
  status_update: (d) => ({ subject: clip(d.title, 120), ...layout(clip(d.title, 120), [clip(d.message, 1500)].concat(d.reason ? [clip(d.reason, 1500)] : []),
  d.url ? { label: clip(d.label || 'Open', 40), url: `${cfg.baseUrl}${d.url}` } : null) }),
  individual_verify: (d) => ({ subject: 'Confirm your email address for your LIV account', ...layout(`Welcome, ${clip(d.name, 100)}`, [
    'Confirm this email address to finish setting up your LIV account. Once it is confirmed, LIV can show you the credentials recorded under this address.',
    'The link works for 72 hours and only once. If you did not create this account, ignore this message.'],
  { label: 'Confirm my email', url: `${cfg.baseUrl}/signup/verify?t=${encodeURIComponent(d.token)}` }) }),
  individual_extra_email: (d) => ({ subject: 'Confirm this address for your LIV account', ...layout('Confirm this address', [
    'Someone asked to add this address to a LIV account so that credentials recorded under it can be found. Confirm only if the account is yours.',
    'The link works for 72 hours and only once.'],
  { label: 'Confirm this address', url: `${cfg.baseUrl}/me/emails/verify?t=${encodeURIComponent(d.token)}` }) }),
  individual_exists: () => ({ subject: 'You already have a LIV account', ...layout('You already have a LIV account', [
    'Someone tried to create a LIV account with this email address, which already has one. No new account was created.',
    'If it was you, sign in instead, or reset your password. If it was not you, no action is needed.'],
  { label: 'Sign in', url: `${cfg.baseUrl}/login` }) }),
  individual_reset: (d) => ({ subject: 'Reset your LIV password', ...layout('Reset your password', [
    'Use the link below to choose a new password. It works for one hour and only once.',
    'If you did not ask for this, ignore this message: your password stays the same.'],
  { label: 'Choose a new password', url: `${cfg.baseUrl}/password/reset?t=${encodeURIComponent(d.token)}` }) }),
  membership_reminder: (d) => ({ subject: 'Your LIV membership ends in 30 days', ...layout('Your membership ends soon', [
    `Your ${clip(d.plan, 120)} membership ends on ${clip(d.ends, 10)}. You can renew from your account; nothing renews automatically.`,
    'Your credentials stay valid and verifiable whether or not you renew.'],
  { label: 'Open my membership', url: `${cfg.baseUrl}/me/membership` }) }),
  claim_outcome: (d) => ({ subject: `Your request for credential ${clip(d.cert, 20)}`, ...layout('An update on your request', [
    `LIV reviewed your request to link credential ${clip(d.cert, 20)} to your account. Outcome: ${d.approved ? 'approved' : 'not approved'}.`, clip(d.reason, 1500)],
  { label: 'Open your credentials', url: `${cfg.baseUrl}/me/credentials` }) }),
  application_fee_received: (d) => ({ subject: 'Application fee received', ...layout('Thank you, the fee is received', [
    `LIV received the application fee for ${clip(d.company, 200)}. The completeness check is done within 5 working days.`, 'The fee pays for the review work. It does not affect the decision.'],
  { label: 'View your application', url: `${cfg.baseUrl}/portal/application` }) }),
};

/** Queues a message. Returns { id, status } or null when the dedupe key was already used. */
async function queue({ to, name = null, template, data = {}, platformId = null, dedupeKey = null }) {
  const render = TEMPLATES[template];
  if (!render) throw new Error(`Unknown email template: ${template}`);
  const email = String(to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  const m = render(data);
  const { rows: [sup] } = await q('SELECT 1 FROM email_suppressions WHERE email = $1', [email]);
  const { rows: [row] } = await q(`INSERT INTO email_outbox (to_email, to_name, template, subject, text_body, html_body, platform_id, dedupe_key, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id, status`,
  // Preview accounts use a reserved domain: their messages are kept for review and never sent.
  [email, name, template, m.subject, m.text, m.html, platformId, dedupeKey, sup || email.endsWith('@preview.liv.invalid') ? 'suppressed' : 'queued']);
  return row || null;
}

/** Addresses of a provider's administrators (and its contact email), without duplicates. */
async function platformRecipients(platformId) {
  const { rows } = await q(`SELECT email, full_name AS name FROM users WHERE platform_id = $1 AND role = 'platform_admin'
    UNION SELECT contact_email, company_name FROM platforms WHERE id = $1 AND contact_email IS NOT NULL`, [platformId]);
  const seen = new Set();
  return rows.filter((r) => r.email && !seen.has(r.email.toLowerCase()) && seen.add(r.email.toLowerCase()));
}
async function queueToPlatform(platformId, template, data, dedupeBase) {
  for (const r of await platformRecipients(platformId)) await queue({ to: r.email, name: r.name, template, data, platformId, dedupeKey: dedupeBase ? `${dedupeBase}:${r.email.toLowerCase()}` : null }).catch(() => {});
}

function driverFor(name = cfg.emailDriver) {
  if (name === 'smtp') {
    if (!cfg.smtpUrl) throw new Error('SMTP_URL is not set');
    const transport = require('nodemailer').createTransport(cfg.smtpUrl);
    return { name, send: async (m) => (await transport.sendMail({ from: cfg.emailFrom, to: m.to_name ? { name: m.to_name, address: m.to_email } : m.to_email, subject: m.subject, text: m.text_body, html: m.html_body })).messageId };
  }
  if (name === 'log') return { name, send: async (m) => { console.log(`[email:log] to ${m.to_email}: ${m.subject}`); return `log-${m.id}`; } };
  return null; // 'off': messages stay queued
}

/** Sends due messages. A failure is retried with a growing delay, and the message fails after MAX_ATTEMPTS. Returns counts. */
async function processQueue({ limit = 10, driver = driverFor() } = {}) {
  const out = { sent: 0, retried: 0, failed: 0 };
  if (!driver) return out;
  await q(`UPDATE email_outbox SET status = 'queued' WHERE status = 'sending' AND next_attempt_at < now() - interval '10 minutes'`); // a worker that died mid-send
  const { rows } = await q(`UPDATE email_outbox SET status = 'sending', next_attempt_at = now() WHERE id IN (
      SELECT id FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [limit]);
  for (const m of rows) {
    const { rows: [sup] } = await q('SELECT 1 FROM email_suppressions WHERE email = $1', [m.to_email]);
    if (sup) { await q(`UPDATE email_outbox SET status = 'suppressed' WHERE id = $1`, [m.id]); continue; }
    try {
      const id = await driver.send(m);
      await q(`UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = now(), provider_message_id = $2, last_error = NULL WHERE id = $1`, [m.id, String(id || '').slice(0, 200)]);
      await audit({ platformId: m.platform_id, actorLabel: 'email worker', action: 'email.sent', target: m.id, metadata: { template: m.template } }).catch(() => {});
      out.sent++;
    } catch (e) {
      const attempts = m.attempts + 1; const dead = attempts >= MAX_ATTEMPTS;
      await q(`UPDATE email_outbox SET status = $2, attempts = $3, last_error = $4, next_attempt_at = now() + ($5::int * interval '1 minute') WHERE id = $1`, [m.id, dead ? 'failed' : 'queued', attempts, clip(e.message, 500), backoffMinutes(attempts)]);
      if (dead) { await audit({ platformId: m.platform_id, actorLabel: 'email worker', action: 'email.failed', target: m.id, metadata: { template: m.template } }).catch(() => {}); out.failed++; } else out.retried++;
    }
  }
  return out;
}

async function retry(id) { return (await q(`UPDATE email_outbox SET status = 'queued', attempts = 0, next_attempt_at = now(), last_error = NULL WHERE id = $1 AND status = 'failed'`, [id])).rowCount; }
async function suppress(email, reason = 'manual') { await q(`INSERT INTO email_suppressions (email, reason) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`, [String(email).trim().toLowerCase(), reason]); }
async function unsuppress(email) { await q('DELETE FROM email_suppressions WHERE email = $1', [String(email).trim().toLowerCase()]); }

module.exports = { TEMPLATES, TARGETS, MAX_ATTEMPTS, backoffMinutes, queue, queueToPlatform, processQueue, driverFor, retry, suppress, unsuppress };
