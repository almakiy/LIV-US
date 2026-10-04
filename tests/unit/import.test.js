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

test('autoMap recognizes English and Arabic headings', () => {
  const m = autoMap(['م', 'اسم المتدرب', 'رقم الهوية', 'البريد الإلكتروني', 'الدورة', 'تاريخ الإكمال', 'التقدير']);
  assert.deepStrictEqual(m, { serial_no: 'م', full_name: 'اسم المتدرب', first_name: '', last_name: '', national_id: 'رقم الهوية', email: 'البريد الإلكتروني', course_name: 'الدورة', completion_date: 'تاريخ الإكمال', grade: 'التقدير' });
  const e = autoMap(['Serial No', 'First Name', 'Surname', 'ID Number', 'E-mail', 'Course', 'Date Completed', 'Score']);
  assert.strictEqual(e.first_name, 'First Name'); assert.strictEqual(e.last_name, 'Surname'); assert.strictEqual(e.full_name, ''); assert.strictEqual(e.national_id, 'ID Number');
  assert.strictEqual(norm('البريد الإلكتروني'), norm('البريد الالكتروني'));
});

test('validateRows splits full_name, validates ID, keeps ID out of the clear in hashes', async () => {
  // platformId null → the DB duplicate lookup is skipped only when no candidates; use rows that all fail first
  const rows = [
    { full_name: 'Ahmed Mohammed Al Ali', email: 'A@x.com', course_name: 'C', completion_date: '2026-01-05', national_id: '1234 567 890' },
    { full_name: 'Single', email: 'b@x.com', course_name: 'C', completion_date: '2026-01-05' },
    { full_name: 'Two Words', email: 'c@x.com', course_name: 'C', completion_date: '2026-01-05', national_id: '12' },
    { email: 'd@x.com', course_name: 'C', completion_date: '2026-01-05' },
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
  } finally { db.pool.query = orig; }
  assert.strictEqual(idLast4('1234 567-890'), '7890');
  assert.strictEqual(normalizeId(' ab-12 '), 'AB12');
  assert.notStrictEqual(idHash('1234567890'), idHash('1234567891'));
  assert.match(idHash('1234567890'), /^[0-9a-f]{64}$/);
});

test('template CSV has a BOM, the expected header and an Arabic example', () => {
  const t = sampleCsv();
  assert.ok(t.startsWith('﻿'));
  assert.ok(t.includes('serial_no,full_name,national_id,email,course_name,completion_date,grade'));
  assert.ok(t.includes('أحمد محمد العلي'));
});
