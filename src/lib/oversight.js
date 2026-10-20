// The work queue (who has to act, since when) and a small management report. Both read existing records only.
// Work items never rely on one person's memory: each shows the position that owns it, and whether that position is vacant.
const { q } = require('../db');

const MAIN = 'main_account';
const POSITION_TITLE = { application_assessor: 'Application Assessor', authorization_decision_maker: 'Authorization Decision-Maker', activation_officer: 'Activation Officer', partner_relations: 'Partner Relations Coordinator', [MAIN]: 'Main account' };
const days = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

async function workQueue() {
  const items = [];
  const add = (rows, f) => rows.forEach((r) => items.push({ ...f(r), age: days(r.since) }));
  add((await q(`SELECT a.id, a.state, a.updated_at AS since, p.company_name FROM partner_applications a JOIN platforms p ON p.id = a.platform_id WHERE a.state IN ('completeness_check','technical_review','awaiting_decision','accepted_pending_activation')`)).rows,
    (r) => ({ kind: 'Application', what: r.state.replace(/_/g, ' '), who: r.company_name, owner: { completeness_check: 'application_assessor', technical_review: 'application_assessor', awaiting_decision: 'authorization_decision_maker', accepted_pending_activation: 'activation_officer' }[r.state], url: `/admin/applications/${r.id}` }));
  add((await q(`SELECT t.id, t.kind, t.title, t.status, t.updated_at AS since, p.company_name FROM partner_title_requests t JOIN platforms p ON p.id = t.platform_id WHERE t.status IN ('submitted','awaiting_decision')`)).rows,
    (r) => ({ kind: r.kind === 'expansion' ? 'Scope expansion' : 'Title', what: `${r.title}: ${r.status.replace(/_/g, ' ')}`, who: r.company_name, owner: r.status === 'submitted' ? 'application_assessor' : 'authorization_decision_maker', url: `/admin/titles/${r.id}` }));
  add((await q(`SELECT a.id, a.trainer_name, a.updated_at AS since, p.company_name FROM partner_trainer_additions a JOIN platforms p ON p.id = a.platform_id WHERE a.status = 'submitted'`)).rows,
    (r) => ({ kind: 'Trainer', what: r.trainer_name, who: r.company_name, owner: 'application_assessor', url: `/admin/trainers/${r.id}` }));
  add((await q(`SELECT r.id, r.status, r.to_level, r.updated_at AS since, p.company_name FROM partner_level_reviews r JOIN platforms p ON p.id = r.platform_id WHERE r.status IN ('open','awaiting_decision')`)).rows,
    (r) => ({ kind: 'Level review', what: `to ${r.to_level}: ${r.status.replace(/_/g, ' ')}`, who: r.company_name, owner: r.status === 'open' ? 'application_assessor' : 'authorization_decision_maker', url: `/admin/levels/${r.id}` }));
  add((await q(`SELECT e.id, e.case_type, e.updated_at AS since, p.company_name FROM policy_exceptions e LEFT JOIN platforms p ON p.id = e.platform_id WHERE e.status = 'prepared'`)).rows,
    (r) => ({ kind: 'Exception', what: r.case_type.replace(/_/g, ' '), who: r.company_name || '', owner: MAIN, url: `/admin/exceptions/${r.id}` }));
  add((await q(`SELECT id, template, to_email, created_at AS since FROM email_outbox WHERE status = 'failed'`)).rows,
    (r) => ({ kind: 'Email failed', what: r.template, who: r.to_email, owner: MAIN, url: '/admin/email' }));
  const { rows: vac } = await q(`SELECT staff_position FROM users WHERE staff_position IS NOT NULL AND vacant`);
  const vacant = new Set(vac.map((v) => v.staff_position));
  const { rows: waitingApplicant } = await q(`SELECT a.id, a.state, a.updated_at AS since, p.company_name FROM partner_applications a JOIN platforms p ON p.id = a.platform_id WHERE a.state IN ('info_requested','corrective_action')`);
  items.forEach((i) => { i.ownerTitle = POSITION_TITLE[i.owner]; i.vacant = vacant.has(i.owner); });
  items.sort((a, b) => b.age - a.age);
  return { items, vacant: [...vacant].filter((p) => items.some((i) => i.owner === p)).map((p) => POSITION_TITLE[p]),
    waitingApplicant: waitingApplicant.map((r) => ({ who: r.company_name, what: r.state.replace(/_/g, ' '), age: days(r.since), url: `/admin/applications/${r.id}` })) };
}

async function report() {
  const one = async (sql, p = []) => (await q(sql, p)).rows[0];
  const apps = (await q(`SELECT state, count(*)::int AS n FROM partner_applications GROUP BY state ORDER BY n DESC`)).rows;
  const sub = await one(`SELECT count(DISTINCT application_id)::int AS submitted, count(DISTINCT application_id) FILTER (WHERE to_state IN ('info_requested','corrective_action'))::int AS returned FROM partner_application_events WHERE to_state IN ('completeness_check','info_requested','corrective_action')`);
  const titles = await one(`SELECT count(*) FILTER (WHERE status NOT IN ('draft','withdrawn'))::int AS total, count(*) FILTER (WHERE status = 'authorized')::int AS authorized, count(*) FILTER (WHERE status IN ('needs_changes','needs_wider_review','needs_scope_expansion'))::int AS returned, count(*) FILTER (WHERE status = 'refused')::int AS refused FROM partner_title_requests`);
  const exc = (await q(`SELECT case_type, count(*)::int AS n FROM policy_exceptions GROUP BY case_type ORDER BY n DESC`)).rows;
  const emails = (await q(`SELECT status, count(*)::int AS n FROM email_outbox GROUP BY status`)).rows;
  const levels = (await q(`SELECT level, count(*)::int AS n FROM platforms WHERE accreditation_status = 'active' GROUP BY level ORDER BY level`)).rows;
  const rev = (await q(`SELECT p.company_name, sum(i.amount_paid_cents)::bigint AS cents FROM invoices i JOIN platforms p ON p.id = i.platform_id WHERE i.status IN ('open','paid') AND i.created_at > now() - interval '12 months' GROUP BY p.company_name ORDER BY cents DESC`)).rows;
  const total = rev.reduce((s, r) => s + Number(r.cents), 0);
  const top = (n) => (total ? Math.round((rev.slice(0, n).reduce((s, r) => s + Number(r.cents), 0) / total) * 100) : 0);
  const queue = await workQueue();
  const over = (min) => queue.items.filter((i) => i.age >= min).length;
  return { apps, sub, titles, exc, emails, levels, revenue: { total, top1: top(1), top2: top(2), providers: rev.length }, queue: { total: queue.items.length, over5: over(5), over10: over(10), over30: over(30), vacant: queue.vacant } };
}
module.exports = { workQueue, report, POSITION_TITLE, MAIN };
