const { q } = require('../db');
async function audit({ user, actorLabel, platformId, action, target, metadata }, client) {
  const run = client ? client.query.bind(client) : q;
  await run(
    `INSERT INTO audit_logs (actor_user_id, actor_label, platform_id, action, target, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
    [user?.id || null, actorLabel || user?.email || null, platformId || null, action, target || null, metadata ? JSON.stringify(metadata) : null]
  );
}
module.exports = { audit };
