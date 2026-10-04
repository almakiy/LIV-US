// First-run setup so a fresh deployment is usable without a shell:
//  - creates the first super admin when none exists
//  - in non-production environments, adds a few starter articles when the knowledge hub is empty
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { q } = require('../db');
const { SAMPLE_ARTICLES } = require('./sample-content');
const { setAdminPassword } = require('./admin-account');

// No-shell recovery: set the ADMIN_RESET_PASSWORD secret (10+ chars), restart, log in, then delete the secret.
async function resetAdminFromEnv() {
  const password = process.env.ADMIN_RESET_PASSWORD;
  if (!password) return;
  const email = (process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || 'admin@liv.local').trim().toLowerCase();
  try {
    const what = await setAdminPassword(email, password);
    console.log(`\n[bootstrap] ADMIN_RESET_PASSWORD applied: admin ${what} for ${email}. Log in with that password, then DELETE the ADMIN_RESET_PASSWORD secret.\n`);
  } catch (e) { console.error(`[bootstrap] ADMIN_RESET_PASSWORD not applied: ${e.message}`); }
}

async function bootstrapAdmin() {
  const { rows } = await q("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1");
  if (rows.length) {
    const { rows: admins } = await q("SELECT email FROM users WHERE role = 'super_admin' ORDER BY created_at");
    console.log(`[bootstrap] super admin exists (${admins.map((a) => a.email).join(', ')}); SEED_ADMIN_PASSWORD is not applied. To reset: npm run reset-admin`);
    return;
  }
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@liv.local').trim().toLowerCase();
  const fromEnv = !!process.env.SEED_ADMIN_PASSWORD;
  const password = process.env.SEED_ADMIN_PASSWORD || `${crypto.randomBytes(9).toString('base64url')}Aa1`;
  const taken = await q('SELECT 1 FROM users WHERE email = $1', [email]);
  if (taken.rows.length) { console.warn(`[bootstrap] ${email} already exists as a non-admin user; set SEED_ADMIN_EMAIL to another address.`); return; }
  await q("INSERT INTO users (role, full_name, email, password_hash) VALUES ('super_admin', 'LIV Administrator', $1, $2)", [email, await bcrypt.hash(password, 12)]);
  console.log('\n==================== LIV first-run admin ====================');
  console.log(` Email:    ${email}`);
  console.log(fromEnv ? ' Password: (the SEED_ADMIN_PASSWORD you configured)' : ` Password: ${password}   <- shown once; change it after logging in`);
  console.log(' Log in at /login (Staff login in the footer)');
  console.log('==============================================================\n');
}

async function seedSampleContent() {
  if (cfg.isProd || process.env.SEED_SAMPLE_CONTENT === 'false') return;
  const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM articles');
  if (n) return;
  for (const a of SAMPLE_ARTICLES) {
    await q(`INSERT INTO articles (slug, title, summary, body_md, category, kind, status, author_name, tags, published_at)
             VALUES ($1,$2,$3,$4,$5,$6,'published','LIV Editorial',$7, now()) ON CONFLICT (slug) DO NOTHING`,
    [a.slug, a.title, a.summary, a.body_md, a.category, a.kind, a.tags]);
  }
  console.log(`[bootstrap] added ${SAMPLE_ARTICLES.length} starter articles (non-production only)`);
}

async function bootstrap() {
  try { await resetAdminFromEnv(); await bootstrapAdmin(); await seedSampleContent(); } catch (e) { console.warn(`[bootstrap] skipped: ${e.message} (did you run "npm run migrate"?)`); }
}
module.exports = { bootstrap };
