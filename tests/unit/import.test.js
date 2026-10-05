const test = require('node:test');
const assert = require('node:assert');
const { parseSourceLink, fetchCsvFromLink, SourceError } = require('../../src/lib/csv-source');
const { autoMap, validateRows, sampleCsv, norm } = require('../../src/lib/issuance');
const { idHash, idLast4, normalizeId } = require('../../src/lib/crypto');

test('Google link parsing accepts Drive/Sheets only and builds the download URL itself', () => {
  assert.deepStrictEqual(parseSourceLink('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUv/edit#gid=77'), { kind: 'sheet', id: '1AbCdEfGhIjKlMnOpQrStUv', gid: '77' });
  assert.strictEqual(parseSourceLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing').kind, 'file');
  assert.strictEqual(parseSourceLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp').id, '1AbCdEfGhIjKlMnOp');
  for (const bad of ['http://drive.google.com/file/d/1AbCdEfGhIjKlMnOp', 'https://evil.com/file/d/1AbCdEfGhIjKlMnOp', 'https://drive.google.com.evil.com/file/d/1AbCdEfGhIjKlMnOp', 'https://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'not a url', 'https://drive.google.com/drive/folders/abc']) {
    assert.throws(() => parseSourceLink(bad), SourceError, bad);
  }
});

const resp = (status, body, headers = {}) => new Response(body, { status, headers });
test('fetchCsvFromLink follows redirects only to Google, rejects HTML and oversize files', async () => {
  const link = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view';
  // ok via a Google redirect
  const calls = [];
  const okFetch = async (url) => { calls.push(url); return calls.length === 1 ? resp(303, '', { location: 'https://drive.usercontent.google.com/download?id=x' }) : resp(200, 'a,b\n1,2\n', { 'content-type': 'text/csv' }); };
  const out = await fetchCsvFromLink(link, { fetchImpl: okFetch });
  assert.strictEqual(out.buffer.toString(), 'a,b\n1,2\n');
  // redirect to a non-Google host (SSRF attempt) or to sign-in
  await assert.rejects(fetchCsvFromLink(link, { fetchImpl: async () => resp(302, '', { location: 'http://169.254.169.254/' }) }), SourceError);
  await assert.rejects(fetchCsvFromLink(link, { fetchImpl: async () => resp(302, '', { location: 'https://accounts.google.com/ServiceLogin' }) }), /sharing/);
  // HTML page = not shared
  await assert.rejects(fetchCsvFromLink(link, { fetchImpl: async () => resp(200, '<!DOCTYPE html><html>', { 'content-type': 'text/html' }) }), /sharing/);
  // too large
  await assert.rejects(fetchCsvFromLink(link, { fetchImpl: async () => resp(200, Buffer.alloc(5 * 1024 * 1024 + 10, 97), { 'content-type': 'text/csv' }) }), /5 MB/);
});

test('autoMap recognizes common English headings', () => {
  const m = autoMap(['Serial No', 'Trainee Name', 'ID Number', 'E-mail', 'Course', 'Date Completed']);
  assert.deepStrictEqual(m, { serial_no: 'Serial No', full_name: 'Trainee Name', first_name: '', last_name: '', national_id: 'ID Number', email: 'E-mail', course_name: 'Course', completion_date: 'Date Completed' });
  const e = autoMap(['First Name', 'Surname', 'Email', 'Course', 'Date']);
  assert.strictEqual(e.first_name, 'First Name'); assert.strictEqual(e.last_name, 'Surname'); assert.strictEqual(e.full_name, '');
  assert.strictEqual(norm('E-mail Address'), 'e_mail_address');
});

test('English-only: non-Latin letters and digits are rejected, accented Latin is fine', () => {
  const { hasNonLatin } = require('../../src/lib/issuance');
  assert.strictEqual(hasNonLatin('Jane O\'Neil-Smith Jr. #4 (2026)'), false);
  assert.strictEqual(hasNonLatin('José Müller'), false);
  for (const bad of ['\u0633\u0627\u0631\u0629', 'Sara \u0627\u0644\u0623\u062d\u0645\u062f', '\u5f20\u4f1f', '\u0418\u0432\u0430\u043d', '12\u0663']) assert.strictEqual(hasNonLatin(bad), true, bad);
});

test('validateRows splits full_name, validates ID, keeps ID out of the clear in hashes', async () => {
  // platformId null → the DB duplicate lookup is skipped only when no candidates; use rows that all fail first
  const rows = [
    { full_name: 'Ahmed Mohammed Al Ali', email: 'A@x.com', course_name: 'C', completion_date: '2026-01-05', national_id: '1234 567 890' },
    { full_name: 'Single', email: 'b@x.com', course_name: 'C', completion_date: '2026-01-05' },
    { full_name: 'Two Words', email: 'c@x.com', course_name: 'C', completion_date: '2026-01-05', national_id: '12' },
    { email: 'd@x.com', course_name: 'C', completion_date: '2026-01-05' },
    { full_name: 'Sara \u0627\u0644\u0623\u062d\u0645\u062f', email: 'e@x.com', course_name: 'C', completion_date: '2026-01-05' },
  ];
  const { validateRows: v } = require('../../src/lib/issuance');
  const db = require('../../src/db');
  const orig = db.pool.query; db.pool.query = async () => ({ rows: [] }); // no existing certificates
  try {
    const out = await v(rows, '00000000-0000-0000-0000-000000000000');
    assert.deepStrictEqual([out[0].errors, out[0].data.first_name, out[0].data.last_name, out[0].data.national_id], [[], 'Ahmed Mohammed Al', 'Ali', '1234567890']);
    assert.match(out[1].errors.join(), /full_name must include/);
    assert.match(out[2].errors.join(), /national_id/);
    assert.match(out[3].errors.join(), /name is required/);
    assert.match(out[4].errors.join(), /last_name must use English/);
  } finally { db.pool.query = orig; }
  assert.strictEqual(idLast4('1234 567-890'), '7890');
  assert.strictEqual(normalizeId(' ab-12 '), 'AB12');
  assert.notStrictEqual(idHash('1234567890'), idHash('1234567891'));
  assert.match(idHash('1234567890'), /^[0-9a-f]{64}$/);
});

test('template CSV has a BOM, the expected header and English-only examples', () => {
  const t = sampleCsv();
  assert.ok(t.startsWith('﻿'));
  assert.ok(t.includes('serial_no,full_name,national_id,email,course_name,completion_date'));
  assert.ok(!/[^\x00-\x7F]/.test(t.slice(1)), 'template contains only ASCII');
});

test('xlsx: reads dates, numbers, formulas and rich text; detects type by content; rejects junk and old .xls', async () => {
  const ExcelJS = require('exceljs');
  const { parseTraineeFile, sampleXlsx, FileError } = require('../../src/lib/trainee-file');
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('S');
  ws.addRow(['Serial No', 'Name', 'ID Number', 'Email', 'Course', 'Date Completed', 'Score']);
  ws.addRow([11, { richText: [{ text: 'Ann ' }, { text: 'Lee' }] }, 2233445566, { text: 'ann@x.com', hyperlink: 'mailto:ann@x.com' }, 'First Aid', new Date(Date.UTC(2026, 8, 22)), { formula: '90+5', result: 95 }]);
  ws.addRow([]);
  ws.addRow([12, 'Bo Chan', '0099887766', 'bo@x.com', 'CPR', '2026-09-23', '']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const { records, type } = await parseTraineeFile(buf);
  assert.strictEqual(type, 'xlsx');
  assert.deepStrictEqual(records, [
    { 'Serial No': '11', Name: 'Ann Lee', 'ID Number': '2233445566', Email: 'ann@x.com', Course: 'First Aid', 'Date Completed': '2026-09-22', Score: '95' },
    { 'Serial No': '12', Name: 'Bo Chan', 'ID Number': '0099887766', Email: 'bo@x.com', Course: 'CPR', 'Date Completed': '2026-09-23', Score: '' },
  ]);
  await assert.rejects(parseTraineeFile(buf, { allowXlsx: false }), FileError);
  await assert.rejects(parseTraineeFile(Buffer.from('PK\x03\x04 this is not a workbook')), /valid Excel/);
  await assert.rejects(parseTraineeFile(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])), /97-2003/);
  const csv = await parseTraineeFile(Buffer.from('﻿Name;Email\nA B;a@x.com\n'));
  assert.deepStrictEqual(csv.records, [{ Name: 'A B', Email: 'a@x.com' }]);
  const t = await parseTraineeFile(await sampleXlsx(['serial_no', 'full_name'], [['1', 'Jane Doe']]));
  assert.deepStrictEqual(t.records, [{ serial_no: '1', full_name: 'Jane Doe' }]);
});
