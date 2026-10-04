// Import a trainee list from a shared Google Drive file or Google Sheet link.
// Security: the user-supplied URL is never fetched directly. We extract the document id with a strict
// pattern, build the download URL ourselves, follow redirects manually and only to Google hosts, cap the
// size and time, and reject HTML responses (a "sign in" / "not shared" page).
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

class SourceError extends Error {}

const ID_RE = '([A-Za-z0-9_-]{10,100})';

/** Returns { kind: 'sheet'|'file', id, gid } or throws SourceError. Pure; no network. */
function parseSourceLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new SourceError('That does not look like a valid link.'); }
  if (u.protocol !== 'https:') throw new SourceError('Only https links are accepted.');
  const href = u.href;
  if (u.hostname === 'docs.google.com') {
    const m = new RegExp(`^/spreadsheets/d/${ID_RE}(?:/|$)`).exec(u.pathname);
    if (!m) throw new SourceError('Paste a Google Sheets link (docs.google.com/spreadsheets/d/…) or a Google Drive file link.');
    const g = /[#&?]gid=(\d{1,12})/.exec(u.hash + u.search);
    return { kind: 'sheet', id: m[1], gid: g ? g[1] : null };
  }
  if (u.hostname === 'drive.google.com') {
    const m = new RegExp(`^/file/d/${ID_RE}(?:/|$)`).exec(u.pathname)
      || (['/open', '/uc'].includes(u.pathname) && u.searchParams.get('id') && new RegExp(`^${ID_RE}$`).exec(u.searchParams.get('id')));
    if (!m) throw new SourceError('Paste a Google Drive file link (drive.google.com/file/d/…) or a Google Sheets link.');
    return { kind: 'file', id: m[1], gid: null };
  }
  void href;
  throw new SourceError('Only Google Drive and Google Sheets links are supported. Upload the file instead for other sources.');
}

const downloadUrl = ({ kind, id, gid }) => (kind === 'sheet'
  ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
  : `https://drive.google.com/uc?export=download&id=${id}`);

const isGoogleHost = (h) => h === 'drive.google.com' || h === 'docs.google.com' || h === 'drive.usercontent.google.com' || h.endsWith('.googleusercontent.com');
const NOT_PUBLIC = 'Could not read the file. In Google Drive set sharing to “Anyone with the link can view”, then try again.';

async function readCapped(res) {
  const chunks = []; let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); throw new SourceError('The file is larger than 5 MB.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Downloads the CSV. `fetchImpl` is injectable for tests. Returns { buffer, fileName }. */
async function fetchCsvFromLink(raw, { fetchImpl = fetch } = {}) {
  const src = parseSourceLink(raw);
  let url = downloadUrl(src);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'LIV-importer/1.0', accept: 'text/csv,text/plain,*/*' } });
    } catch (e) {
      throw new SourceError(e.name === 'TimeoutError' ? 'Google did not respond in time. Try again.' : 'Could not reach Google. Try again or upload the file.');
    }
    if (res.status >= 300 && res.status < 400) {
      const next = new URL(res.headers.get('location') || '', url);
      if (next.protocol !== 'https:' || !isGoogleHost(next.hostname)) throw new SourceError(NOT_PUBLIC); // e.g. accounts.google.com sign-in
      url = next.href; continue;
    }
    if (res.status === 404) throw new SourceError('File not found. Check the link.');
    if (!res.ok) throw new SourceError(NOT_PUBLIC);
    const buffer = await readCapped(res);
    const head = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
    if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html') || head.startsWith('<!doctype') || head.startsWith('<html')) throw new SourceError(NOT_PUBLIC);
    if (!buffer.length) throw new SourceError('The file is empty.');
    return { buffer, fileName: src.kind === 'sheet' ? 'google-sheet.csv' : 'google-drive-file.csv' };
  }
  throw new SourceError('Too many redirects.');
}

module.exports = { fetchCsvFromLink, parseSourceLink, downloadUrl, SourceError, MAX_BYTES };
