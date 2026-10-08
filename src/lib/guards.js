const rateLimit = require('express-rate-limit');

const requireLogin = (req, res, next) => (req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)));
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role !== 'platform_admin') return res.redirect('/admin');
  next();
};
const requireSuper = (req, res, next) => {
  if (!req.user) return requireLogin(req, res, next);
  if (req.user.role !== 'super_admin') return res.status(403).render('error', { title: 'Forbidden', message: 'Super admin access required.' });
  next();
};
const requireActivePlatform = (req, res, next) => {
  if (req.user?.accreditation_status !== 'active') {
    req.session.flash = { type: 'error', text: 'Issuance is available only when your authorization status is Active.' };
    return res.redirect('/portal');
  }
  if (req.user?.service_hold) {
    req.session.flash = { type: 'error', text: 'Issuance is paused while your account is on service hold for unpaid invoices. Your authorization status is unchanged. Contact LIV billing.' };
    return res.redirect('/portal/billing');
  }
  next();
};
const limiter = (windowMin, max, json = false) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => (json || req.path.startsWith('/api')
    ? res.status(429).json({ error: 'Too many requests, slow down.' })
    : res.status(429).render('error', { title: 'Too many requests', message: 'Please wait a minute and try again.' })),
});
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flash = (req, type, text) => { req.session.flash = { type, text }; };

module.exports = { requireLogin, requirePlatformAdmin, requireSuper, requireActivePlatform, limiter, wrap, flash };
