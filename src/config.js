require('dotenv').config();
const path = require('path');
const must = (k, dflt) => {
  const v = process.env[k] || dflt;
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};
const isProd = process.env.NODE_ENV === 'production';
module.exports = {
  isProd,
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: must('SESSION_SECRET', isProd ? undefined : 'dev-session-secret-change-me'),
  certHmacSecret: must('CERT_HMAC_SECRET', isProd ? undefined : 'dev-hmac-secret-change-me'),
  // Public provider application + provider login are hidden until the application gateway ships (roadmap Phase 2).
  publicApply: process.env.PUBLIC_APPLY === 'true',
  // Excel (.xlsx) uploads are enabled for testing; set ALLOW_XLSX=false to accept CSV only.
  allowXlsx: process.env.ALLOW_XLSX !== 'false',
  // Quality records: allow one person to author and approve a document / verify their own action while the team is small (recorded on the record). Set false when staff grows.
  qmsAllowSelfApproval: process.env.QMS_ALLOW_SELF_APPROVAL !== 'false',
  // Two-factor sign-in policy: '' (optional), 'admin' (required for LIV administrators) or 'all' (everyone).
  require2fa: ['admin', 'all'].includes(process.env.REQUIRE_2FA) ? process.env.REQUIRE_2FA : '',
  // Billing. Fee schedule page stays hidden until the owner approves the fees. Stripe is not connected yet: these only enable the webhook receiver.
  publicFees: process.env.PUBLIC_FEES === 'true',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  legalAddress: process.env.LEGAL_ADDRESS || '',
  billingEmail: process.env.BILLING_EMAIL || '',
  bankDetails: (process.env.BILLING_BANK_DETAILS || '').replace(/\\n/g, '\n'),
  brand: process.env.BRAND_NAME || 'LIV',
  brandLong: process.env.BRAND_LONG_NAME || 'Leading Institute of Verification',
  legalEntity: process.env.LEGAL_ENTITY || 'LIV LLC',
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage')),
};
