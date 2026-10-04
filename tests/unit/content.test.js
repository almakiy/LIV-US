const test = require('node:test');
const assert = require('node:assert');
const { slugify, renderMarkdown, readingMinutes, parseTags } = require('../../src/lib/content');

test('slugify makes clean URL slugs', () => {
  assert.strictEqual(slugify('ISO 9001: What It Means — Quality!'), 'iso-9001-what-it-means-quality');
  assert.strictEqual(slugify('  Hello   World  '), 'hello-world');
  assert.strictEqual(slugify('!!!'), '');
});

test('renderMarkdown strips scripts, event handlers, images and javascript: links', () => {
  const html = renderMarkdown('# T\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n[ok](https://a.com)');
  assert.ok(!/<script|onerror|<img|href="javascript:/i.test(html), html);
  assert.ok(html.includes('<h1>T</h1>'));
  assert.ok(html.includes('href="https://a.com"') && html.includes('nofollow'));
});

test('renderMarkdown keeps tables and lists', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two');
  assert.ok(html.includes('<table>') && html.includes('<li>one</li>'));
});

test('readingMinutes and parseTags', () => {
  assert.strictEqual(readingMinutes(''), 1);
  assert.strictEqual(readingMinutes('word '.repeat(450)), 2);
  assert.deepStrictEqual(parseTags('Safety, safety, ISO 9001,  , a<b>'), ['safety', 'iso 9001', 'ab']);
});
