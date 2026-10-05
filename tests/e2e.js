// End-to-end test: run with the server up (npm start) and the DB seeded (npm run seed).
// Usage: node tests/e2e.js [baseUrl] [screenshotDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = process.argv[2] || 'http://localhost:3000';
const SHOTS = process.argv[3] || null;
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ✓', msg); };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };
const see = (p, sel) => p.locator(sel).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
const psql = (sql) => execSync(`psql "${process.env.DATABASE_URL}" -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();

(async () => {
  require('dotenv').config({ quiet: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const stamp = Date.now();

  console.log('Public site');
  await page.goto(BASE + '/');
  ok((await page.title()).includes('LIV | Leading Institute of Verification'), 'homepage renders');
  await shot(page, '01-home');
  await page.fill('input[name=id]', 'not-an-id');
  await page.click('.hero-search button');
  ok(await see(page, 'text=valid Certificate ID'), 'invalid ID format rejected');

  console.log('Provider login + CSV issuance');
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', 'demo@trainingco.example');
  await page.fill('input[name=password]', 'ChangeMe-Demo-2026');
  await page.click('button:has-text("Log in")');
  ok(page.url().endsWith('/portal'), 'demo admin logged in');
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
  ok(page.url().endsWith('/issue/map'), 'CSV uploaded, mapping step');
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
  ok(await see(page, 'text=3 certificate(s) issued, 3 row(s) skipped'), 'issued 3, skipped 3');
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
  ok(ap.url().endsWith('/portal') && await see(ap, 'text=Accreditation status'), 'applicant lands in portal with pending banner');
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
  ok(adm.url().endsWith('/admin'), 'super admin logged in');
  await shot(adm, '12-admin');
  await adm.goto(BASE + '/admin/platforms?status=pending');
  await shot(adm, '13-admin-platforms');
  const row = adm.locator('tr', { hasText: `Gulf Safety Academy ${stamp}` });
  await row.locator('button:has-text("Approve")').click();
  ok(await see(adm, `text=Gulf Safety Academy ${stamp} is now active`), 'super admin approved platform');
  await ap.goto(BASE + '/portal');
  ok(!(await ap.isVisible('text=Accreditation status')), 'applicant now active');

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
  await adm.click('button:has-text("Delete article")');
  ok(await see(adm, 'text=Article deleted'), 'article deleted');
  const anonAdmin = await anon.request.get(BASE + '/admin/content', { maxRedirects: 0 });
  ok(anonAdmin.status() === 302, 'content admin requires login');

  console.log('Security');
  const noCsrf = await ctx.request.post(BASE + '/portal/settings/keys', { form: { label: 'x' } });
  ok(noCsrf.status() === 403, 'POST without CSRF token rejected');
  const cross = await page.request.get(`${BASE}/portal/batches/00000000-0000-0000-0000-000000000000`);
  ok(cross.status() === 404, 'unknown batch → 404');

  await browser.close();
  console.log(`\nAll ${passed} checks passed.`);
})().catch((e) => { console.error(e.message); process.exit(1); });
