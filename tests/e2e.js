// End-to-end test: run with the server up (npm start) and the DB seeded (npm run seed).
// Usage: node tests/e2e.js [baseUrl] [screenshotDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const BASE = process.argv[2] || 'http://localhost:3000';
const SHOTS = process.argv[3] || null;
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ✓', msg); };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };
const see = (p, sel) => p.locator(sel).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
// Waits for a navigation to land: page.url() read right after a click can still be the previous page.
const at = (p, re) => p.waitForURL(re, { timeout: 20000 }).then(() => true).catch(() => false);
let browserRef = null; // for the failure report
const psql = (sql) => execSync(`psql "${process.env.DATABASE_URL}" -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
const psqlRefused = (sql) => { try { execSync(`psql "${process.env.DATABASE_URL}" -tAc "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' }); return false; } catch { return true; } };

(async () => {
  require('dotenv').config({ quiet: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  browserRef = browser;
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const stamp = Date.now();

  console.log('Public site');
  await page.goto(BASE + '/');
  ok((await page.title()).includes('LIV | Leadership Institute of Validation'), 'homepage renders');
  await shot(page, '01-home');
  await page.fill('input[name=id]', 'not-an-id');
  await page.click('.hero-search button');
  ok(await see(page, 'text=valid Credential ID'), 'invalid ID format rejected');

  {
  console.log('Institutional repositioning');
  const repo = await browser.newContext(); const pr = repo.request;
  const homeHtml = await (await pr.get(BASE + '/')).text();
  ok(homeHtml.includes('Validate competence. Verify credentials.') && homeHtml.includes('U.S.-Based Professional Credentialing &amp; Verification Organization'), 'home shows the brand line and descriptor');
  ok(!/Leading Institute of Verification|Accreditation Organization|Accredited Provider/.test(homeHtml), 'home carries no obsolete identity wording');
  ok(/<link rel="canonical" href="[^"]+\/">/.test(homeHtml) && homeHtml.includes('og:url'), 'canonical and Open Graph URLs come from the configured base URL');
  const legacy = await pr.get(BASE + '/accreditation', { maxRedirects: 0 });
  ok(legacy.status() === 301 && legacy.headers().location === '/partners', 'legacy /accreditation redirects permanently to /partners');
  const partnersHtml = await (await pr.get(BASE + '/partners')).text();
  ok(partnersHtml.includes('Authorized Training Provider') && partnersHtml.includes('Demo Safety Training Co.'), 'partner program page lists authorized partners');
  const pSlug = (partnersHtml.match(/href="\/partners\/([a-z0-9-]+)"/) || [])[1];
  ok(pSlug && (await pr.get(`${BASE}/partners/${pSlug}`)).status() === 200, 'each authorized partner has a public register page');
  ok((await pr.get(BASE + '/partners/no-such-partner-000000')).status() === 404, 'unknown partner page is 404');
  const credHtml = await (await pr.get(BASE + '/credentials')).text();
  ok(credHtml.includes('Training Completion Credential') && credHtml.includes('Professional Qualification') && credHtml.includes('HSE Governance'), 'credentials page explains record types and the HSE Governance family');
  const hse = await (await pr.get(BASE + '/credentials/hse-governance')).text();
  ok(hse.includes('From HSE operations to HSE governance.') && hse.includes('IN DEVELOPMENT') && !/passing score of|questions in/i.test(hse), 'HSE Governance page is marked as in development');
  for (const sec of ['/research', '/guides', '/standards']) ok((await pr.get(BASE + sec)).status() === 200, `${sec} section renders`);
  const sm = await (await pr.get(BASE + '/sitemap.xml')).text();
  ok(sm.includes('/credentials/hse-governance') && sm.includes(`/partners/${pSlug}`) && !sm.includes('/accreditation<'), 'sitemap lists the new public URLs');
  await repo.close();
  }

  console.log('Provider login + CSV issuance');
  // Issuance needs an authorized scope covering each course (Batch B); LIV records the demo partner's scopes here.
  for (const t of ['Confined Space Entry', 'Working at Heights', 'Hazard Communication', 'Occupational Safety', 'First Aid', 'Safety', 'Hold test', 'Forklift Safety']) {
    psql(`INSERT INTO partner_scopes (platform_id, title, granted_on, decision_note) SELECT id, '${t}', '2026-01-01', 'E2E' FROM platforms WHERE company_name LIKE 'Demo Safety%' AND NOT EXISTS (SELECT 1 FROM partner_scopes s WHERE s.platform_id = platforms.id AND s.title = '${t}')`);
  }
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', 'demo@trainingco.example');
  await page.fill('input[name=password]', 'ChangeMe-Demo-2026');
  await page.click('button:has-text("Log in")');
  ok(await at(page, /\/portal$/), 'demo admin logged in');
  await shot(page, '02-dashboard');

  const csv = path.join(os.tmpdir(), `batch-${stamp}.csv`);
  fs.writeFileSync(csv, [
    'First Name,Surname,E-mail,Course,Date Completed',
    `Omar,Haddad,omar.${stamp}@example.com,Confined Space Entry,2026-09-10`,
    `Lina,Saleh,lina.${stamp}@example.com,Confined Space Entry,09/12/2026`,
    `Bad,Email,not-an-email,Confined Space Entry,2026-09-10`,
    `Future,Date,future.${stamp}@example.com,Confined Space Entry,2099-01-01`,
    `Omar,Haddad,omar.${stamp}@example.com,Confined Space Entry,2026-09-10`,
    `=cmd,Inject,inject.${stamp}@example.com,Working at Heights,2026-09-01`,
  ].join('\n'));
  await page.goto(BASE + '/portal/issue');
  await page.setInputFiles('input[name=csv]', csv);
  await page.click('button:has-text("Upload")');
  ok(await at(page, /\/issue\/map$/), 'CSV uploaded, mapping step');
  ok(await page.$eval('select[name=last_name]', (s) => s.value) === 'Surname', 'auto-mapped Surname → last_name');
  await shot(page, '03-map');
  await page.click('button:has-text("Validate rows")');
  ok(await see(page, 'text=invalid email'), 'invalid email flagged');
  ok(await see(page, 'text=in the future'), 'future date flagged');
  ok(await see(page, 'text=duplicate of line'), 'in-file duplicate flagged');
  await shot(page, '04-review');
  await page.click('button:has-text("Issue 3 certificate")');
  ok(await see(page, 'text=Some rows have errors'), 'issuance blocked until skip is ticked');
  await page.check('input[name=skip_invalid]');
  await page.click('button:has-text("Issue 3 certificate")');
  // The confirmation comes from the session after a redirect: it must survive a browser that follows the redirect at once.
  ok(await at(page, /\/portal\/batches\//) && await see(page, 'text=3 certificate(s) issued, 3 row(s) skipped'), 'issued 3, skipped 3');
  await shot(page, '05-batch');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download results CSV')]);
  const resultsCsv = fs.readFileSync(await dl.path(), 'utf8');
  ok(resultsCsv.split('\n').filter(Boolean).length === 4, 'results CSV has 3 rows + header');
  ok(resultsCsv.includes("'=cmd"), 'CSV formula injection neutralised');
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('text=Download all PDFs')]);
  ok(fs.statSync(await zip.path()).size > 3000, 'PDF ZIP downloaded');

  // Re-upload same file → already issued
  await page.goto(BASE + '/portal/issue');
  await page.setInputFiles('input[name=csv]', csv);
  await page.click('button:has-text("Upload")');
  await page.click('button:has-text("Validate rows")');
  ok(await see(page, 'text=already issued'), 'cross-batch duplicate detected');
  await page.click('button:has-text("Cancel and start over")');

  const certNum = resultsCsv.split('\n')[1].split(',')[0];
  const verifyUrl = resultsCsv.split('\n')[1].split(',').pop();

  console.log('Public verification');
  const pub = await browser.newPage();
  await pub.goto(verifyUrl);
  ok(await see(pub, '.sb-valid'), `${certNum} shows VALID via QR link`);
  { const vt = await pub.textContent('body');
    ok(vt.includes('Training provider') && vt.includes('Record integrity') && vt.includes('Status when issued') && vt.includes('Demo Safety Training Co.') && vt.includes('LIV Authorized Training Provider'), 'verification record shows the education provider and its LIV authorization');
    ok(vt.includes('Training Completion Credential'), 'verification record states the record type'); }
  ok(!(await pub.content()).includes(`@example.com`), 'trainee email not exposed publicly');
  await shot(pub, '06-verify-valid');
  const [pdf] = await Promise.all([pub.waitForEvent('download'), pub.click('text=Download original PDF')]);
  ok(fs.readFileSync(await pdf.path()).slice(0, 4).toString() === '%PDF', 'original PDF downloads');
  ok((await pub.getAttribute('a:has-text("LinkedIn")', 'href')).startsWith('https://www.linkedin.com/profile/add?'), 'LinkedIn add-to-profile link');
  await pub.goto(`${BASE}/verify/${certNum}?t=0000000000000000`);
  ok(await see(pub, '.sb-tampered'), 'forged QR token → INVALID');
  await pub.goto(`${BASE}/verify?id=${certNum}&last_name=Wrong`);
  ok(await see(pub, '.sb-not_found'), 'wrong last name → NOT FOUND');
  await pub.goto(`${BASE}/verify?id=${certNum.toLowerCase()}&last_name=haddad`);
  ok(await see(pub, '.sb-valid'), 'ID + last name (case-insensitive) → VALID');
  const pdfNoToken = await pub.request.get(`${BASE}/verify/${certNum}/pdf`);
  ok(pdfNoToken.status() === 404, 'PDF requires QR token');

  // Tamper with DB record → integrity failure
  psql(`UPDATE certificates SET course_name = 'Advanced Course' WHERE cert_number = '${certNum}'`);
  await pub.goto(`${BASE}/verify/${certNum}`);
  ok(await see(pub, '.sb-tampered'), 'DB tampering detected by HMAC');
  await shot(pub, '07-verify-tampered');
  psql(`UPDATE certificates SET course_name = 'Confined Space Entry' WHERE cert_number = '${certNum}'`);

  console.log('Revocation');
  await page.goto(`${BASE}/portal/certificates/${certNum}`);
  await page.fill('textarea[name=reason]', 'Issued in error during test');
  await page.click('button:has-text("Revoke certificate")');
  ok(await see(page, 'text=revoked.'), 'revoked from portal');
  await pub.goto(`${BASE}/verify/${certNum}`);
  ok(await see(pub, '.sb-revoked'), 'verify page shows REVOKED');
  await shot(pub, '08-verify-revoked');
  await page.goto(`${BASE}/portal/certificates?status=revoked`);
  ok(await see(page, `text=${certNum}`), 'records filter: revoked');
  await shot(page, '09-records');

  console.log('Templates + settings + API key');
  await page.goto(`${BASE}/portal/templates`);
  await shot(page, '10-templates');
  await page.goto(`${BASE}/portal/settings`);
  await page.fill('input[name=label]', 'E2E key');
  await page.click('button:has-text("Generate key")');
  const apiKey = (await page.textContent('.keybox')).trim();
  ok(/^liv_[0-9a-f]{8}_/.test(apiKey), 'API key generated and shown once');
  await shot(page, '11-settings');
  await page.reload();
  ok(!(await page.isVisible('.keybox')), 'API key not shown again');

  console.log('REST API');
  const api = (method, url, data, headers = {}) => ctx.request.fetch(BASE + url, { method, data, headers: { 'X-API-Key': apiKey, ...headers } });
  ok((await ctx.request.get(BASE + '/api/v1/certificates')).status() === 401, 'API rejects missing key');
  const body = { certificates: [{ first_name: 'Api', last_name: 'User', email: `api.${stamp}@example.com`, course_name: 'Hazard Communication', completion_date: '2026-10-01' }] };
  const r1 = await api('POST', '/api/v1/certificates', body, { 'Idempotency-Key': `e2e-${stamp}` });
  ok(r1.status() === 201, 'API issues certificate (201)');
  const j1 = await r1.json();
  const r2 = await api('POST', '/api/v1/certificates', body, { 'Idempotency-Key': `e2e-${stamp}` });
  const j2 = await r2.json();
  ok(r2.status() === 200 && j2.idempotent_replay && j2.certificates[0].cert_number === j1.certificates[0].cert_number, 'idempotent replay returns same certificate');
  const r3 = await api('POST', '/api/v1/certificates', { first_name: 'X', email: 'bad' });
  ok(r3.status() === 422, 'API validation → 422, nothing issued');
  const r4 = await ctx.request.get(`${BASE}/api/v1/verify/${j1.certificates[0].cert_number}`);
  const j4 = await r4.json();
  ok(j4.result === 'valid' && !JSON.stringify(j4).includes('@'), 'public verify API valid, no email leaked');
  const r5 = await api('POST', `/api/v1/certificates/${j1.certificates[0].cert_number}/revoke`, { reason: 'API revoke test' });
  ok(r5.status() === 200 && (await r5.json()).status === 'revoked', 'API revoke');

  console.log('Accreditation application + super admin');
  const appCtx = await browser.newContext();
  const ap = await appCtx.newPage();
  await ap.goto(BASE + '/apply');
  await ap.fill('input[name=company_name]', `Gulf Safety Academy ${stamp}`);
  await ap.fill('input[name=full_name]', 'Applicant Admin');
  await ap.fill('input[name=email]', `applicant.${stamp}@example.com`);
  await ap.fill('input[name=password]', 'Applicant-Pass-2026');
  await ap.check('input[name=agree]');
  await ap.click('button:has-text("Submit application")');
  ok(await at(ap, /\/portal$/) && await see(ap, 'text=Authorization status'), 'applicant lands in portal with pending banner');
  await ap.goto(BASE + '/portal/issue/review');
  await ap.goto(BASE + '/portal/issue');
  ok(await see(ap, 'text=pending'), 'pending platform sees status');
  const forbidden = await ap.request.get(BASE + '/admin');
  ok(forbidden.status() === 403, 'platform admin cannot reach /admin');

  const adm = await (await browser.newContext()).newPage();
  adm.on('dialog', (d) => d.accept());
  await adm.goto(BASE + '/login');
  await adm.fill('input[name=email]', 'admin@liv.local');
  await adm.fill('input[name=password]', 'ChangeMe-Admin-2026');
  await adm.click('button:has-text("Log in")');
  ok(await at(adm, /\/admin$/), 'super admin logged in');
  await shot(adm, '12-admin');
  await adm.goto(BASE + '/admin/platforms?status=pending');
  await shot(adm, '13-admin-platforms');
  const row = adm.locator('tr', { hasText: `Gulf Safety Academy ${stamp}` });
  await row.locator('button:has-text("Approve")').click();
  ok(await see(adm, `text=Gulf Safety Academy ${stamp} is now active`), 'super admin approved platform');
  await ap.goto(BASE + '/portal');
  ok(!(await ap.isVisible('text=Authorization status')), 'applicant now active');

  console.log('Import: templates, English-only, ID privacy, Excel, link validation');
  const tpl = await page.request.get(BASE + '/portal/issue/template.csv');
  const tplText = await tpl.text();
  ok(tpl.status() === 200 && tplText.includes('serial_no,full_name,national_id,email'), 'CSV template downloads with the expected columns');
  const tplX = await page.request.get(BASE + '/portal/issue/template.xlsx');
  ok(tplX.status() === 200 && (await tplX.body()).subarray(0, 2).toString() === 'PK', 'Excel template downloads');
  const nonLatin = String.fromCharCode(0x633, 0x627, 0x631, 0x629, 0x20, 0x627, 0x644, 0x623, 0x62d, 0x645, 0x62f); // a name in another script (code points, no literal text)
  const csv2 = path.join(os.tmpdir(), `import-${stamp}.csv`);
  fs.writeFileSync(csv2, [
    'Serial No,Trainee Name,ID Number,E-mail,Course,Date Completed',
    `7,Sarah Khaled Alahmad,1098765432,sara.${stamp}@example.com,Occupational Safety,2026-09-20`,
    `8,Mark Lee,AB-12345,mark.${stamp}@example.com,First Aid,09/21/2026`,
    `9,${nonLatin},5555555555,x.${stamp}@example.com,Safety,2026-09-20`,
  ].join('\n'));
  await page.goto(BASE + '/portal/issue');
  await page.setInputFiles('input[name=csv]', csv2);
  await page.click('button:has-text("Upload")');
  ok(await page.$eval('select[name=full_name]', (e) => e.value) === 'Trainee Name', '"Trainee Name" auto-mapped to full name');
  ok(await page.$eval('select[name=national_id]', (e) => e.value) === 'ID Number', '"ID Number" auto-mapped');
  await page.click('button:has-text("Validate rows")');
  ok(await see(page, 'text=•••• 5432'), 'review shows the ID masked');
  ok(await see(page, 'text=must use English (Latin) letters only'), 'row in another script is flagged (English only)');
  ok(!(await page.content()).includes('1098765432'), 'full ID number is not shown on the review page');
  await page.check('input[name=skip_invalid]');
  await page.click('button:has-text("Issue 2 certificate")');
  ok(await see(page, 'text=2 certificate(s) issued, 1 row(s) skipped'), 'valid rows issued, non-English row skipped');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('text=Download results CSV')]);
  const res2 = fs.readFileSync(await dl2.path(), 'utf8');
  ok(res2.includes('id_last4') && res2.includes('5432') && !res2.includes('1098765432'), 'results CSV carries the last 4 digits only');
  ok(psql(`select holder_ref || '|' || id_last4 || '|' || length(id_hash) from certificates where recipient_email='sara.${stamp}@example.com'`) === '7|5432|64', 'serial kept; ID stored only as hash + last 4');

  // Excel upload (temporarily enabled)
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Trainees');
  ws.addRow(['Serial No', 'First Name', 'Last Name', 'ID Number', 'E-mail', 'Course', 'Date Completed']);
  ws.addRow([11, 'Noah', 'Bennett', 2233445566, `noah.${stamp}@example.com`, 'Forklift Safety', new Date(Date.UTC(2026, 8, 22))]);
  const xlsxPath = path.join(os.tmpdir(), `import-${stamp}.xlsx`);
  await wb.xlsx.writeFile(xlsxPath);
  await page.goto(BASE + '/portal/issue');
  await page.setInputFiles('input[name=csv]', xlsxPath);
  await page.click('button:has-text("Upload")');
  ok(await page.$eval('select[name=last_name]', (e) => e.value) === 'Last Name', 'Excel file read and columns auto-mapped');
  await page.click('button:has-text("Validate rows")');
  ok(await see(page, 'text=•••• 5566'), 'Excel numeric ID read as text and masked');
  await page.click('button:has-text("Issue 1 certificate")');
  ok(await see(page, 'text=1 certificate(s) issued'), 'certificate issued from an Excel file');
  ok(psql(`select holder_ref || '|' || id_last4 || '|' || completion_date from certificates where recipient_email='noah.${stamp}@example.com'`) === '11|5566|2026-09-22', 'Excel date and numbers stored correctly');
  const xlsPath = path.join(os.tmpdir(), `old-${stamp}.xls`);
  fs.writeFileSync(xlsPath, 'x');
  await page.goto(BASE + '/portal/issue');
  await page.setInputFiles('input[name=csv]', xlsPath);
  await page.click('button:has-text("Upload")');
  ok(await see(page, 'text=Old .xls files are not supported'), 'old .xls is rejected with a clear message');

  await page.goto(BASE + '/portal/issue');
  await page.fill('input[name=source_url]', 'https://evil.example.com/list.csv');
  await page.click('button:has-text("Upload")');
  ok(await see(page, 'text=Only Google Drive and Google Sheets links are supported'), 'non-Google link is rejected');
  await page.goto(BASE + '/portal/issue');
  await page.click('button:has-text("Upload")');
  ok(await see(page, 'text=Choose a file, or paste a Google Drive'), 'empty submission asks for a file or link');

  console.log('Partner gateway slice');
  const totpLib = require('../src/lib/totp');
  const partnerEmail = `applicant.${stamp}@example.com`;
  const partnerId = psql(`SELECT platform_id FROM users WHERE email = '${partnerEmail}'`);
  await adm.goto(BASE + '/admin/agreements');
  await adm.click('button:has-text("New version")');
  ok(await see(adm, 'text=still contains [PLACEHOLDER] markers'), 'agreement starter outline carries placeholders');
  await adm.click('button:has-text("Make this version active")');
  ok(await see(adm, 'text=Replace every [PLACEHOLDER]'), 'agreement with placeholders cannot be activated');
  await adm.fill('textarea[name=body_md]', '# Accredited Partner Agreement\n\nThe partner agrees to the accreditation criteria published by LIV.');
  await adm.click('button:has-text("Save draft")');
  await adm.click('button:has-text("Make this version active")');
  ok(await see(adm, 'text=is active. Every partner must accept it'), 'final agreement activated');
  const agrUrl = adm.url();
  await ap.goto(BASE + '/portal');
  ok(ap.url().endsWith('/portal/agreement') && await see(ap, 'text=Accredited Partner Agreement'), 'partner is asked to accept the active agreement');
  await ap.fill('input[name=accepted_name]', 'Applicant Admin');
  await ap.click('button:has-text("Accept agreement")');
  ok(await see(ap, 'text=Tick the box and type your full name'), 'acceptance needs the box ticked');
  await ap.check('input[name=agree]'); await ap.fill('input[name=accepted_name]', 'Applicant Admin');
  await ap.click('button:has-text("Accept agreement")');
  ok(await see(ap, 'text=accepted. Thank you') && ap.url().endsWith('/portal'), 'partner accepts the agreement and continues');
  await adm.goto(agrUrl);
  ok(await see(adm, 'td:has-text("Applicant Admin")'), 'acceptance is recorded with the typed name');
  await adm.goto(`${BASE}/admin/platforms/${partnerId}`);
  await adm.click('button:has-text("Act as partner")');
  ok(await see(adm, 'text=Issuance') && !adm.url().includes('/agreement'), 'LIV staff acting for a partner are not blocked by the agreement gate');
  await adm.goto(BASE + '/admin');

  await ap.goto(BASE + '/portal/settings#billing');
  await ap.fill('input[name=billing_name]', 'Gulf Safety Academy LLC'); await ap.fill('input[name=billing_email]', 'billing@example.com'); await ap.fill('input[name=tax_id]', 'TRN 100200300');
  await ap.click('button:has-text("Save billing details")');
  ok(await see(ap, 'text=Billing details saved'), 'partner saves billing details');
  await adm.goto(`${BASE}/admin/platforms/${partnerId}`);
  ok(await see(adm, 'dd:has-text("TRN 100200300")') && await see(adm, 'dd:has-text("accepted by Applicant Admin")'), 'admin sees billing and agreement status');

  await ap.goto(BASE + '/account/security');
  const secret = (await ap.locator('code').first().textContent()).trim();
  await ap.fill('input[name=code]', '000000'); await ap.click('button:has-text("Turn on two-factor sign-in")');
  ok(await see(ap, 'text=That code is not valid'), 'a wrong authenticator code is refused');
  await ap.fill('input[name=code]', totpLib.code(secret, totpLib.stepAt()));
  await ap.click('button:has-text("Turn on two-factor sign-in")');
  ok(await see(ap, 'text=Save these recovery codes now'), 'two-factor sign-in enabled and recovery codes shown once');
  const recovery = (await ap.locator('.keybox').first().textContent()).trim().split(/\s+/);
  ok(recovery.length === 10, 'ten recovery codes issued');

  const login2 = async (pw) => { const c = await browser.newContext(); const pg = await c.newPage(); await pg.goto(BASE + '/login'); await pg.fill('input[name=email]', partnerEmail); await pg.fill('input[name=password]', pw); await pg.click('button:has-text("Log in")'); return pg; };
  let pg = await login2('Applicant-Pass-2026');
  ok(await at(pg, /\/login\/2fa$/) && await see(pg, 'text=Two-factor sign-in'), 'password alone no longer signs in: a code is required');
  await pg.goto(BASE + '/portal');
  ok(pg.url().includes('/login'), 'the portal stays closed until the code is entered');
  pg = await login2('Applicant-Pass-2026');
  await pg.fill('input[name=code]', '111111'); await pg.click('button:has-text("Verify")');
  ok(await see(pg, 'text=That code is not valid'), 'wrong second-factor code is refused');
  await pg.fill('input[name=code]', totpLib.code(secret, totpLib.stepAt() + 1)); await pg.click('button:has-text("Verify")');
  ok(await see(pg, 'h1:has-text("Dashboard")') && pg.url().endsWith('/portal'), 'valid code completes sign-in');
  pg = await login2('Applicant-Pass-2026');
  await pg.fill('input[name=code]', recovery[0]); await pg.click('button:has-text("Verify")');
  ok(await see(pg, 'h1:has-text("Dashboard")'), 'a recovery code signs in');
  pg = await login2('Applicant-Pass-2026');
  await pg.fill('input[name=code]', recovery[0]); await pg.click('button:has-text("Verify")');
  ok(await see(pg, 'text=That code is not valid'), 'a recovery code works only once');

  await adm.goto(`${BASE}/admin/platforms/${partnerId}`);
  await adm.click('button:has-text("Reset password")');
  ok(await see(adm, 'text=Temporary password'), 'admin resets a partner password and sees the temporary one once');
  const temp = (await adm.locator('.keybox').first().textContent()).split(': ')[1].trim();
  await adm.click('button:has-text("Reset 2FA")');
  ok(await see(adm, 'text=Two-factor sign-in reset'), 'admin resets a partner two-factor sign-in');
  pg = await login2(temp);
  ok(await see(pg, 'text=You must set a new password'), 'a temporary password forces a change before anything else');
  await pg.goto(BASE + '/portal');
  ok(pg.url().includes('/account/security'), 'the portal is closed until the password is changed');
  await pg.fill('input[name=current_password]', temp); await pg.fill('input[name=new_password]', 'Brand-New-Pass-2026'); await pg.fill('input[name=confirm_password]', 'Brand-New-Pass-2026');
  await pg.click('button:has-text("Change password")');
  ok(await see(pg, 'text=Password changed') && pg.url().endsWith('/portal'), 'partner sets a new password and continues');
  // The remaining checks use other partners that never accepted this test agreement; retire it so they are not held at the gate.
  psql("UPDATE agreements SET status = 'retired' WHERE status = 'active'");

  console.log('Billing');
  const stripeLib = require('../src/lib/stripe');
  const pb = await (await browser.newContext()).newPage();
  await pb.goto(BASE + '/login'); await pb.fill('input[name=email]', partnerEmail); await pb.fill('input[name=password]', 'Brand-New-Pass-2026'); await pb.click('button:has-text("Log in")');
  const anonReq = (await browser.newContext()).request;
  const money = (c) => `$${(c / 100).toFixed(2)}`;
  await adm.goto(BASE + '/admin/billing/catalog');
  ok(await see(adm, 'text=Annual partner authorization fee') && await see(adm, 'text=Certificate issuance beyond the included allowance'), 'price catalog is seeded with the fee schedule');
  const adminChangeId = psql("SELECT pr.id FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE p.code = 'ACC_ADMIN_CHANGE'");
  await adm.fill(`form[action$="/catalog/prices/${adminChangeId}"] input[name=amount]`, '175.00');
  await adm.click(`form[action$="/catalog/prices/${adminChangeId}"] button`);
  ok(await see(adm, 'text=Price updated'), 'a price change is saved');
  ok(psql("SELECT count(*) FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE p.code = 'ACC_ADMIN_CHANGE'") === '2' && psql("SELECT count(*) FROM billing_prices pr JOIN billing_products p ON p.id = pr.product_id WHERE p.code = 'ACC_ADMIN_CHANGE' AND pr.valid_to IS NOT NULL") === '1', 'price history is kept (old price closed, new price added)');

  await adm.goto(`${BASE}/admin/billing/partners/${partnerId}`);
  await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Nothing to invoice'), 'an empty invoice is refused');
  await adm.selectOption('select[name=code] >> nth=0', 'ACC_APPLICATION');
  await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Assign the partner a plan first'), 'plan-based fees need a plan');
  await adm.selectOption('select[name=plan]', 'starter');
  await adm.fill('input[name=plan_renews_on]', '2027-06-30'); await adm.fill('input[name=tax_rate]', '5'); await adm.fill('input[name=tax_label]', 'VAT');
  await adm.click('button:has-text("Save"):below(:text("Plan and tax"))');
  ok(await see(adm, 'text=Plan and tax settings saved'), 'plan, renewal date and tax rate saved');
  await adm.selectOption('select[name=category]', 'founding_partner'); await adm.fill('input[name=value]', '50'); await adm.selectOption('select[name=product_code]', 'ACC_APPLICATION');
  await adm.click('button:has-text("Add discount")');
  ok(await see(adm, 'text=Record the reason'), 'a discount needs a recorded reason');
  await adm.fill('input[name=note]', 'Founding partner 2026');
  await adm.selectOption('select[name=category]', 'founding_partner'); await adm.fill('input[name=value]', '50'); await adm.selectOption('select[name=product_code]', 'ACC_APPLICATION');
  await adm.click('button:has-text("Add discount")');
  ok(await see(adm, 'text=Discount recorded'), 'founding-partner discount recorded');
  await adm.selectOption('select[name=code] >> nth=0', 'ACC_APPLICATION');
  await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Draft created'), 'draft invoice created');
  ok(await see(adm, `td:has-text("${money(262.5 * 100)}")`) || await see(adm, `dd:has-text("${money(262.5 * 100)}")`), 'total = $500 application - 50% discount + 5% tax = $262.50');
  const invUrl = adm.url(); const invId = invUrl.split('/').pop();
  await adm.click('button:has-text("Issue invoice")');
  ok(await see(adm, 'text=/Invoice INV-\\d{4}-\\d{4} issued/'), 'invoice issued with a sequential number');
  const invNo = psql(`SELECT number FROM invoices WHERE id = '${invId}'`);
  ok(/^INV-\d{4}-\d{4}$/.test(invNo), 'invoice number format');
  const pdfA = await adm.request.get(`${invUrl}/pdf`);
  ok(pdfA.status() === 200 && Buffer.from(await pdfA.body()).slice(0, 4).toString() === '%PDF', 'invoice PDF renders');

  await pb.goto(BASE + '/portal/billing');
  ok(await see(pb, `text=${invNo}`) && await see(pb, `text=${money(26250)}`), 'partner sees the invoice and the balance owed');
  const pdfP = await pb.request.get(`${BASE}/portal/billing/invoices/${invId}/pdf`);
  ok(pdfP.status() === 200 && Buffer.from(await pdfP.body()).slice(0, 4).toString() === '%PDF', 'partner downloads the invoice PDF');
  { // card payment button depends on STRIPE_SECRET_KEY; the pay route must be safe either way
    const page = await pb.request.get(`${BASE}/portal/billing/invoices/${invId}`); const html = await page.text();
    const csrfM = html.match(/name="_csrf" value="([^"]+)"/);
    if (!process.env.STRIPE_SECRET_KEY) {
      ok(!/by card/.test(html), 'no card button while Stripe is not configured');
      if (csrfM) { const r = await pb.request.post(`${BASE}/portal/billing/invoices/${invId}/pay`, { form: { _csrf: csrfM[1] }, maxRedirects: 0 }); ok([302, 303].includes(r.status()), 'pay route redirects back with a message when Stripe is off'); }
    }
  }

  await adm.goto(invUrl);
  await adm.fill('input[name=amount]', '999.00'); await adm.click('button:has-text("Record payment")');
  ok(await see(adm, 'text=exceeds the balance'), 'an overpayment is refused');
  await adm.fill('input[name=amount]', '100.00'); await adm.fill('input[name=reference]', 'Wire 1');
  await adm.click('button:has-text("Record payment")');
  ok(await see(adm, 'text=Partial payment recorded'), 'partial payment recorded; invoice stays open');
  await adm.fill('input[name=amount]', '162.50'); await adm.fill('input[name=reference]', 'Wire 2');
  await adm.click('button:has-text("Record payment")');
  ok(await see(adm, 'text=The invoice is paid') && psql(`SELECT status FROM invoices WHERE id = '${invId}'`) === 'paid', 'final payment marks the invoice paid');
  ok(psql(`SELECT amount_paid_cents FROM invoices WHERE id = '${invId}'`) === '26250', 'paid amount equals the total');

  // Certificate usage: incremental, never twice, void releases it.
  const demoId = psql("SELECT id FROM platforms WHERE company_name LIKE 'Demo Safety%' LIMIT 1");
  const issued = Number(psql(`SELECT count(*) FROM certificates WHERE platform_id = '${demoId}'`));
  ok(issued > 0, 'the demo provider has certificates to bill');
  await adm.goto(`${BASE}/admin/billing/partners/${demoId}`);
  await adm.selectOption('select[name=plan]', 'starter'); await adm.fill('input[name=included_certificates]', '0'); await adm.fill('input[name=tax_rate]', '0');
  await adm.click('button:has-text("Save"):below(:text("Plan and tax"))');
  ok(await see(adm, 'text=Plan and tax settings saved'), 'demo provider placed on a plan with no allowance');
  ok(await see(adm, `dd:has-text("${money(issued * 400)}")`), 'unbilled usage preview = certificates x $4.00');
  await adm.check('input[name=include_usage]'); await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Draft created') && await see(adm, `td:has-text("${money(issued * 400)}")`), 'usage invoice covers every certificate beyond the allowance');
  const uId = adm.url().split('/').pop();
  await adm.click('button:has-text("Issue invoice")'); await see(adm, 'text=issued');
  await adm.goto(`${BASE}/admin/billing/partners/${demoId}`);
  await adm.check('input[name=include_usage]'); await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Nothing to invoice'), 'the same certificates are not billed twice');
  await adm.goto(`${BASE}/admin/billing/invoices/${uId}`);
  await adm.click('button:has-text("Void invoice")');
  ok(await see(adm, 'text=Invoice voided'), 'an unpaid invoice can be voided (number stays on record)');
  await adm.goto(`${BASE}/admin/billing/partners/${demoId}`);
  await adm.check('input[name=include_usage]'); await adm.click('button:has-text("Create draft")');
  ok(await see(adm, 'text=Draft created'), 'usage of a voided invoice becomes billable again');
  const draftId = adm.url().split('/').pop();
  ok((await pb.request.get(`${BASE}/portal/billing/invoices/${draftId}`)).status() === 404, 'a partner cannot open a draft or another partner\'s invoice');

  // Service hold: issuance paused, accreditation unchanged.
  await adm.goto(`${BASE}/admin/billing/partners/${demoId}`);
  await adm.click('button:has-text("Put on service hold")');
  ok(await see(adm, 'text=Service hold on'), 'service hold switched on');
  const held = await api('POST', '/api/v1/certificates', { first_name: 'Hold', last_name: 'Test', email: `hold.${stamp}@example.com`, course_name: 'Hold test', completion_date: '2026-09-01' });
  ok(held.status() === 403 && (await held.text()).includes('service hold'), 'the API refuses issuance during a service hold');
  ok(psql(`SELECT accreditation_status FROM platforms WHERE id = '${demoId}'`) === 'active', 'accreditation status is unchanged by the hold');
  await adm.click('button:has-text("Lift service hold")'); await see(adm, 'text=Service hold lifted');

  // Stripe readiness: webhook receiver (answers 501 until a secret is set), exports, public fee page.
  const hook = process.env.STRIPE_WEBHOOK_SECRET;
  const post = (body, hdr) => anonReq.post(BASE + '/api/webhooks/stripe', { data: body, headers: { 'content-type': 'application/json', ...(hdr ? { 'stripe-signature': hdr } : {}) } });
  if (!hook) ok((await post('{}')).status() === 501, 'Stripe webhook answers 501 until it is configured');
  else {
    await adm.goto(`${BASE}/admin/billing/partners/${partnerId}`);
    await adm.selectOption('select[name=code] >> nth=0', 'ACC_ADMIN_CHANGE'); await adm.click('button:has-text("Create draft")');
    const sId = adm.url().split('/').pop(); await adm.click('button:has-text("Issue invoice")'); await see(adm, 'text=issued');
    const total = Number(psql(`SELECT total_cents FROM invoices WHERE id = '${sId}'`));
    const ev = JSON.stringify({ id: 'evt_e2e', type: 'payment_intent.succeeded', data: { object: { id: `pi_e2e_${stamp}`, amount_received: total, metadata: { liv_invoice_id: sId } } } });
    ok((await post(ev, 'bad')).status() === 400, 'webhook with a bad signature is refused');
    ok((await post(ev, stripeLib.signHeader(ev, hook, Math.floor(Date.now() / 1000) - 3600))).status() === 400, 'webhook with a stale timestamp is refused');
    ok((await post(ev, stripeLib.signHeader(ev, hook))).status() === 200 && psql(`SELECT status FROM invoices WHERE id = '${sId}'`) === 'paid', 'a signed Stripe event marks the invoice paid');
    ok((await post(ev, stripeLib.signHeader(ev, hook))).status() === 200 && psql(`SELECT count(*) FROM payments WHERE invoice_id = '${sId}'`) === '1', 'a repeated delivery is idempotent (one payment)');
    ok(psql(`SELECT provider FROM payments WHERE invoice_id = '${sId}'`) === 'stripe', 'the payment is recorded as a Stripe payment');
  }
  const invCsv = await adm.request.get(BASE + '/admin/billing/export/invoices.csv');
  ok(invCsv.status() === 200 && /csv/.test(invCsv.headers()['content-type']) && (await invCsv.text()).includes(invNo), 'invoices export as CSV for the accountant');
  const feesPage = await anonReq.get(BASE + '/fees');
  if (process.env.PUBLIC_FEES === 'true') ok(feesPage.status() === 200 && (await feesPage.text()).includes('Annual partner authorization fee'), 'public fee schedule shows the catalog');
  else ok(feesPage.status() === 404, 'public fee schedule stays hidden until approved');

  console.log('Knowledge hub');
  const title = `E2E Article ${stamp}`; const slug = `e2e-article-${stamp}`;
  await adm.goto(BASE + '/admin/content/new');
  await adm.fill('input[name=title]', title);
  await adm.fill('textarea[name=summary]', 'A test summary for the knowledge hub.');
  await adm.fill('textarea[name=body_md]', '## Heading\n\nSafe **bold** text.\n\n<script>window.__xss=1</script>\n\n[bad](javascript:alert(1)) [ok](https://example.com)');
  await adm.selectOption('select[name=category]', 'safety');
  await adm.click('button:has-text("Save draft")');
  ok(await see(adm, 'text=Draft saved'), 'article saved as draft');
  const anon = await browser.newPage();
  ok((await anon.goto(`${BASE}/knowledge/${slug}`)).status() === 404, 'draft article is not public');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=named human subject-matter reviewer'), 'publishing requires a named human reviewer');
  await adm.fill('input[name=reviewed_by]', 'Dr. Jane Reviewer');
  await adm.fill('textarea[name=sources_text]', 'OSHA overview | https://www.osha.gov/ | U.S. Department of Labor');
  await adm.fill('input[name=standards]', 'ISO 45001:2018');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=Saved and published'), 'article published');
  const resp = await anon.goto(`${BASE}/knowledge/${slug}`);
  ok(resp.status() === 200 && await see(anon, 'h2:has-text("Heading")'), 'published article renders Markdown');
  const html = await anon.content();
  ok(!html.includes('__xss') && !html.includes('javascript:alert'), 'script and javascript: links are stripped');
  await anon.goto(`${BASE}/knowledge?category=safety`);
  ok(await see(anon, `text=${title}`), 'article listed under its topic');
  const sm = await anon.request.get(BASE + '/sitemap.xml');
  ok((await sm.text()).includes(`/knowledge/${slug}`), 'sitemap includes the article');
  ok((await (await anon.request.get(BASE + '/rss.xml')).text()).includes(title), 'RSS includes the article');
  await adm.click('button:has-text("Unpublish")');
  ok((await anon.goto(`${BASE}/knowledge/${slug}`)).status() === 404, 'unpublished article is hidden again');
  const later = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
  await adm.fill('input[name=publish_on]', later);
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, `text=goes live on ${later}`), 'an approved item can be scheduled for a later release date');
  ok((await anon.goto(`${BASE}/knowledge/${slug}`)).status() === 404 && !(await (await anon.request.get(BASE + '/rss.xml')).text()).includes(title), 'a scheduled item stays hidden, also from RSS, until its date');
  const editUrl = adm.url();
  await adm.goto(`${BASE}/admin/content`);
  ok(await see(adm, `text=scheduled ${later}`), 'the content list shows the release date');
  await adm.goto(editUrl);
  await adm.fill('input[name=publish_on]', '2020-01-01');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=cannot be in the past'), 'a release date cannot be back-dated');
  await adm.fill('input[name=reviewed_by]', 'Dr. Jane Reviewer');
  await adm.fill('input[name=publish_on]', new Date().toISOString().slice(0, 10));
  await adm.click('button:has-text("Publish")');
  await see(adm, 'text=Saved and published');
  await anon.goto(`${BASE}/knowledge/${slug}`);
  ok(await see(anon, 'text=Reviewed by') && await see(anon, 'a:has-text("OSHA overview")') && await see(anon, 'text=ISO 45001:2018'), 'public page shows reviewer, sources and standards');

  const firstEditUrl = adm.url();
  console.log('Content API (knowledge engines)');
  await adm.goto(BASE + '/admin/service-keys');
  await adm.fill('input[name=label]', 'E2E engine');
  await adm.click('button:has-text("Create service key")');
  const svcKey = (await adm.textContent('.keybox')).trim();
  ok(/^liv_/.test(svcKey), 'service key created and shown once');
  const capi = (path, opt = {}) => anon.request.fetch(BASE + '/api/v1/content' + path, { ...opt, headers: { 'x-api-key': svcKey, ...(opt.headers || {}) } });
  const ext = `eng-${stamp}`;
  const draft = { external_id: ext, title: `Engine Draft ${stamp}`, summary: 'Drafted by an engine.', body_md: '## Findings\n\nA claim [1].', category: 'quality', kind: 'briefing',
    sources: [{ title: 'ISO 9001 overview', url: 'https://www.iso.org/standard/62085.html', publisher: 'ISO' }], standards: ['ISO 9001:2015'] };
  ok((await anon.request.post(BASE + '/api/v1/content/drafts', { data: draft })).status() === 401, 'Content API requires a service key');
  ok((await capi('/drafts', { method: 'POST', data: { ...draft, title: 'Заголовок' } })).status() === 422, 'non-English content is rejected');
  ok((await capi('/drafts', { method: 'POST', data: { ...draft, sources: [{ title: 'x', url: 'javascript:alert(1)' }] } })).status() === 422, 'unsafe source links are rejected');
  const e1 = await capi('/drafts', { method: 'POST', data: draft }); const ej1 = await e1.json();
  ok(e1.status() === 201 && ej1.status === 'draft' && ej1.version === 1, 'engine creates a draft (version 1)');
  const e2 = await capi('/drafts', { method: 'POST', data: { ...draft, body_md: '## Findings\n\nRevised claim [1].' } }); const ej2 = await e2.json();
  ok(e2.status() === 200 && ej2.version === 2 && ej2.id === ej1.id, 'same external_id updates the draft and bumps the version');
  ok((await (await capi(`/articles/${ext}`)).json()).review.reviewed_by === null, 'engine can read the review status of its draft');
  ok((await anon.goto(`${BASE}/knowledge/${ej1.slug}`)).status() === 404, 'engine draft is not public');
  await adm.goto(`${BASE}/admin/content/${ej1.id}`);
  ok(await see(adm, 'text=created by an engine') && await see(adm, 'text=Version history'), 'editor shows engine origin and version history');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=named human subject-matter reviewer'), 'engine draft cannot be published without a human reviewer');
  await adm.fill('input[name=reviewed_by]', 'Dr. Jane Reviewer');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=Saved and published'), 'human reviewer publishes the engine draft');
  ok((await capi('/drafts', { method: 'POST', data: { ...draft, body_md: 'Overwrite attempt' } })).status() === 409, 'engines cannot change published content');
  const gone = [(await capi(`/articles/${ej1.id}`, { method: 'DELETE' })).status(), (await capi(`/articles/${ej1.id}/publish`, { method: 'POST' })).status(), (await capi(`/articles/${ej1.id}`, { method: 'PATCH', data: { status: 'draft' } })).status()];
  ok(gone.every((c) => [401, 404, 405].includes(c)) && (await (await capi(`/articles/${ej1.id}`)).json()).status === 'published', 'no delete, publish or edit endpoint exists for engines');
  await adm.goto(BASE + '/admin/service-keys');
  await adm.click('button:has-text("Revoke")');
  ok((await capi('/articles')).status() === 401, 'revoked service key stops working');
  await adm.goto(`${BASE}/admin/content/${ej1.id}`);
  await adm.click('button:has-text("Delete article")');
  await see(adm, 'text=Article deleted');
  await adm.goto(firstEditUrl);
  await adm.click('button:has-text("Delete article")');
  ok(await see(adm, 'text=Article deleted'), 'article deleted');
  const anonAdmin = await anon.request.get(BASE + '/admin/content', { maxRedirects: 0 });
  ok(anonAdmin.status() === 302, 'content admin requires login');

  console.log('Reviewer engine');
  await adm.goto(BASE + '/admin/service-keys');
  await adm.fill('input[name=label]', 'E2E reviewer');
  await adm.uncheck('input[value="content:draft"]'); await adm.uncheck('input[value="content:read"]'); await adm.check('input[value="content:review"]');
  await adm.click('button:has-text("Create service key")');
  const revKey = (await adm.textContent('.keybox')).trim();
  await adm.fill('input[name=label]', 'E2E producer');
  await adm.click('button:has-text("Create service key")');
  const prodKey = (await adm.textContent('.keybox')).trim();
  const withKey = (key) => (path, opt = {}) => anon.request.fetch(BASE + '/api/v1/content' + path, { ...opt, headers: { 'x-api-key': key, ...(opt.headers || {}) } });
  const rev = withKey(revKey); const prod = withKey(prodKey);
  ok((await rev('/drafts', { method: 'POST', data: { external_id: 'x1', title: 'T', summary: 'S', body_md: 'B', category: 'quality' } })).status() === 403, 'review-only key cannot create drafts');
  ok((await prod('/review/queue')).status() === 403, 'draft key cannot read the review queue');

  const rtitle = `Reviewer Test ${stamp}`;
  await adm.goto(BASE + '/admin/content/new');
  await adm.fill('input[name=title]', rtitle);
  await adm.fill('textarea[name=summary]', 'A draft with a claim that must be blocked by the identity rules.');
  await adm.fill('textarea[name=body_md]', '## Scope\n\nOur credential is ISO accredited and recognized worldwide.\n\n## Method\n\nAuditors sample records.');
  await adm.click('button:has-text("Save draft")');
  await adm.click('button:has-text("Request automated review")');
  ok(await see(adm, 'text=Automated review requested'), 'editor can request an automated review');
  const rq = await (await rev('/review/queue')).json();
  ok(rq.items.some((i) => i.title === rtitle && i.requested), 'review queue lists the requested draft');
  const cli = execSync('node engines/cli.js review-queue', { env: { ...process.env, ENGINE_SITE_URL: BASE, ENGINE_SERVICE_KEY: revKey, ENGINE_PROVIDER: 'mock' } }).toString();
  ok(cli.includes('[block] identity'), 'engine CLI reviewed the draft through the Content API');
  await adm.reload();
  ok(await see(adm, 'text=Do not state that LIV or its credentials are ISO accredited'), 'editor shows the automated review findings');
  const rid = adm.url().split('/').pop();
  ok(((await (await rev(`/review/articles/${rid}`)).json()).version) === 1, 'reviewer can read the draft in full');
  ok((await rev(`/review/articles/${rid}/report`, { method: 'POST', data: { version: 99, result: 'pass', score: 100, flags: [] } })).status() === 409, 'a report for a stale version is refused');
  ok((await rev(`/review/articles/${rid}/report`, { method: 'POST', data: { version: 1, result: 'pass', score: 100, flags: [{ severity: 'block', message: 'x' }] } })).status() === 422, 'a pass report cannot carry blocking flags');
  await adm.fill('input[name=reviewed_by]', 'Dr. Jane Reviewer');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=automated review blocked this version'), 'a blocking automated review stops publication');
  await adm.fill('input[name=override_reason]', 'Wording reviewed with counsel; claim removed in next edit.');
  await adm.click('button:has-text("Publish")');
  ok(await see(adm, 'text=Saved and published'), 'a recorded override reason allows publication');
  ok(psql("SELECT count(*) FROM audit_logs WHERE action = 'content.publish.override'") === '1', 'the override is recorded in the audit log');
  await adm.click('button:has-text("Delete article")');
  await see(adm, 'text=Article deleted');

  console.log('Editorial library');
  if (require('../src/lib/library').loadLibrary().items.length) {
    const { items: libItems } = require('../src/lib/library').loadLibrary();
    const libTotal = libItems.length; const libSlug = libItems[0].slug;
    await adm.goto(BASE + '/admin/content');
    ok(await see(adm, 'text=Editorial library') && await see(adm, `text=${libTotal} item(s) in the library`), 'content admin shows the editorial library');
    await adm.click('button:has-text("library draft(s)")');
    ok(await see(adm, 'text=library draft(s) added'), 'library items load');
    ok(psql(`SELECT count(*) FROM articles WHERE origin = 'library' AND status = 'draft'`) === String(libTotal), 'every library item is loaded as a draft, none published');
    ok(psql(`SELECT count(DISTINCT r.article_id) FROM review_reports r JOIN articles a ON a.id = r.article_id WHERE a.origin = 'library'`) === String(libTotal), 'each library draft carries an automated review report');
    ok((await anon.goto(`${BASE}/knowledge/${libSlug}`)).status() === 404, 'library drafts are not public');
    ok(!(await adm.$('button:has-text("library draft(s)")')), 'loading again is not offered once everything is on the site');
    const libId = psql(`SELECT id FROM articles WHERE slug = '${libSlug}'`);
    const pack = await adm.request.get(`${BASE}/admin/content/${libId}/review-pack.xlsx`);
    ok(pack.status() === 200 && /spreadsheetml/.test(pack.headers()['content-type']) && (await pack.body()).subarray(0, 2).toString() === 'PK', 'an expert review pack (Excel) downloads for a library draft');
    const packs = await adm.request.get(`${BASE}/admin/content/library/review-packs.zip`);
    ok(packs.status() === 200 && /zip/.test(packs.headers()['content-type']), 'review packs for every library item download as one ZIP');
    ok((await anon.request.get(`${BASE}/admin/content/${libId}/review-pack.xlsx`, { maxRedirects: 0 })).status() === 302, 'review packs need an administrator');
    psql(`DELETE FROM articles WHERE origin = 'library'`);
  }

  console.log('Quality records');
  await adm.goto(BASE + '/admin/qms');
  ok(await see(adm, 'text=Compliance and quality records') && await see(adm, 'text=Audit log integrity'), 'compliance dashboard renders');
  ok(await see(adm, 'text=chained entries verified'), 'audit log chain verifies');
  await adm.goto(BASE + '/admin/qms/documents');
  await adm.click('button:has-text("Create starter set")');
  ok(await see(adm, 'text=starter documents created'), 'starter controlled documents created');
  await adm.click('a:has-text("Impartiality policy")');
  await adm.click('button:has-text("Approve version 1")');
  ok(await see(adm, 'text=Complete the document before approving'), 'document with placeholders cannot be approved');
  await adm.fill('textarea[name=body_md]', '# Impartiality policy\n\nLIV is committed to impartial accreditation and examination decisions.');
  await adm.click('button:has-text("Save draft")');
  await adm.click('button:has-text("Approve version 1")');
  ok(await see(adm, 'text=Version 1 approved') && await see(adm, 'td:has-text("(self-approved)")'), 'document approved and self-approval recorded');
  await adm.click('button:has-text("Start a new revision")');
  ok(await see(adm, 'text=Draft version 2'), 'approved document can be revised as a new draft version');

  const sinceCases = psql("SELECT count(*) FROM qms_cases");
  const pubc = await browser.newPage();
  await pubc.goto(BASE + '/contact');
  await pubc.selectOption('select[name=topic]', 'complaint');
  await pubc.fill('input[name=name]', 'Casey Complainant'); await pubc.fill('input[name=email]', 'casey@example.com');
  await pubc.fill('textarea[name=message]', 'A partner issued my certificate with the wrong course name.');
  await pubc.click('button:has-text("Send message")');
  ok(await see(pubc, 'text=Your message has been received'), 'public complaint submitted');
  ok(Number(psql("SELECT count(*) FROM qms_cases")) === Number(sinceCases) + 1, 'public complaint opened a case automatically');

  await adm.goto(BASE + '/admin/qms/cases/new');
  await adm.selectOption('select[name=kind]', 'appeal');
  await adm.fill('textarea[name=summary]', 'Appeal against the decision to reject my application.');
  await adm.click('button:has-text("Open case")');
  ok(await see(adm, 'text=An appeal needs') || await see(adm, 'text=name the person who made the original decision'), 'appeal requires the original decision-maker');
  await adm.fill('input[name=original_decider_name]', 'Omar Decider');
  await adm.click('button:has-text("Open case")');
  ok(await see(adm, 'text=CMP-'), 'appeal case opened with a case number');
  await adm.fill('input[name=handler_name]', 'Ana Handler');
  await adm.click('button:has-text("Record investigation")');
  ok(await see(adm, 'text=Investigation recorded'), 'investigation recorded');
  await adm.selectOption('select[name=outcome]', 'not_upheld');
  await adm.fill('input[name=reviewer_name]', 'omar decider');
  await adm.fill('textarea[name=decision]', 'The original decision stands because the evidence was incomplete.');
  await adm.click('button:has-text("Record decision")');
  ok(await see(adm, 'text=must be independent'), 'appeal reviewer must be independent of the original decision-maker');
  await adm.selectOption('select[name=outcome]', 'not_upheld');
  await adm.fill('input[name=reviewer_name]', 'Dr. Independent');
  await adm.fill('textarea[name=decision]', 'The original decision stands because the evidence was incomplete.');
  await adm.click('button:has-text("Record decision")');
  ok(await see(adm, 'text=Decision recorded'), 'appeal decided by an independent reviewer');
  await adm.click('button:has-text("Close case")');
  ok(await see(adm, 'td:has-text("closed")') || await see(adm, '.badge:has-text("closed")'), 'case closed with a full timeline');

  await adm.goto(BASE + '/admin/qms/actions/new');
  await adm.fill('textarea[name=description]', 'Certificate preview was approved without a second check.');
  await adm.click('button:has-text("Open")');
  ok(await see(adm, 'text=CAR-'), 'nonconformity opened');
  await adm.fill('textarea[name=effectiveness_note]', 'Checked 20 certificates.'); await adm.fill('input[name=verified_by_name]', 'Lee Verifier');
  await adm.click('button:has-text("Close action")');
  ok(await see(adm, 'text=Record the root cause first'), 'action cannot close without root cause and corrective action');
  await adm.fill('textarea[name=root_cause]', 'No second-person check in the procedure.'); await adm.fill('textarea[name=corrective_action]', 'Add a second check to the issuance procedure.');
  await adm.click('button:has-text("Save")');
  await adm.fill('textarea[name=effectiveness_note]', 'Checked 20 certificates after the change; no repeats.'); await adm.fill('input[name=verified_by_name]', 'Lee Verifier');
  await adm.click('button:has-text("Close action")');
  ok(await see(adm, 'text=closed with verified effectiveness'), 'corrective action closed with verified effectiveness');

  await adm.goto(BASE + '/admin/qms/partners');
  ok(await see(adm, '.badge:has-text("due")'), 'active partner without a review is flagged as due');
  await adm.locator('table a').first().click();
  await adm.fill('textarea[name=findings]', 'Trainer CVs and syllabus reviewed; no concerns.');
  await adm.click('button:has-text("Save review")');
  ok(await see(adm, 'text=Review recorded'), 'partner surveillance review recorded');

  await adm.goto(BASE + '/admin/qms/declarations');
  await adm.click('button:has-text("Record declaration")');
  ok(await see(adm, 'text=Declaration recorded'), 'impartiality declaration recorded');
  await adm.goto(BASE + '/admin/qms/meetings');
  await adm.fill('input[name=participants]', 'A. Director, B. Quality');
  await adm.fill('textarea[name=decisions]', 'Objectives confirmed; one corrective action opened.');
  await adm.click('button:has-text("Save record")');
  ok(await see(adm, 'text=Recorded'), 'management review recorded');

  const qzip = await adm.request.get(BASE + '/admin/qms/export.zip');
  const zbuf = Buffer.from(await qzip.body()).toString('latin1');
  ok(qzip.status() === 200 && /zip/.test(qzip.headers()['content-type']) && zbuf.includes('cases.csv') && zbuf.includes('audit_log.csv') && zbuf.includes('README.txt'), 'assessor pack ZIP downloads with registers and audit log');

  let blocked = false;
  try { psql("UPDATE audit_logs SET target = 'x'"); } catch (e) { blocked = /append-only/.test(String(e.stderr || e.message)); }
  ok(blocked, 'audit log rows cannot be updated');
  const arow = psql("SELECT id || '|' || COALESCE(target, '') FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id LIMIT 1").split('|');
  psql(`ALTER TABLE audit_logs DISABLE TRIGGER audit_no_change; UPDATE audit_logs SET target = 'tampered' WHERE id = ${Number(arow[0])}; ALTER TABLE audit_logs ENABLE TRIGGER audit_no_change`);
  await adm.goto(BASE + '/admin/qms');
  ok(await see(adm, 'text=Chain broken at entry'), 'tampering with the audit log is detected');
  psql(`ALTER TABLE audit_logs DISABLE TRIGGER audit_no_change; UPDATE audit_logs SET target = '${(arow[1] || '').replace(/'/g, "''")}' WHERE id = ${Number(arow[0])}; ALTER TABLE audit_logs ENABLE TRIGGER audit_no_change`);
  await adm.goto(BASE + '/admin/qms');
  ok(await see(adm, 'text=chained entries verified'), 'audit chain verifies again after the original value is restored');

  console.log('Credential schemes and authorized scope');
  {
    await adm.goto(BASE + '/admin/schemes');
    ok(await see(adm, 'text=HSE Governance') && await see(adm, 'text=In development'), 'admin sees the HSE Governance scheme in development');
    const hseId = psql("SELECT id FROM credential_schemes WHERE slug = 'hse-governance'");
    const csrfA = await adm.$eval('input[name=_csrf]', (e) => e.value);
    await adm.request.post(`${BASE}/admin/schemes/${hseId}/status`, { form: { _csrf: csrfA, status: 'published' } });
    ok(psql(`SELECT status FROM credential_schemes WHERE id = '${hseId}'`) === 'in_development', 'a scheme cannot be published without an approved version');
    const scopeTitle = `HSE Governance Foundations ${stamp}`;
    await adm.goto(`${BASE}/admin/platforms/${demoId}`);
    await adm.fill('input[name=title]', scopeTitle);
    await adm.selectOption('select[name=scheme_id]', hseId);
    await adm.fill('input[name=granted_on]', '2026-01-01');
    await adm.fill('input[name=decision_note]', 'E2E review reference');
    await adm.click('button:has-text("Add scope")');
    ok(await see(adm, `text=Authorized scope added: ${scopeTitle}`), 'admin records an authorized scope with its basis');
    psql(`UPDATE platforms SET service_hold = false WHERE id = '${demoId}'`);
    const rs = await api('POST', '/api/v1/certificates', { certificates: [{ first_name: 'Scope', last_name: 'Holder', email: `scope.${stamp}@example.com`, course_name: scopeTitle.toUpperCase(), completion_date: '2026-10-01' }] });
    ok(rs.status() === 201, 'credential issued for a course within the scope');
    const sc = (await rs.json()).certificates[0];
    ok(psql(`SELECT record_type || '|' || (partner_scope_id IS NOT NULL) || '|' || (scheme_id = '${hseId}') FROM certificates WHERE cert_number = '${sc.cert_number}'`) === 'training_completion|true|true', 'credential is linked to the matching scope and family, as a training completion record');
    const vr = await (await anon.request.get(sc.verify_url)).text();
    ok(vr.includes('Authorized scope') && vr.includes(scopeTitle) && vr.includes('HSE Governance family'), 'verification record shows the authorized scope');
    const apiV = await (await anon.request.get(`${BASE}/api/v1/verify/${sc.cert_number}`)).json();
    ok(apiV.certificate.record_type === 'training_completion' && apiV.certificate.education_provider.authorized_scope === scopeTitle, 'verification API returns record type and authorized scope');
    const slugP = psql(`SELECT public_slug FROM platforms WHERE id = '${demoId}'`);
    ok((await (await anon.request.get(`${BASE}/partners/${slugP}`)).text()).includes(scopeTitle), 'public register lists the active scope');
    const scopeId = psql(`SELECT id FROM partner_scopes WHERE title = '${scopeTitle}'`);
    await adm.request.post(`${BASE}/admin/scopes/${scopeId}/status`, { form: { _csrf: csrfA, status: 'suspended', reason: 'E2E' } });
    ok(!(await (await anon.request.get(`${BASE}/partners/${slugP}`)).text()).includes(scopeTitle), 'a suspended scope leaves the public register');
    ok((await (await anon.request.get(sc.verify_url)).text()).includes('scope suspended'), 'verification shows that the scope is suspended');
    console.log('Issuance protection (Batch B)');
    ok(psql(`SELECT issued_partner_status || '|' || issued_scope_status || '|' || issued_scope_granted_on FROM certificates WHERE cert_number = '${sc.cert_number}'`) === 'active|active|2026-01-01', 'a new credential records the partner and scope status at issuance');
    const person = (n) => ({ first_name: 'Scope', last_name: `Case${n}`, email: `case${n}.${stamp}@example.com` });
    const refused = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(1), course_name: scopeTitle, completion_date: '2026-10-02' }] });
    ok(refused.status() === 422 && (await refused.text()).includes('not covered by an active authorized scope'), 'issuance under a suspended scope is refused');
    const outside = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(2), course_name: `Unlisted Course ${stamp}`, completion_date: '2026-10-01' }] });
    ok(outside.status() === 422, 'issuance for a course outside every scope is refused');
    const ended = (days, title) => psql(`INSERT INTO partner_scopes (platform_id, title, granted_on, ends_on, decision_note) VALUES ('${demoId}', '${title}', '2026-01-01', CURRENT_DATE - ${days}, 'E2E ended scope') RETURNING id`);
    ended(10, `Grace Ten ${stamp}`); ended(20, `Grace Twenty ${stamp}`);
    const inGrace = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(3), course_name: `Grace Ten ${stamp}`, completion_date: psql('SELECT (CURRENT_DATE - 12)::text') }] });
    ok(inGrace.status() === 201, 'a completion inside a scope that ended 10 days ago can still be issued (15-day maximum)');
    const lateGrace = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(4), course_name: `Grace Twenty ${stamp}`, completion_date: psql('SELECT (CURRENT_DATE - 22)::text') }] });
    ok(lateGrace.status() === 422, 'a scope that ended more than 15 days ago no longer allows issuance');
    const afterEnd = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(5), course_name: `Grace Ten ${stamp}`, completion_date: psql('SELECT (CURRENT_DATE - 5)::text') }] });
    ok(afterEnd.status() === 422, 'training completed after the scope ended is refused');
    const before = psql(`SELECT accreditation_status FROM platforms WHERE id = '${demoId}'`);
    psql(`UPDATE platforms SET accreditation_status = 'suspended' WHERE id = '${demoId}'`);
    const susp = await api('POST', '/api/v1/certificates', { certificates: [{ ...person(6), course_name: 'Hazard Communication', completion_date: '2026-10-01' }] });
    ok(susp.status() === 403 || susp.status() === 422, 'a suspended training provider cannot issue');
    console.log('Verification card (Batch C)');
    const vSusp = await (await anon.request.get(sc.verify_url)).text();
    ok(vSusp.includes('sb-valid') && vSusp.includes('Status when issued</dt><dd>LIV Authorized Training Provider') && vSusp.includes('Partner suspended'), 'suspending the provider later does not make an earlier credential invalid; both statuses are shown');
    const apiS = await (await anon.request.get(`${BASE}/api/v1/verify/${sc.cert_number}`)).json();
    ok(apiS.result === 'valid' && apiS.certificate.education_provider.status_at_issuance === 'active' && apiS.certificate.education_provider.authorization_status === 'suspended', 'verification API separates status at issuance from status today');
    psql(`UPDATE certificates SET issued_partner_status = NULL WHERE cert_number = '${sc.cert_number}'`);
    ok((await (await anon.request.get(sc.verify_url)).text()).includes('Not recorded'), 'a credential without an issuance record shows "Not recorded", never today\'s status');
    psql(`UPDATE certificates SET issued_partner_status = 'active' WHERE cert_number = '${sc.cert_number}'`);
    psql(`UPDATE platforms SET accreditation_status = '${before}' WHERE id = '${demoId}'`);
  }

  console.log('Partner applications data model (Batch D)');
  {
    const A = require('../src/lib/applications');
    const mk = (n) => psql(`WITH p AS (INSERT INTO platforms (company_name, contact_email) VALUES ('Applicant ${n} ${stamp}', 'app${n}.${stamp}@example.com') RETURNING id)
      INSERT INTO users (platform_id, role, full_name, email, password_hash) SELECT id, 'platform_admin', 'Applicant ${n}', 'app${n}.${stamp}@example.com', 'x' FROM p RETURNING platform_id || '|' || id`).split('\n')[0].split('|');
    const [pA, uA] = mk(1); const [pB, uB] = mk(2);
    const userA = { id: uA, email: `app1.${stamp}@example.com`, role: 'platform_admin' };
    const userB = { id: uB, email: `app2.${stamp}@example.com`, role: 'platform_admin' };
    const staff = { id: psql(`INSERT INTO users (role, full_name, email, password_hash, staff_position) VALUES ('super_admin', 'Reviewer D', 'revd.${stamp}@example.com', 'x', 'application_assessor') RETURNING id`).split('\n')[0], email: `revd.${stamp}@example.com`, role: 'super_admin' };
    const fails = (p, status) => p.then(() => false, (e) => !status || e.status === status);
    const app = await A.createDraft(pA, userA);
    ok(app.state === 'draft' && app.criteria_version === 'v0.1', 'a new application starts as a draft against the recorded criteria version');
    ok(await fails(A.createDraft(pA, userA), 409), 'a partner cannot open a second application while one is open');
    await A.saveDraft(app.id, pA, userA, { legal_name: 'Applicant One LLC' });
    const pdf = Buffer.from('%PDF-1.4\n% evidence\n');
    const ev1 = await A.addEvidence(app.id, pA, userA, { criterion: 'C1', filename: 'registration.pdf', buffer: pdf });
    ok(await fails(A.addEvidence(app.id, pA, userA, { criterion: 'C1', filename: 'x.pdf', buffer: Buffer.from('<html></html>') }), 422), 'evidence that is not a PDF, PNG or JPEG is refused');
    const sub = await A.submit(app.id, pA, userA);
    ok(sub.version === 1 && sub.state === 'completeness_check', 'submitting locks version 1 and moves to the completeness check');
    ok(await fails(A.saveDraft(app.id, pA, userA, { legal_name: 'Changed' }), 409), 'the applicant cannot edit while LIV reviews');
    const locked = psqlRefused(`UPDATE partner_application_versions SET form = '{}' WHERE application_id = '${app.id}'`)
      && psqlRefused(`UPDATE partner_application_evidence SET filename = 'changed.pdf' WHERE id = '${ev1.id}'`)
      && psqlRefused(`DELETE FROM partner_application_evidence WHERE id = '${ev1.id}'`)
      && psqlRefused(`DELETE FROM partner_application_events WHERE application_id = '${app.id}'`);
    ok(locked, 'a submitted version, its evidence and the history cannot be changed or deleted, even directly in the database');
    ok(await fails(A.staffTransition(app.id, userA, 'technical_review', 'x'), 403), 'a partner user cannot make a LIV staff move');
    ok(await fails(A.staffTransition(app.id, staff, 'accepted_pending_activation', 'skip'), 409), 'LIV staff cannot skip states');
    await A.staffTransition(app.id, staff, 'info_requested', 'Please add the trading license');
    await A.saveDraft(app.id, pA, userA, { legal_name: 'Applicant One LLC', license: 'added' });
    await A.addEvidence(app.id, pA, userA, { criterion: 'C1', filename: 'registration-v2.pdf', buffer: Buffer.from('%PDF-1.4\n% corrected\n'), supersedesId: ev1.id });
    const sub2 = await A.submit(app.id, pA, userA);
    const view = await A.getOwn(app.id, pA);
    ok(sub2.version === 2 && view.versions.length === 2 && view.versions[0].form.legal_name === 'Applicant One LLC' && !view.versions[0].form.license
      && view.evidence.find((e) => e.id === ev1.id).version === 1 && view.evidence.some((e) => e.version === 2 && e.supersedes_id === ev1.id), 'a correction creates version 2 linked to the earlier evidence; version 1 is unchanged');
    ok(view.events.map((e) => e.to_state).join(',') === 'draft,submitted,completeness_check,info_requested,completeness_check', 'every state change is in the application history');
    ok(await fails(A.getOwn(app.id, pB), 404) && await fails(A.readEvidence(ev1.id, userB, { platformId: pB }), 404) && await fails(A.submit(app.id, pB, userB), 404)
      && await fails(A.readEvidence(ev1.id, userB, { staff: true }), 404), 'one partner cannot read or act on another partner\'s application or evidence');
    const own = await A.readEvidence(ev1.id, userA, { platformId: pA });
    ok(own.content.equals(pdf) && psql(`SELECT count(*) FROM audit_logs WHERE action = 'application.evidence.download' AND target = '${app.id}'`) === '1', 'the applicant reads its own evidence and every download is logged');
    await A.withdraw(app.id, pA, userA, 'E2E');
    ok(await fails(A.staffTransition(app.id, staff, 'technical_review', 'reopen'), 409), 'a withdrawn application is final');
    ok((await A.createDraft(pA, userA)).id !== app.id, 'a new application after a final state is a new record');
  }

  console.log('Partner application review, decision and activation (Batch E)');
  {
    const A = require('../src/lib/applications');
    const S = require('../src/lib/assessment');
    const X = require('../src/lib/activation');
    const P = require('../src/lib/positions');
    const mkStaff = (n, position) => ({ id: psql(`INSERT INTO users (role, full_name, email, password_hash, staff_position) VALUES ('super_admin', 'Reviewer ${n}', 'rev${n}.${stamp}@example.com', 'x', ${position ? `'${position}'` : 'NULL'}) RETURNING id`).split('\n')[0], email: `rev${n}.${stamp}@example.com`, role: 'super_admin' });
    const assessor = mkStaff(1, 'application_assessor'); const decider = mkStaff(2, 'authorization_decision_maker'); const officer = mkStaff(3, 'activation_officer'); const owner = mkStaff(4, null);
    const fails = (p, status) => p.then(() => false, (e) => !status || e.status === status);
    const pdf = (t) => Buffer.from(`%PDF-1.4\n% ${t}\n`);
    const findings = (ev, over = {}) => Object.fromEntries(S.CRITERIA.map((c) => [c, { result: 'met', reason: `${c} reviewed`, evidence_id: ev, ...(over[c] || {}) }]));
    // A submitted application in technical review, with C1 and C3 evidence.
    const prepare = async (tag) => {
      const [pid, uid] = psql(`WITH p AS (INSERT INTO platforms (company_name, contact_email) VALUES ('Reviewed ${tag} ${stamp}', 'rv${tag}.${stamp}@example.com') RETURNING id)
        INSERT INTO users (platform_id, role, full_name, email, password_hash) SELECT id, 'platform_admin', 'Applicant', 'rv${tag}.${stamp}@example.com', 'x' FROM p RETURNING platform_id || '|' || id`).split('\n')[0].split('|');
      const applicant = { id: uid, email: `rv${tag}.${stamp}@example.com`, role: 'platform_admin' };
      const app = await A.createDraft(pid, applicant);
      await A.saveDraft(app.id, pid, applicant, { legal_name: `Reviewed ${tag} LLC` });
      const ev = await A.addEvidence(app.id, pid, applicant, { criterion: 'C1', filename: 'reg.pdf', buffer: pdf('reg') });
      const ev3 = await A.addEvidence(app.id, pid, applicant, { criterion: 'C3', filename: 'trainer.pdf', buffer: pdf('trainer') });
      await A.submit(app.id, pid, applicant);
      await A.staffTransition(app.id, assessor, 'technical_review', 'Complete');
      return { app, pid, uid, ev, ev3 };
    };
    const toAwaiting = async (x) => { await S.recordAssessment(x.app.id, assessor, { findings: findings(x.ev.id, { C9: { result: 'minor', evidence_id: '' } }) }); await A.staffTransition(x.app.id, assessor, 'awaiting_decision', 'Assessed'); };
    const x = await prepare('A');
    const { app, pid, uid, ev, ev3 } = x;

    console.log(' positions');
    ok(await fails(S.recordAssessment(app.id, owner, { findings: findings(ev.id) }), 403) && await fails(S.decide(app.id, owner, { outcome: 'declined', reasons: 'x' }), 403) && await fails(X.activate(app.id, owner), 403), 'the owner administrator (no position) cannot assess, decide or activate');
    ok(await fails(A.staffTransition(app.id, decider, 'awaiting_decision', 'x'), 403) && await fails(S.recordAssessment(app.id, officer, { findings: findings(ev.id) }), 403), 'a position holder cannot do another position\'s work');
    const vac = psql("SELECT id FROM users WHERE staff_position = 'application_assessor' AND vacant LIMIT 1");
    ok(!!vac && await fails(S.recordAssessment(app.id, { id: vac, email: 'v', role: 'super_admin' }, { findings: findings(ev.id) }), 403), 'a vacant position account cannot act');
    ok(psql("SELECT count(*) FROM users WHERE vacant AND password_hash LIKE '!vacant-%' AND email LIKE '%@positions.liv.invalid'") === '3', 'each position starts with a vacant account that cannot sign in');
    const appointee = await P.appoint(vac, owner, { full_name: `Person ${stamp}`, email: `person.${stamp}@example.com` });
    ok(appointee.temp.length >= 12 && psql(`SELECT vacant::text || must_change_password::text FROM users WHERE id = '${vac}'`) === 'falsetrue', 'appointing a person fills the position with a temporary password they must change');
    ok(await fails(P.appoint(psql("SELECT id FROM users WHERE staff_position = 'activation_officer' AND vacant LIMIT 1"), owner, { full_name: ` person ${stamp}`, email: `p2.${stamp}@example.com` }), 409), 'one person cannot hold two separated positions');
    await P.release(vac, owner);
    ok(psql(`SELECT vacant::text FROM users WHERE id = '${vac}'`) === 'true' && await fails(S.recordAssessment(app.id, { id: vac, email: 'v', role: 'super_admin' }, { findings: findings(ev.id) }), 403), 'releasing a position ends the person\'s access');

    console.log(' assessment and recommendation');
    ok(await fails(S.recordAssessment(app.id, assessor, { findings: findings(ev.id, { C2: { reason: ' ' } }) }), 422), 'every finding needs a reason');
    ok(await fails(S.recordAssessment(app.id, assessor, { findings: findings(ev.id, { C2: { evidence_id: '' } }) }), 422), '"met" needs reviewed evidence');
    ok(await fails(S.recordAssessment(app.id, assessor, { findings: findings(ev.id, { C2: { evidence_id: '11111111-1111-1111-1111-111111111111' } }) }), 422), 'evidence from outside this application is refused');
    ok(await fails(A.staffTransition(app.id, assessor, 'awaiting_decision', 'Too early'), 409), 'no decision step without an assessment');
    const first = await S.recordAssessment(app.id, assessor, { findings: findings(ev.id, { C9: { result: 'needs_information', evidence_id: '' } }) });
    ok(first.recommendation.outcome === 'incomplete' && await fails(A.staffTransition(app.id, assessor, 'awaiting_decision', 'Incomplete'), 409), 'a criterion that needs information gives no recommendation and blocks the decision step');
    const second = await S.recordAssessment(app.id, assessor, { findings: findings(ev.id, { C9: { result: 'minor', evidence_id: '' } }) });
    ok(second.recommendation.outcome === 'accept_with_conditions' && psql(`SELECT count(*) FROM partner_assessments WHERE application_id = '${app.id}'`) === '2', 'a re-assessment is a new assessment; the earlier one is kept');
    const again = await S.recalculate(app.id, assessor);
    ok(again.id !== second.recommendation.id && psqlRefused(`UPDATE partner_recommendations SET outcome = 'accept' WHERE id = '${again.id}'`), 'a recalculation adds a recommendation and never edits the earlier one');
    ok(psqlRefused(`UPDATE partner_assessment_findings SET result = 'met' WHERE assessment_id = '${second.assessment.id}'`) && psqlRefused(`DELETE FROM partner_assessments WHERE id = '${second.assessment.id}'`), 'assessments and findings are locked');
    await A.staffTransition(app.id, assessor, 'awaiting_decision', 'Assessed');

    console.log(' decision');
    ok(await fails(A.staffTransition(app.id, decider, 'accepted_pending_activation', 'Skip the form'), 403) && await fails(A.staffTransition(app.id, assessor, 'accepted_pending_activation', 'Skip the form'), 409), 'the decision cannot be made as a plain status move');
    ok(await fails(S.decide(app.id, assessor, { outcome: 'declined', reasons: 'Mine' }), 403), 'the assessor cannot record the decision');
    psql(`UPDATE users SET staff_position = 'authorization_decision_maker' WHERE id = '${assessor.id}'`);
    ok(await fails(S.decide(app.id, assessor, { outcome: 'declined', reasons: 'Mine' }), 403) && psql(`SELECT count(*) FROM partner_application_decisions WHERE application_id = '${app.id}'`) === '0', 'even holding the decision position, the person who recorded the assessment cannot decide, and the refusal leaves no trace');
    psql(`UPDATE users SET staff_position = 'application_assessor' WHERE id = '${assessor.id}'`);
    ok(await fails(S.decide(app.id, decider, { outcome: 'accepted', reasons: 'Looks fine' }), 409), 'a decision cannot be stronger than the recommendation');
    ok(await fails(S.decide(app.id, decider, { outcome: 'accepted_with_conditions', reasons: 'Ok' }), 422), 'acceptance with conditions needs a condition');
    ok(await fails(S.decide(app.id, decider, { outcome: 'accepted_with_conditions', reasons: 'Ok', conditions: [{ text: 'Late', blocking: false }] }), 422), 'a non-blocking condition needs a due date');
    ok(await fails(S.decide(app.id, { id: uid, email: 'x', role: 'platform_admin' }, { outcome: 'declined', reasons: 'No' }), 403), 'a partner account cannot decide');
    psql(`UPDATE partner_criteria_sets SET criteria = jsonb_set(criteria, '{0,title}', to_jsonb('Changed after preparation'::text)) WHERE version = 'v0.1'`);
    ok(await fails(S.decide(app.id, decider, { outcome: 'declined', reasons: 'Stale' }), 409), 'a decision is refused when the inputs changed after the recommendation was prepared');
    psql(`UPDATE partner_criteria_sets SET criteria = jsonb_set(criteria, '{0,title}', to_jsonb('Legal entity and accountability'::text)) WHERE version = 'v0.1'`);
    const d = await S.decide(app.id, decider, { outcome: 'accepted_with_conditions', reasons: 'Meets the criteria with minor gaps', conditions: [{ text: 'Close the C9 gap', blocking: false, due_date: '2027-03-01' }, { text: 'Publish the refund policy', blocking: true }] });
    ok(d.outcome === 'accepted_with_conditions' && psql(`SELECT state FROM partner_applications WHERE id = '${app.id}'`) === 'accepted_pending_activation', 'the decision moves the application to accepted, pending activation');
    ok(psql(`SELECT count(*) FROM partner_application_conditions WHERE decision_id = '${d.id}'`) === '2' && psqlRefused(`UPDATE partner_application_decisions SET outcome = 'declined' WHERE id = '${d.id}'`), 'conditions are recorded and the decision is locked');
    ok(psql(`SELECT accreditation_status FROM platforms WHERE id = '${pid}'`) === 'pending', 'acceptance does not activate the provider');
    ok(await fails(S.decide(app.id, decider, { outcome: 'declined', reasons: 'Again' }), 409), 'a decided application cannot be decided again');

    console.log(' activation');
    ok(await fails(X.activate(app.id, officer), 409), 'activation is refused while checklist items are open');
    const items = (await X.getChecklist(app.id)).items;
    ok(items.length === 6 && items.every((i) => !i.ok), 'every checklist item starts open (blocking condition, agreement, scope and trainer, two-factor, billing, test issuance)');
    const [cid] = psql(`SELECT id FROM partner_application_conditions WHERE decision_id = '${d.id}' AND blocking`).split('\n');
    ok(await fails(X.closeCondition(app.id, officer, cid, 'ok'), 403), 'only the assessor position verifies a condition');
    await X.closeCondition(app.id, assessor, cid, 'Refund policy published at the stated URL');
    ok(psqlRefused(`DELETE FROM partner_condition_closures WHERE condition_id = '${cid}'`), 'a condition closure is locked');
    const scopeId = psql(`INSERT INTO partner_scopes (platform_id, title, decision_note) VALUES ('${pid}', 'Test Course', 'Batch E test') RETURNING id`).split('\n')[0];
    ok(await fails(X.recordTrainer(app.id, assessor, { scope_id: scopeId, trainer_name: 'T. Trainer', evidence_id: ev.id, finding: 'x' }), 422), 'a trainer record needs C3 evidence of this application');
    ok(await fails(X.recordTrainer(app.id, decider, { scope_id: scopeId, trainer_name: 'T. Trainer', evidence_id: ev3.id, finding: 'x' }), 403), 'only the assessor position records a trainer');
    ok(await fails(X.recordTrainer(app.id, assessor, { scope_id: scopeId, trainer_name: 'T. Trainer', evidence_id: ev3.id, finding: ' ' }), 422), 'a trainer record needs the assessor\'s finding');
    await X.recordTrainer(app.id, assessor, { scope_id: scopeId, trainer_name: 'T. Trainer', evidence_id: ev3.id, finding: 'CV and certificates verified against the original documents' });
    ok(psqlRefused(`UPDATE partner_scope_trainers SET trainer_name = 'Other' WHERE scope_id = '${scopeId}'`), 'a trainer record is locked');
    const agr = psql("SELECT id FROM agreements WHERE status = 'active'");
    if (agr) psql(`INSERT INTO agreement_acceptances (platform_id, agreement_id, user_id, accepted_name) VALUES ('${pid}', '${agr}', '${uid}', 'Applicant')`);
    psql(`UPDATE platforms SET billing_name = 'Billing', billing_email = 'bill.${stamp}@example.com' WHERE id = '${pid}'`);
    await X.confirmTestIssuance(app.id, officer, 'Test identifiers TEST-0001 issued and checked, not real credentials');
    const open = (await X.getChecklist(app.id)).items.filter((i) => !i.ok).map((i) => i.key);
    ok(open.includes('two_factor') && (agr ? open.length === 1 : open.length === 2 && open.includes('agreement')), 'the checklist shows exactly what is still open (two-factor sign-in' + (agr ? '' : ' and the missing agreement') + ')');
    ok(await fails(X.activate(app.id, officer), 409) && psql(`SELECT accreditation_status FROM platforms WHERE id = '${pid}'`) === 'pending', 'activation needs two-factor sign-in for every provider administrator');
    psql(`UPDATE users SET totp_enabled = true WHERE id = '${uid}'`);
    if (!agr) {
      psql("INSERT INTO agreements (version, title, body_md, status) VALUES (9999, 'E2E agreement', 'text', 'active')");
      psql(`INSERT INTO agreement_acceptances (platform_id, agreement_id, user_id, accepted_name) SELECT '${pid}', id, '${uid}', 'Applicant' FROM agreements WHERE status = 'active'`);
    }
    const e2eAgreement = !agr; // an agreement created only for this test must not gate the other partners in later checks
    ok(await fails(X.activate(app.id, assessor), 403) && await fails(X.activate(app.id, decider), 403) && await fails(X.activate(app.id, owner), 403), 'the assessor, the decision-maker and the owner cannot activate');
    await X.activate(app.id, officer);
    ok(psql(`SELECT accreditation_status FROM platforms WHERE id = '${pid}'`) === 'active' && psql(`SELECT state FROM partner_applications WHERE id = '${app.id}'`) === 'activated' && psql(`SELECT count(*) FROM partner_activations WHERE application_id = '${app.id}'`) === '1', 'the activation officer activates; the provider turns on and the checklist is recorded');
    if (e2eAgreement) psql("UPDATE agreements SET status = 'retired' WHERE version = 9999");
    ok(await fails(X.activate(app.id, officer), 409) && psqlRefused(`UPDATE partner_activations SET activated_by_label = 'x' WHERE application_id = '${app.id}'`), 'activation happens once and its record is locked');
    ok(await fails(S.reverseDecision(app.id, decider, 'Too late'), 409), 'an acceptance cannot be reversed after activation');
    ok(psql(`SELECT outcome FROM partner_application_decisions WHERE application_id = '${app.id}' ORDER BY created_at LIMIT 1`) === 'accepted_with_conditions', 'the recorded decision is never changed');

    console.log(' reversal');
    const y = await prepare('B');
    await toAwaiting(y);
    const dy = await S.decide(y.app.id, decider, { outcome: 'accepted_with_conditions', reasons: 'Accept', conditions: [{ text: 'Gap', blocking: true }] });
    ok(await fails(S.reverseDecision(y.app.id, decider, ' '), 422) && await fails(S.reverseDecision(y.app.id, assessor, 'Because'), 403), 'a reversal needs reasons and the decision position');
    const rev = await S.reverseDecision(y.app.id, decider, 'New facts: the registration is not valid');
    ok(rev.supersedes_id === dy.id && psql(`SELECT state FROM partner_applications WHERE id = '${y.app.id}'`) === 'declined' && psql(`SELECT count(*) FROM partner_application_decisions WHERE application_id = '${y.app.id}'`) === '2', 'a reversal is a new reasoned decision that points at the earlier one, which is kept');
    ok(psql(`SELECT accreditation_status FROM platforms WHERE id = '${y.pid}'`) === 'pending', 'a reversed acceptance leaves the provider inactive');

    console.log(' screens');
    await adm.goto(`${BASE}/admin/applications`);
    ok(await see(adm, `td:has-text("Reviewed A ${stamp}")`), 'the applications list shows the provider');
    await adm.goto(`${BASE}/admin/applications/${app.id}`);
    ok(await see(adm, 'text=Assessment of version 1') && await see(adm, 'text=Close the C9 gap') && await see(adm, 'text=Activated by'), 'the review screen shows assessments, decision, conditions and the activation record');
    ok(!(await see(adm, 'button:has-text("Record decision")')) && !(await see(adm, 'button:has-text("Activate provider")')), 'the owner administrator sees no assess, decide or activate forms');
    await adm.goto(`${BASE}/admin/staff`);
    ok(await see(adm, 'text=Application Assessor') && await see(adm, 'text=Authorization Decision-Maker') && await see(adm, 'text=Activation Officer'), 'the staff positions page lists the three positions');
    ok((await adm.request.get(`${BASE}/admin/applications/evidence/${ev.id}`)).status() === 200, 'staff download the private evidence');
    ok((await anon.request.get(`${BASE}/admin/applications/${app.id}`, { maxRedirects: 0 })).status() !== 200 && (await anon.request.get(`${BASE}/admin/staff`, { maxRedirects: 0 })).status() !== 200, 'the review and staff screens are closed to visitors');
  }

  console.log('Applicant portal (Batch F)');
  {
    const A = require('../src/lib/applications');
    const fails = (p, status) => p.then(() => false, (e) => !status || e.status === status);
    const form = { legal_name: 'Portal Test Training LLC', country: 'Jordan', representative_name: 'Lina Haddad', representative_email: `lina.${stamp}@example.com`,
      academic_lead: 'Sami Nasser, academic lead, 8 years in safety training', domain_requested: 'Workplace safety awareness', delivery_modes: 'live_online',
      delivery_setting: 'Live online platform with recorded attendance', trainers: 'Two trainers; CVs attached', completion_rules: 'Full attendance and a short quiz', interests: 'None' };
    await page.goto(`${BASE}/portal/application`);
    ok(await see(page, 'button:has-text("Start the application")'), 'a provider with no application sees how to start one');
    await page.click('button:has-text("Start the application")');
    ok(await at(page, /\/portal\/application\/[0-9a-f-]{36}$/), 'starting opens the application page');
    const appUrl = page.url(); const appId = appUrl.split('/').pop();
    await page.fill('#legal_name', 'شركة الاختبار');
    await page.click('button:has-text("Save draft")');
    ok(await see(page, '#error-summary') && await see(page, 'text=write in English'), 'Arabic text is refused with a clear error and the entry stays as typed');
    ok((await page.inputValue('#legal_name')) === 'شركة الاختبار' && psql(`SELECT draft->>'legal_name' FROM partner_applications WHERE id = '${appId}'`) === '', 'nothing refused was saved');
    await page.fill('#legal_name', form.legal_name);
    await page.click('button:has-text("Save draft")');
    ok(await see(page, 'text=Draft saved') && psql(`SELECT draft->>'legal_name' FROM partner_applications WHERE id = '${appId}'`) === form.legal_name, 'a valid draft is saved');
    await page.click('button:has-text("Submit")');
    ok(await see(page, 'text=Upload at least one C1') && psql(`SELECT current_version FROM partner_applications WHERE id = '${appId}'`) === '0', 'submitting without the required documents is refused');
    const csrf = await page.inputValue('input[name=_csrf]');
    const up = (criterion, name, buffer, mimeType = 'application/pdf') => page.request.post(`${appUrl}/evidence`, { multipart: { _csrf: csrf, criterion, file: { name, mimeType, buffer } }, maxRedirects: 0 });
    await up('C1', 'fake.pdf', Buffer.from('not a pdf at all'));
    ok(psql(`SELECT count(*) FROM partner_application_evidence WHERE application_id = '${appId}'`) === '0', 'a file is checked by content, not by name');
    await up('C1', 'registration.pdf', Buffer.from('%PDF-1.4\n% registration\n'));
    await up('C3', 'trainers.pdf', Buffer.from('%PDF-1.4\n% trainers\n'));
    ok(psql(`SELECT count(*) FROM partner_application_evidence WHERE application_id = '${appId}'`) === '2', 'documents upload against a criterion');
    const evId = psql(`SELECT id FROM partner_application_evidence WHERE application_id = '${appId}' AND criterion = 'C1'`);
    ok((await page.request.get(`${appUrl}/evidence/${evId}`)).status() === 200, 'the provider downloads its own document');
    const sub = await page.request.post(`${appUrl}/submit`, { form: { _csrf: csrf, ...form }, maxRedirects: 0 });
    ok(sub.status() === 302 && psql(`SELECT state || ':' || current_version FROM partner_applications WHERE id = '${appId}'`) === 'completeness_check:1', 'a complete application is submitted as a locked version and moves to the completeness check');
    await page.goto(appUrl);
    ok(await see(page, 'text=Completeness check') && await page.locator('#legal_name').isDisabled(), 'the submitted version is read-only');
    const edit = await page.request.post(`${appUrl}/save`, { form: { _csrf: csrf, ...form, legal_name: 'Changed LLC' }, maxRedirects: 0 });
    ok(psql(`SELECT draft->>'legal_name' FROM partner_applications WHERE id = '${appId}'`) === form.legal_name, 'the draft cannot be changed while LIV holds the application');
    const reviewer = { id: psql(`INSERT INTO users (role, full_name, email, password_hash, staff_position) VALUES ('super_admin', 'Reviewer F', 'revf.${stamp}@example.com', 'x', 'application_assessor') RETURNING id`).split('\n')[0], email: `revf.${stamp}@example.com`, role: 'super_admin' };
    await A.staffTransition(appId, reviewer, 'info_requested', 'Please add the trading license of the second trainer');
    await page.goto(appUrl);
    ok(await see(page, 'text=Message from LIV') && await see(page, 'text=Please add the trading license') && await page.locator('#legal_name').isEnabled(), 'a request from LIV is shown and the form opens for correction');
    ok(!(await page.content()).includes('Reviewer F') && !(await page.content()).includes('revf.'), 'the reviewer\'s identity and notes are not shown to the provider');
    const [oPid, oUid] = psql(`WITH p AS (INSERT INTO platforms (company_name, contact_email) VALUES ('Other Applicant ${stamp}', 'oa.${stamp}@example.com') RETURNING id)
      INSERT INTO users (platform_id, role, full_name, email, password_hash) SELECT id, 'platform_admin', 'Other', 'oa.${stamp}@example.com', 'x' FROM p RETURNING platform_id || '|' || id`).split('\n')[0].split('|');
    const other = await A.createDraft(oPid, { id: oUid, email: 'oa', role: 'platform_admin' });
    const otherEv = await A.addEvidence(other.id, oPid, { id: oUid, email: 'oa', role: 'platform_admin' }, { criterion: 'C1', filename: 'o.pdf', buffer: Buffer.from('%PDF-1.4\n% o\n') });
    const status = async (method, url, opts) => (await page.request[method](url, { maxRedirects: 0, ...opts })).status();
    ok(await status('get', `${BASE}/portal/application/${other.id}`) === 404 && await status('get', `${BASE}/portal/application/${other.id}/evidence/${otherEv.id}`) === 404, 'one provider cannot open another provider\'s application or document by link');
    ok(await status('post', `${BASE}/portal/application/${other.id}/save`, { form: { _csrf: csrf, ...form } }) === 404 && await status('post', `${BASE}/portal/application/${other.id}/submit`, { form: { _csrf: csrf, ...form } }) === 404, 'nor save or submit it');
    ok(await status('get', `${appUrl}/evidence/${otherEv.id}`) === 404, 'a document of another application is not served under your own application');
    ok((await anon.request.get(appUrl, { maxRedirects: 0 })).status() !== 200, 'the application page is closed to visitors');
  }

  console.log('Knowledge distribution');
  {
    const slugA = psql("SELECT slug FROM articles WHERE status = 'published' LIMIT 1");
    const ah = await (await anon.request.get(`${BASE}/knowledge/${slugA}`)).text();
    ok(ah.includes('Share on LinkedIn') && ah.includes('linkedin.com/sharing/share-offsite/?url=') && ah.includes('Copy link'), 'article page offers LinkedIn sharing and copy link');
    ok(ah.includes('property="og:type" content="article"') && ah.includes('og-default.png') && ah.includes('article:published_time'), 'article page carries article Open Graph tags and an image');
    ok((await anon.request.get(BASE + '/static/brand/og-default.png')).status() === 200, 'default social image is served');
  }

  console.log('Durable credential files (Phase 0)');
  {
    const STORAGE = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
    const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
    const row = (i) => resultsCsv.split('\n')[i].split(',');
    const pdfAt = (url) => anon.request.get(url.replace('?t=', '/pdf?t='));
    const [key1, key3] = [1, 3].map((i) => psql(`SELECT pdf_path FROM certificates WHERE cert_number = '${row(i)[0]}'`));
    const stored1 = psql(`SELECT sha256 FROM stored_files WHERE key = '${key1}'`);
    ok(/^[0-9a-f]{64}$/.test(stored1) && sha(await (await pdfAt(verifyUrl)).body()) === stored1, 'an issued PDF is stored in the database with its SHA-256');
    fs.rmSync(path.join(STORAGE, ...key1.split('/')), { force: true });
    const again = await pdfAt(verifyUrl);
    ok(again.status() === 200 && sha(await again.body()) === stored1, 'the PDF still downloads byte for byte after its disk copy is lost (as on a redeploy)');
    ok(psqlRefused(`UPDATE stored_files SET bytes = 1 WHERE key = '${key1}'`), 'a stored credential PDF cannot be changed');
    // A file kept only on disk (stored before this release) is copied in; a file lost everywhere is reported, never re-rendered.
    psql(`DELETE FROM stored_files WHERE key = '${key3}'`);
    const cells = async (label) => (await adm.locator('tr', { hasText: label }).first().innerText()).split('\t').map((t) => t.trim());
    await adm.goto(BASE + '/admin/system');
    ok((await cells('Files only on disk'))[1] === '1' && (await cells('CERT_HMAC_SECRET'))[1] === 'set', 'system status counts the disk-only file and reports secrets without values');
    await adm.click('button:has-text("Copy disk-only files now")');
    ok(await see(adm, 'text=1 file(s) copied from disk into the database') && psql(`SELECT count(*) FROM stored_files WHERE key = '${key3}'`) === '1', 'the administrator copies it into the database');
    await adm.click('button:has-text("Check file integrity")');
    ok(await see(adm, 'text=stored file(s) match their recorded SHA-256'), 'the integrity check confirms every stored file');
    psql(`DELETE FROM stored_files WHERE key = '${key3}'`); fs.rmSync(path.join(STORAGE, ...key3.split('/')), { force: true });
    await adm.goto(BASE + '/admin/system');
    ok((await cells('missing everywhere'))[1] === '1' && await see(adm, `td:has-text("${row(3)[0]}")`), 'a credential whose file is lost everywhere is listed for a decision');
    ok((await pdfAt(row(3).pop())).status() === 404 && psql(`SELECT count(*) FROM stored_files WHERE key = '${key3}'`) === '0', 'that PDF is not regenerated');
    const anonSystem = await anon.request.get(BASE + '/admin/system', { maxRedirects: 0 });
    ok(anonSystem.status() !== 200, 'system status is for LIV administrators only');
  }

  console.log('Deployed server guard (Phase 0)');
  {
    // A second server with REPLIT_DEPLOYMENT=1 behaves like the published site: the README's development passwords never sign in.
    const port2 = 3100 + (process.pid % 500); const base2 = `http://localhost:${port2}`;
    const srv = spawn(process.execPath, ['src/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port2), REPLIT_DEPLOYMENT: '1' }, stdio: 'ignore' });
    try {
      const c2 = await browser.newContext(); const p2 = await c2.newPage();
      for (let i = 0; i < 60 && !(await p2.request.get(base2 + '/').then((r) => r.ok()).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
      await p2.goto(base2 + '/login'); await p2.fill('input[name=email]', 'admin@liv.local'); await p2.fill('input[name=password]', 'ChangeMe-Admin-2026');
      await p2.click('button:has-text("Log in")');
      ok(await see(p2, 'text=development password that is published in the documentation') && !p2.url().endsWith('/admin'), 'a deployed server refuses the published development password');
      ok(psql("SELECT count(*) FROM audit_logs WHERE action = 'user.login_refused_dev_password'") !== '0', 'the refused sign-in is recorded in the audit log');
      await c2.close();
    } finally { srv.kill(); }
  }

  console.log('Security');
  const noCsrf = await ctx.request.post(BASE + '/portal/settings/keys', { form: { label: 'x' } });
  ok(noCsrf.status() === 403, 'POST without CSRF token rejected');
  const cross = await page.request.get(`${BASE}/portal/batches/00000000-0000-0000-0000-000000000000`);
  ok(cross.status() === 404, 'unknown batch → 404 (got ' + cross.status() + ' ' + cross.url() + ')');

  console.log('Demo data removal (Phase 0; runs last because it removes the demo partner)');
  {
    const purge = (args) => execSync(`node scripts/purge-demo.js ${args}`, { cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe' }).toString();
    const demoCert = psql(`SELECT cert_number FROM certificates WHERE platform_id = '${demoId}' AND status = 'active' LIMIT 1`);
    const statusBefore = psql(`SELECT accreditation_status FROM platforms WHERE id = '${demoId}'`);
    ok(purge('').includes('Dry run: nothing changed') && psql(`SELECT accreditation_status FROM platforms WHERE id = '${demoId}'`) === statusBefore
      && (await anon.request.get(`${BASE}/verify/${demoCert}`)).status() === 200, 'purge-demo dry run lists the demo data and changes nothing');
    await adm.goto(BASE + '/admin/system');
    ok(await see(adm, 'h3:has-text("Demo data")') && await see(adm, 'text=sample credential(s)'), 'Admin > System offers the removal of the demo data');
    await adm.click('button:has-text("Remove demo data")');
    ok(await see(adm, 'text=Type REMOVE to confirm the removal') && (await anon.request.get(`${BASE}/verify/${demoCert}`)).status() === 200, 'the removal needs the typed confirmation');
    await adm.fill('input[name=confirm]', 'REMOVE'); await adm.click('button:has-text("Remove demo data")');
    ok(await see(adm, 'text=Demo data removed') && (await anon.request.get(`${BASE}/verify/${demoCert}`)).status() === 404, 'after the removal the demo credentials no longer verify');
    ok(!(await (await anon.request.get(BASE + '/partners')).text()).includes('Demo Safety Training Co.') && psql("SELECT count(*) FROM audit_logs WHERE action = 'demo.purge'") === '1'
      && purge('').includes('delete: 0 credential(s)'), 'the demo partner leaves the public register, the removal is in the audit log, and nothing is left to delete');
  }

  await browser.close();
  console.log(`\nAll ${passed} checks passed.`);
})().catch(async (e) => {
  console.error(e.message);
  // Report what every open page shows (address, heading, messages); with E2E_FAILURE_DIR set, also a screenshot of each.
  let n = 0;
  for (const c of browserRef ? browserRef.contexts() : []) {
    for (const p of c.pages()) {
      const info = await p.evaluate(() => ({ h1: (document.querySelector('h1') || {}).textContent || '', alerts: [...document.querySelectorAll('.alert')].map((a) => a.textContent.trim()) })).catch(() => ({}));
      console.error(`  page ${p.url()} h1=${JSON.stringify((info.h1 || '').trim())} messages=${JSON.stringify(info.alerts || [])}`);
      if (process.env.E2E_FAILURE_DIR) {
        fs.mkdirSync(process.env.E2E_FAILURE_DIR, { recursive: true });
        await p.screenshot({ path: path.join(process.env.E2E_FAILURE_DIR, `page-${++n}.png`), fullPage: true }).catch(() => {});
      }
    }
  }
  process.exit(1);
});
