// Model access. Every call goes through here so spend is checked and logged in one place.
const cfg = require('./config');
const budget = require('./budget');

/** Offline provider: no network, no cost. It cannot judge claims; the Reviewer's claim check falls back to its lexical method. */
const mock = { name: 'mock', model: 'lexical', async complete() { return { text: '', usage: { input: 0, output: 0 }, offline: true }; } };

/** Anthropic Messages API. Refuses to run without key, prices and a budget. */
function anthropic(opts = {}) {
  const c = { ...cfg, ...opts };
  return {
    name: 'anthropic', model: c.model,
    async complete({ system, prompt, engine = 'engine', maxTokens = c.maxOutputTokens }) {
      if (!c.apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
      if (!Number.isFinite(c.priceInPerMTok) || !Number.isFinite(c.priceOutPerMTok)) throw new Error('Set ENGINE_PRICE_IN_PER_MTOK and ENGINE_PRICE_OUT_PER_MTOK from the current price list so spend can be capped.');
      const inEst = Math.ceil((String(system || '').length + String(prompt).length) / 3);
      budget.assertCanSpend(budget.costUsd(inEst, maxTokens, c.priceInPerMTok, c.priceOutPerMTok), c);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens, system: system || undefined, messages: [{ role: 'user', content: String(prompt) }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Model API error ${res.status}: ${body?.error?.message || 'unknown'}`);
      const usage = { input: body.usage?.input_tokens || 0, output: body.usage?.output_tokens || 0 };
      budget.record({ engine, provider: 'anthropic', model: c.model, input_tokens: usage.input, output_tokens: usage.output, cost_usd: budget.costUsd(usage.input, usage.output, c.priceInPerMTok, c.priceOutPerMTok) }, c.dataDir);
      return { text: (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), usage };
    },
  };
}

function getProvider(name = cfg.provider) {
  if (name === 'anthropic') return anthropic();
  return mock;
}
module.exports = { getProvider, anthropic, mock };
