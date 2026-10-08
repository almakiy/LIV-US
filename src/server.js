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
  // Files written before the durable store existed are copied into the database (byte for byte, nothing is re-rendered).
  files.backfill().then((n) => n && console.log(`[files] copied ${n} file(s) from disk into the database`))
    .catch((e) => console.warn(`[files] copy from disk skipped: ${e.message}`));
});
