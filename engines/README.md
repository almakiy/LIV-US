# LIV knowledge engines

Separate process that talks to the site only through the Content API (`docs/CONTENT-API.md`). Design and status: `docs/KNOWLEDGE-ENGINES.md`.

- `reviewer/`: the Reviewer engine (built). Deterministic checks plus a claim check (offline lexical, or a model).
- `lib/`: settings, spend guard, model access, site client.
- `data/standards-registry.json`: starter registry (humans must verify).
- Producer and Scout: not built.

```
npm run engine:review-file -- draft.json   # offline, free
npm run engine:review-queue                # needs ENGINE_SITE_URL and ENGINE_SERVICE_KEY
npm run engine:usage
```
Engines only ever create drafts and reports. A named human publishes.
