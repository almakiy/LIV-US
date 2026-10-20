// Reminders for unfinished drafts (Batch H). A draft idle for 30 days gets one reminder; idle for 90 days, a second one.
// The stale-draft closure at 180 days is separate (applications.closeStaleDrafts). Each reminder is sent once per draft
// and step, through the email queue's dedupe key.
const { q } = require('../db');
const { queueToPlatform } = require('./email');

const STEPS = [90, 30]; // checked from the longest idle period, so each draft gets only the reminder that applies now

async function remindStaleDrafts() {
  let queued = 0;
  for (const [i, days] of STEPS.entries()) {
    const lower = (col) => (i === 0 ? '' : `AND ${col} >= now() - interval '${STEPS[i - 1]} days'`);
    // Only the reminder for the current idle period: a draft over 90 days is not also sent the 30-day reminder.
    const { rows: apps } = await q(`SELECT a.id, a.platform_id, p.company_name FROM partner_applications a JOIN platforms p ON p.id = a.platform_id
      WHERE a.state = 'draft' AND a.current_version = 0 AND a.updated_at < now() - ($1::int * interval '1 day') ${lower('a.updated_at')}`, [days]);
    for (const a of apps) {
      await queueToPlatform(a.platform_id, 'status_update', draft('application', a.company_name, days, '/portal/application'), `draft-${days}:app:${a.id}`).catch(() => {});
      queued++;
    }
    const { rows: titles } = await q(`SELECT t.id, t.platform_id, t.title, p.company_name FROM partner_title_requests t JOIN platforms p ON p.id = t.platform_id
      WHERE t.status = 'draft' AND t.updated_at < now() - ($1::int * interval '1 day') ${lower('t.updated_at')}`, [days]);
    for (const t of titles) {
      await queueToPlatform(t.platform_id, 'status_update', draft('title request', t.company_name, days, '/portal/titles', t.title), `draft-${days}:title:${t.id}`).catch(() => {});
      queued++;
    }
  }
  return queued;
}

function draft(kind, company, days, url, title) {
  const subject = title ? `"${title}"` : 'Your application';
  return {
    title: `Your ${kind} is still a draft`,
    message: `${subject} for ${company} has had no changes for ${days} days. Drafts with no activity for 180 days are closed. Open it to continue, or withdraw it if you no longer need it.`,
    url, label: 'Open the draft',
  };
}

module.exports = { remindStaleDrafts, STEPS };
