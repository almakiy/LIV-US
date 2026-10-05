// Engine settings (environment variables, all optional). Engines run as a separate process and talk to the site only through the Content API.
require('dotenv').config({ quiet: true });
const path = require('path');
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

module.exports = {
  siteUrl: (process.env.ENGINE_SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  serviceKey: process.env.ENGINE_SERVICE_KEY || '',
  dataDir: path.resolve(process.env.ENGINE_DATA_DIR || path.join(__dirname, '..', 'data')),
  // Provider "mock" is offline, free and deterministic. "anthropic" is paid and refused unless a budget and prices are set.
  // "gemini" works the same way (GEMINI_API_KEY and an explicit ENGINE_MODEL).
  provider: process.env.ENGINE_PROVIDER || 'mock',
  model: process.env.ENGINE_MODEL || 'claude-sonnet-5-5',
  modelExplicit: Boolean(process.env.ENGINE_MODEL),
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  monthlyBudgetUsd: num(process.env.ENGINE_BUDGET_USD, 0),
  // Prices in USD per million tokens. No defaults on purpose: set them from the provider's current price list.
  priceInPerMTok: num(process.env.ENGINE_PRICE_IN_PER_MTOK, NaN),
  priceOutPerMTok: num(process.env.ENGINE_PRICE_OUT_PER_MTOK, NaN),
  maxOutputTokens: num(process.env.ENGINE_MAX_OUTPUT_TOKENS, 2000),
  enabled: process.env.ENGINES_ENABLED !== 'false',
};
