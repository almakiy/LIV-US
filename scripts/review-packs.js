// Builds an expert review pack (Excel) for every editorial library item, straight from content/library, with a fresh
// automated review report. For sending to reviewers before the items are loaded on a site.
//   npm run review-packs              writes review-packs/*.xlsx
//   npm run review-packs -- <folder>  writes into <folder>
const fs = require('fs');
const path = require('path');
const { loadLibrary } = require('../src/lib/library');
const { buildReviewPack, packName } = require('../src/lib/review-pack');
const { reviewDraft } = require('../engines/reviewer');

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'review-packs'));
  const { items, errors } = loadLibrary();
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; return; }
  fs.mkdirSync(out, { recursive: true });
  for (const it of items) {
    const a = { ...it, version: 1, ai_assisted: true };
    fs.writeFileSync(path.join(out, packName(a)), await buildReviewPack(a, await reviewDraft(a)));
  }
  console.log(`${items.length} review pack(s) written to ${out}`);
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; }).finally(() => require('../src/db').pool.end());
