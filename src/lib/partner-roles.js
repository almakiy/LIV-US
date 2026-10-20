// Roles inside a Training Provider account. Enforced server-side by path prefix; hiding menu items is only a convenience.
const ROLES = {
  account_manager: 'Account Manager',
  academic_lead: 'Academic Lead',
  records_uploader: 'Records Uploader',
  finance: 'Finance',
};

// Path prefixes (under /portal) each non-manager role may reach. Everything else is refused.
const ALLOWED = {
  academic_lead: ['/application', '/titles', '/trainers', '/level', '/api-docs', '/agreement'],
  records_uploader: ['/issue', '/batches', '/certificates', '/templates', '/api-docs', '/agreement'],
  finance: ['/billing', '/agreement'],
};
const SETTINGS_FINANCE = /^\/settings\/billing$/;

function canReach(role, p) {
  if (!role || role === 'account_manager') return true;
  if (p === '/' || p === '') return true; // dashboard
  if (role === 'finance' && SETTINGS_FINANCE.test(p)) return true;
  return (ALLOWED[role] || []).some((pre) => p === pre || p.startsWith(pre + '/'));
}

function gate(req, res, next) {
  if (!req.user || req.user.role !== 'platform_admin' || req.user.actingAs) return next();
  if (canReach(req.user.partner_role, req.path)) return next();
  res.status(403).render('error', { title: 'Not available for your role', message: `Your role (${ROLES[req.user.partner_role] || 'user'}) does not include this area. Ask your Account Manager if you need access.` });
}

module.exports = { ROLES, ALLOWED, canReach, gate };
