const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const path = require('path');
const cfg = require('./config');
const { pool, q } = require('./db');
const { randomToken, safeEqual } = require('./lib/crypto');
const { longDate, usDate } = require('./lib/pdf');
const usDateTime = (d) => (d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { 'img-src': ["'self'", 'data:'], 'script-src': ["'self'"], 'form-action': ["'self'"] },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));
// Stripe needs the exact raw body to verify its signature, so this route is registered before the JSON parser.
app.post('/api/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), require('./routes/stripe-webhook'));
app.use('/api', express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(session({
  store: new PgSession({ pool, tableName: 'sessions', createTableIfMissing: true }),
  name: 'liv.sid',
  secret: cfg.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: cfg.isProd, maxAge: 1000 * 60 * 60 * 8 },
}));

// Load current user + view locals
app.use(async (req, res, next) => {
  try {
    res.locals.brand = cfg.brand;
    res.locals.brandLong = cfg.brandLong;
    res.locals.legalEntity = cfg.legalEntity;
    res.locals.usDate = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d instanceof Date ? d.toISOString() : d)) ? usDate(d) : d);
    res.locals.usDateTime = usDateTime;
    res.locals.baseUrl = cfg.baseUrl;
    res.locals.publicApply = cfg.publicApply;
    res.locals.path = req.path;
    res.locals.longDate = longDate;
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    if (req.session.userId) {
      const { rows: [u] } = await q(
        `SELECT u.id, u.email, u.full_name, u.role, u.platform_id, u.totp_enabled, u.must_change_password, p.service_hold, p.company_name, p.accreditation_status, p.logo_path, p.primary_color
           FROM users u LEFT JOIN platforms p ON p.id = u.platform_id WHERE u.id = $1`, [req.session.userId]);
      if (u) {
        req.user = { ...u, realRole: u.role };
        // Super admin acting on behalf of a provider (issuance, templates, settings). Audit rows keep the admin as actor.
        if (u.role === 'super_admin' && req.session.actAs) {
          const { rows: [p] } = await q('SELECT id, company_name, accreditation_status, logo_path, primary_color FROM platforms WHERE id = $1', [req.session.actAs]);
          if (p) req.user = { ...req.user, role: 'platform_admin', platform_id: p.id, company_name: p.company_name, accreditation_status: p.accreditation_status, logo_path: p.logo_path, primary_color: p.primary_color, actingAs: true };
          else delete req.session.actAs;
        }
      } else delete req.session.userId;
    }
    // Account-security gates: a forced password change, and two-factor sign-in when the policy requires it.
    if (req.user && !/^\/(account|logout|login|api|logo|static|favicon|admin-exit)/.test(req.path)) {
      const need2fa = cfg.require2fa === 'all' || (cfg.require2fa === 'admin' && req.user.realRole === 'super_admin');
      if (req.user.must_change_password) { req.session.flash = { type: 'error', text: 'Set a new password to continue.' }; return res.redirect('/account/security#password'); }
      if (need2fa && !req.user.totp_enabled) { req.session.flash = { type: 'error', text: 'Two-factor sign-in is required. Set it up to continue.' }; return res.redirect('/account/security#two-factor'); }
    }
    res.locals.user = req.user || null;
    if (!req.session.csrf && req.method === 'GET' && !req.path.startsWith('/api')) req.session.csrf = randomToken();
    res.locals.csrf = req.session.csrf || '';
    next();
  } catch (e) { next(e); }
});

// CSRF check for all non-API form posts. Multipart routes call csrfCheck after multer.
function csrfCheck(req, res, next) {
  const t = req.body?._csrf;
  if (!t || !req.session.csrf || !safeEqual(t, req.session.csrf)) return res.status(403).render('error', { title: 'Session expired', message: 'Your form session expired. Go back, reload the page and try again.' });
  next();
}
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.path.startsWith('/api') || req.is('multipart/form-data')) return next();
  csrfCheck(req, res, next);
});
app.locals.csrfCheck = csrfCheck;

app.use(require('./routes/public'));
app.use(require('./routes/knowledge'));
app.use(require('./routes/auth'));
app.use('/account', require('./routes/account'));
app.use('/portal', require('./routes/portal'));
app.use('/admin/qms', require('./routes/qms'));
app.use('/admin/billing', require('./routes/billing-admin'));
app.use('/admin', require('./routes/admin'));
app.use('/api/v1/content', require('./routes/content-api'));
app.use('/api/v1', require('./routes/api'));

app.use((req, res) => res.status(404).render('error', { title: 'Page not found', message: 'The page you are looking for does not exist.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (req.path.startsWith('/api')) return res.status(status).json({ error: status === 500 ? 'Internal error' : err.message });
  res.status(status).render('error', { title: 'Something went wrong', message: status === 500 ? 'An unexpected error occurred. Please try again.' : err.message });
});

module.exports = app;
