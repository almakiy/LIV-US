// Admin: resources, newsletter, events, contributions, program interest (M3, M5) and gifts and group packs (M4). Mounted under /admin.
// Ordinary work is delegated to LIV staff; prices, gift campaigns and newsletter sending stay with the main account.
const express = require('express');
const multer = require('multer');
const cfg = require('../config');
const { q } = require('../db');
const R = require('../lib/resources');
const C = require('../lib/community');
const G = require('../lib/gifts');
const { isMainAccount } = require('../lib/exceptions');
const { requireSuper, wrap, flash } = require('../lib/guards');

const r = express.Router();
for (const p of ['/community', '/resources', '/gifts']) r.use(p, requireSuper);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const csrf = (req, res, next) => req.app.locals.csrfCheck(req, res, next);
const UUID_RE = /^[0-9a-f-]{36}$/i;
const ERRORS = [R.ResourceError, C.CommunityError, G.GiftError];
const act = (fn, to) => wrap(async (req, res, next) => {
  if (req.params.id && !UUID_RE.test(req.params.id)) return next();
  try { const msg = await fn(req); if (msg) flash(req, 'success', msg); }
  catch (e) { if (!ERRORS.some((E) => e instanceof E)) throw e; flash(req, 'error', e.message); }
  res.redirect(typeof to === 'function' ? to(req) : to);
});

// ---------- Community overview ----------
r.get('/community', wrap(async (req, res) => {
  const [resources, issues, events, contributions, interest, consent] = await Promise.all([
    q(`SELECT id, slug, title, kind, access, status, price_cents, sale_approved_at, version, updated_at FROM resources ORDER BY updated_at DESC LIMIT 200`),
    q(`SELECT i.*, u.full_name AS author FROM newsletter_issues i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 50`),
    C.events({ upcomingOnly: false, includeDrafts: true }),
    q(`SELECT c.*, u.full_name, u.email FROM contributions c JOIN users u ON u.id = c.user_id ORDER BY (c.status = 'submitted') DESC, c.created_at DESC LIMIT 100`),
    q(`SELECT s.name, s.slug, count(i.id)::int AS n FROM credential_schemes s LEFT JOIN program_interest i ON i.scheme_id = s.id GROUP BY s.id ORDER BY n DESC, s.name`),
    q(`SELECT count(*) FILTER (WHERE newsletter_opt_in)::int AS newsletter, count(*) FILTER (WHERE marketing_opt_in)::int AS offers FROM users WHERE role = 'individual' AND NOT is_preview`),
  ]);
  const audience = {}; for (const i of issues.rows) audience[i.id] = await C.audienceCount(i.topics);
  res.render('admin/community', { title: 'Resources and community', experts: await C.expertApplications(), TRACKS: C.TRACKS, resources: resources.rows, issues: issues.rows, audience, events, contributions: contributions.rows, interest: interest.rows, consent: consent.rows[0],
    KINDS: R.KINDS, ACCESS: R.ACCESS, TOPICS: C.TOPICS, isMain: await isMainAccount(req.user), sendingOpen: cfg.newsletterSending, salesOpen: cfg.productSales });
}));

