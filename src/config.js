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
  brand: process.env.BRAND_NAME || 'LIV',
  brandLong: process.env.BRAND_LONG_NAME || 'Leading Institute of Verification',
  legalEntity: process.env.LEGAL_ENTITY || 'LIV LLC',
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage')),
};
