const cfg = require('./config');
const app = require('./app');
const { bootstrap } = require('./lib/bootstrap');
const { migrate } = require('./lib/migrate');
const files = require('./lib/files');

async function start() {
  // The schema is idempotent; applying it here means a deployment that only runs `npm start` gets new tables too.
  if (process.env.MIGRATE_ON_START !== 'false') {
    await migrate().then(() => console.log('[migrate] schema up to date'))
      .catch((e) => console.error(`[migrate] schema not applied (${e.message}); starting with the existing schema. Run "npm run migrate" for details.`));
  }
  await bootstrap();
}

start().finally(() => {
  app.listen(cfg.port, () => console.log(`${cfg.brand} certification platform on ${cfg.baseUrl} (port ${cfg.port})`));
  // Unsubmitted application drafts with no activity for 180 days are closed (the period is pending decision P-14).
  const sweep = () => require('./lib/applications').closeStaleDrafts().then((n) => n && console.log(`[applications] closed ${n} stale draft(s)`)).catch(() => {});
  setTimeout(sweep, 30 * 1000).unref(); setInterval(sweep, 24 * 3600 * 1000).unref();
  // Approved exceptions past their end date expire; they are never renewed.
  const expire = () => require('./lib/exceptions').expire().catch(() => {});
  setTimeout(expire, 45 * 1000).unref(); setInterval(expire, 24 * 3600 * 1000).unref();
  // Email worker: sends queued messages every 20 seconds (at most 10 per run), with retries. EMAIL_DRIVER=off keeps them queued.
  const mail = () => require('./lib/email').processQueue().catch((e) => console.warn(`[email] ${e.message}`));
  setTimeout(mail, 10 * 1000).unref(); setInterval(mail, 20 * 1000).unref();
  // Files written before the durable store existed are copied into the database (byte for byte, nothing is re-rendered).
  files.backfill().then((n) => n && console.log(`[files] copied ${n} file(s) from disk into the database`))
    .catch((e) => console.warn(`[files] copy from disk skipped: ${e.message}`));
});