// ---------- Resources ----------
r.post('/resources', act(async (req) => { const id = await R.save(req.user, null, req.body); req.newId = id; return 'Draft created.'; }, (req) => (req.newId ? `/admin/resources/${req.newId}` : '/admin/community#resources')));
r.get('/resources/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const { rows: [it] } = await q('SELECT * FROM resources WHERE id = $1', [req.params.id]);
  if (!it) return next();
  const { rows: schemes } = await q(`SELECT id, name, status, record_type FROM credential_schemes ORDER BY name`);
  res.render('admin/resource', { title: `Resource: ${it.title}`, it, schemes, KINDS: R.KINDS, ACCESS: R.ACCESS, isMain: await isMainAccount(req.user), me: req.user.id,
    blockers: R.saleBlockers(it, schemes.find((s) => s.id === it.scheme_id)) });
}));
r.post('/resources/:id', act(async (req) => { await R.save(req.user, req.params.id, req.body); return 'Saved as a draft. It needs a new review before it is shown.'; }, (req) => `/admin/resources/${req.params.id}`));
r.post('/resources/:id/file', upload.single('file'), csrf, act(async (req) => { await R.attachFile(req.user, req.params.id, req.file); return 'File attached. The resource is back to draft.'; }, (req) => `/admin/resources/${req.params.id}`));
r.post('/resources/:id/submit', act(async (req) => { await R.submit(req.user, req.params.id); return 'Sent for review. Someone else reviews it.'; }, (req) => `/admin/resources/${req.params.id}`));
r.post('/resources/:id/review', act(async (req) => { const ok = req.body.decision === 'publish'; await R.review(req.user, req.params.id, ok, req.body.note); return ok ? 'Published.' : 'Returned to draft.'; }, (req) => `/admin/resources/${req.params.id}`));
r.post('/resources/:id/price', act(async (req) => { await R.approvePrice(req.user, req.params.id); return 'Price approved.'; }, (req) => `/admin/resources/${req.params.id}`));
r.post('/resources/:id/retire', act(async (req) => { await R.retire(req.user, req.params.id); return 'Retired. Existing purchases keep their access as sold.'; }, (req) => `/admin/resources/${req.params.id}`));

// ---------- Newsletter ----------
r.post('/community/newsletter', act(async (req) => { await C.saveIssue(req.user, null, req.body); return 'Draft issue saved.'; }, '/admin/community#newsletter'));
r.post('/community/newsletter/:id/approve', act(async (req) => { await C.approveIssue(req.user, req.params.id); return 'Issue approved.'; }, '/admin/community#newsletter'));
r.post('/community/newsletter/:id/send', act(async (req) => { const n = await C.queueIssue(req.user, req.params.id); return `Queued for ${n} subscriber(s).`; }, '/admin/community#newsletter'));

// ---------- Events ----------
r.post('/community/events', act(async (req) => { await C.saveEvent(req.user, null, req.body); return 'Event saved as a draft.'; }, '/admin/community#events'));
r.post('/community/events/:id/status', act(async (req) => { await C.setEventStatus(req.user, req.params.id, req.body.status); return 'Event updated.'; }, '/admin/community#events'));

// ---------- Contributions ----------
r.post('/community/experts/:id', act(async (req) => { await C.decideExpert(req.user, req.params.id, req.body.decision === 'approve', req.body.note); return 'Decision recorded.'; }, '/admin/community#experts'));
r.post('/community/contributions/:id', act(async (req) => { await C.decideContribution(req.user, req.params.id, req.body.decision === 'accept', req.body.note); return 'Decision recorded.'; }, '/admin/community#contributions'));

// ---------- Gifts and group packs ----------
r.get('/gifts', wrap(async (req, res) => {
  const { rows: plans } = await q(`SELECT code, name FROM membership_plans WHERE kind = 'individual' ORDER BY sort`);
  res.render('admin/gifts', { title: 'Gifts and group packs', ...(await G.adminOverview()), plans, isMain: await isMainAccount(req.user), issued: req.session.issuedGift || null });
  delete req.session.issuedGift;
}));
r.post('/gifts/campaigns', act(async (req) => { await G.saveCampaign(req.user, req.body); return 'Campaign drafted. The main account approves it.'; }, '/admin/gifts'));
r.post('/gifts/campaigns/:id/approve', act(async (req) => { await G.approveCampaign(req.user, req.params.id); return 'Campaign approved. Staff can issue its gifts.'; }, '/admin/gifts'));
r.post('/gifts/campaigns/:id/close', act(async (req) => { await G.closeCampaign(req.user, req.params.id); return 'Campaign closed.'; }, '/admin/gifts'));
r.post('/gifts/campaigns/:id/issue', act(async (req) => { const g = await G.issueCampaignGift(req.user, req.params.id, req.body); req.session.issuedGift = { email: String(req.body.recipient_email).trim().toLowerCase(), code: g.code }; return 'Gift issued and emailed.'; }, '/admin/gifts'));
r.post('/gifts/:id/revoke', act(async (req) => { await G.revokeGift(req.user, req.params.id, req.body.reason); return 'Gift withdrawn.'; }, '/admin/gifts'));

module.exports = r;
