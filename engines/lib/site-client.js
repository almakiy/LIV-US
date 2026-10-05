// Thin client for the site's Content API (docs/CONTENT-API.md). Uses a service key; never publishes.
const cfg = require('./config');

function client({ siteUrl = cfg.siteUrl, serviceKey = cfg.serviceKey, fetchImpl = fetch } = {}) {
  async function call(method, path, body) {
    if (!serviceKey) throw new Error('ENGINE_SERVICE_KEY is not set (create a key under Admin > Service keys).');
    const res = await fetchImpl(`${siteUrl}/api/v1/content${path}`, { method, headers: { 'content-type': 'application/json', 'x-api-key': serviceKey }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(`Site API ${res.status}: ${json.error || (json.errors || []).join('; ') || 'error'}`); e.status = res.status; throw e; }
    return json;
  }
  return {
    reviewQueue: () => call('GET', '/review/queue'),
    getDraft: (id) => call('GET', `/review/articles/${id}`),
    postReport: (id, report) => call('POST', `/review/articles/${id}/report`, report),
    createDraft: (draft) => call('POST', '/drafts', draft),
  };
}
module.exports = { client };
