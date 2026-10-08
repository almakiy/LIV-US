// Development defaults that are published in the README for local runs and CI. They must never work on a deployed server.
const cfg = require('../config');

const DEV_PASSWORDS = ['ChangeMe-Admin-2026', 'ChangeMe-Demo-2026'];
// The demo partner created by `npm run seed`; `npm run purge-demo` removes it from a public server.
const DEMO_PARTNER = { company: 'Demo Safety Training Co.', email: 'demo@trainingco.example' };
/** True on a deployed server for a published development password: sign-in and password changes refuse it. */
const refusedPassword = (p) => cfg.isDeployed && DEV_PASSWORDS.includes(String(p || ''));

module.exports = { DEV_PASSWORDS, DEMO_PARTNER, refusedPassword };
