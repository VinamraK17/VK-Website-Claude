/**
 * Insights (monthly newsletter) — static wiring checks.
 * The rendering itself lives in lib/insights.ts; these guard the pieces that
 * silently break a deploy: nav links, templates, Docker copy, routes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Insights wiring', () => {
  for (const page of ['index', 'services', 'projects', 'experience', 'contact', 'privacy', 'insights', 'insight']) {
    test(`${page}.html links to /insights in desktop nav, mobile menu and footer`, () => {
      const c = read(`pages/${page}.html`);
      assert.ok(c.includes('data-nav-path="/insights"'), 'desktop nav link missing');
      assert.ok(/href="\/insights" onclick="toggleMenu\(\)"/.test(c), 'mobile menu link missing');
      assert.ok((c.match(/href="\/insights"/g) || []).length >= 3, 'footer link missing');
    });
  }

  test('article template has every placeholder the server fills', () => {
    const c = read('pages/insight.html');
    for (const key of ['TITLE', 'SUMMARY', 'URL', 'DATE_ISO', 'DATE', 'READING', 'CONTENT', 'JSON_LD', 'LINKEDIN']) {
      assert.ok(c.includes(`{{${key}}}`), `{{${key}}} missing from insight.html`);
    }
  });

  test('archive template has the list and robots placeholders', () => {
    const c = read('pages/insights.html');
    assert.ok(c.includes('{{LIST}}') && c.includes('{{ROBOTS}}'));
  });

  test('Docker image ships the content folder', () => {
    assert.ok(/COPY --from=builder \/app\/content \.\/content/.test(read('Dockerfile')));
  });

  test('server registers archive, feed, issue and sitemap routes', () => {
    const s = read('server.ts');
    for (const r of ['"/insights"', '"/insights/feed.xml"', '"/insights/:slug"', '"/sitemap.xml"']) {
      assert.ok(s.includes(`app.get(${r}`), `route ${r} missing`);
    }
    assert.ok(s.indexOf('app.get("/sitemap.xml"') < s.indexOf('app.use(express.static'),
      'dynamic sitemap must be registered before express.static or the static file wins');
  });

  test('raw HTML in Markdown is escaped, not rendered', () => {
    assert.ok(/renderer:\s*\{\s*html:/.test(read('lib/insights.ts')));
  });

  test('the authoring template is never published', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'content/insights/_TEMPLATE.md')));
    assert.ok(read('lib/insights.ts').includes('f.startsWith("_")'));
  });
});
