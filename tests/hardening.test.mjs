/**
 * Hardening regression tests — VK Portfolio
 *
 * Covers:
 *   1. analytics rate-limit Map eviction (no unbounded memory growth)
 *   2. cache-busting version consistency across all HTML pages
 *   3. security_spec.md route accuracy against server.ts
 *   4. notify.test.mjs lifecycle hook scoping (before/after inside describe)
 *
 * Run:  npm test   OR   node --test tests/hardening.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const PAGES_DIR = path.join(ROOT, 'pages');
const TESTS_DIR = path.join(ROOT, 'tests');

const ALL_HTML = fs.readdirSync(PAGES_DIR)
  .filter(f => f.endsWith('.html'))
  .map(f => ({ name: f, content: fs.readFileSync(path.join(PAGES_DIR, f), 'utf8') }));

const SERVER_TS  = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
const SPEC_MD    = fs.readFileSync(path.join(ROOT, 'security_spec.md'), 'utf8');
const NOTIFY_TEST = fs.readFileSync(path.join(TESTS_DIR, 'notify.test.mjs'), 'utf8');

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — analytics rate-limit Map cleanup
// ══════════════════════════════════════════════════════════════════════════════
describe('analytics rate-limit Map — eviction timer', () => {
  test('server.ts declares a setInterval cleanup for analyticsAttempts', () => {
    // The timer must reference analyticsAttempts.delete so stale buckets are removed.
    // Verify there is a setInterval block that deletes from analyticsAttempts.
    // We search for the two tokens in proximity rather than a fragile single regex.
    const timerIdx  = SERVER_TS.indexOf('analyticsAttempts.delete(');
    assert.ok(timerIdx !== -1, 'analyticsAttempts.delete() not found in server.ts');
    const preceding = SERVER_TS.slice(Math.max(0, timerIdx - 400), timerIdx);
    assert.ok(
      preceding.includes('setInterval'),
      'server.ts must call analyticsAttempts.delete() inside a setInterval eviction loop'
    );
  });

  test('the analyticsAttempts cleanup timer calls .unref() so it does not block process exit', () => {
    // Extract the block that creates the analytics cleanup timer
    const blockStart = SERVER_TS.indexOf('analyticsAttempts.delete(');
    assert.ok(blockStart !== -1, 'analyticsAttempts.delete not found in server.ts');

    // Look for .unref() within ~200 chars after the delete call
    const window = SERVER_TS.slice(blockStart, blockStart + 200);
    assert.ok(
      window.includes('.unref()'),
      'The analyticsAttempts cleanup setInterval must call .unref() to avoid keeping the process alive'
    );
  });

  test('ANALYTICS_WINDOW_MS is used as the eviction threshold (not a hard-coded constant)', () => {
    // The cleanup loop should compare against ANALYTICS_WINDOW_MS, not a magic number
    const blockStart = SERVER_TS.indexOf('analyticsAttempts.delete(');
    const window = SERVER_TS.slice(Math.max(0, blockStart - 300), blockStart + 50);
    assert.ok(
      window.includes('ANALYTICS_WINDOW_MS'),
      'The eviction condition should reference ANALYTICS_WINDOW_MS for consistency with the rate-limit window'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — cache-busting version consistency
// ══════════════════════════════════════════════════════════════════════════════
describe('cache-busting version strings — consistency across pages', () => {
  // Collect every ?v=X.Y.Z found on shared.js and app.css references
  function extractVersions(content, asset) {
    const re = new RegExp(`${asset.replace('.', '\\.')}\\?v=([\\d.]+)`, 'g');
    return [...content.matchAll(re)].map(m => m[1]);
  }

  test('all pages that load shared.js use the same version', () => {
    const versions = new Set();
    for (const { name, content } of ALL_HTML) {
      for (const v of extractVersions(content, 'shared.js')) {
        versions.add(v);
        if (versions.size > 1) {
          assert.fail(
            `Version mismatch on shared.js: found ${[...versions].join(' and ')} — ` +
            `${name} has a different version than another page`
          );
        }
      }
    }
    assert.ok(versions.size <= 1, 'Expected at most one distinct shared.js version across all pages');
  });

  test('all pages that load app.css use the same version', () => {
    const versions = new Set();
    for (const { name, content } of ALL_HTML) {
      for (const v of extractVersions(content, 'app.css')) {
        versions.add(v);
        if (versions.size > 1) {
          assert.fail(
            `Version mismatch on app.css: found ${[...versions].join(' and ')} — ` +
            `${name} has a different version than another page`
          );
        }
      }
    }
    assert.ok(versions.size <= 1, 'Expected at most one distinct app.css version across all pages');
  });

  test('shared.js and app.css use the same version (in sync)', () => {
    const jsVersions  = new Set(ALL_HTML.flatMap(({ content }) => extractVersions(content, 'shared.js')));
    const cssVersions = new Set(ALL_HTML.flatMap(({ content }) => extractVersions(content, 'app.css')));
    if (jsVersions.size > 0 && cssVersions.size > 0) {
      assert.deepEqual(
        [...jsVersions].sort(),
        [...cssVersions].sort(),
        'shared.js and app.css should use the same cache-busting version'
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — security_spec.md route accuracy
// ══════════════════════════════════════════════════════════════════════════════
describe('security_spec.md — route names match server.ts', () => {
  // Routes the spec documents → expected Express registration in server.ts
  const specRoutes = [
    { label: '/insights (GET)',                       pattern: /app\.get\(["']\/insights["']/ },
    { label: '/newsletter/subscribe (POST)',           pattern: /app\.post\(["']\/newsletter\/subscribe["']/ },
    { label: '/newsletter/confirm (GET)',              pattern: /app\.get\(["']\/newsletter\/confirm["']/ },
    { label: '/newsletter/unsubscribe (GET)',          pattern: /app\.get\(["']\/newsletter\/unsubscribe["']/ },
    { label: '/api/admin/newsletter (GET)',            pattern: /app\.get\(["']\/api\/admin\/newsletter["']/ },
    { label: '/api/admin/newsletter/subscribers/:id (DELETE)', pattern: /app\.delete\(["']\/api\/admin\/newsletter\/subscribers\/:id["']/ },
    { label: '/api/admin/newsletter/send (POST)',      pattern: /app\.post\(["']\/api\/admin\/newsletter\/send["']/ },
  ];

  for (const { label, pattern } of specRoutes) {
    test(`server.ts registers ${label}`, () => {
      assert.match(SERVER_TS, pattern, `Expected server.ts to register ${label}`);
    });
  }

  test('security_spec.md does not reference /api/insights (stale route name)', () => {
    const idx = SPEC_MD.indexOf('`/api/insights`');
    assert.equal(idx, -1, 'security_spec.md still references /api/insights — correct route is /insights');
  });

  test('security_spec.md documents /insights (correct route name)', () => {
    assert.ok(
      SPEC_MD.includes('`/insights`'),
      'security_spec.md should document /insights (not /api/insights)'
    );
  });

  test('security_spec.md does not reference /api/admin/newsletter/subscribers as a GET endpoint', () => {
    // The correct GET is /api/admin/newsletter; /api/admin/newsletter/subscribers/:id is a DELETE
    const badPattern = /`\/api\/admin\/newsletter\/subscribers`.*GET/;
    assert.ok(
      !badPattern.test(SPEC_MD),
      'security_spec.md must not list /api/admin/newsletter/subscribers as a GET endpoint'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — notify.test.mjs lifecycle hook scoping
// ══════════════════════════════════════════════════════════════════════════════
describe('notify.test.mjs — before/after scoped inside describe()', () => {
  test('before() is declared inside describe(), not at module top level', () => {
    // Find position of "describe('ntfy notification'" and "before(async"
    const describeIdx = NOTIFY_TEST.indexOf("describe('ntfy notification'");
    const beforeIdx   = NOTIFY_TEST.indexOf('before(async');
    assert.ok(describeIdx !== -1, "describe('ntfy notification') not found");
    assert.ok(beforeIdx   !== -1, 'before(async ...) not found');
    assert.ok(
      beforeIdx > describeIdx,
      `before() must appear after describe() (inside it). Found before at ${beforeIdx}, describe at ${describeIdx}`
    );
  });

  test('after() is declared inside describe(), not at module top level', () => {
    const describeIdx = NOTIFY_TEST.indexOf("describe('ntfy notification'");
    const afterIdx    = NOTIFY_TEST.indexOf('after(');
    assert.ok(describeIdx !== -1, "describe('ntfy notification') not found");
    assert.ok(afterIdx    !== -1, 'after(...) not found');
    assert.ok(
      afterIdx > describeIdx,
      `after() must appear after describe() (inside it). Found after at ${afterIdx}, describe at ${describeIdx}`
    );
  });

  test('module-level before() is not present (hooks are scoped to describe)', () => {
    // Top-level before() appears before describe() in the source if it exists at module scope
    const describeIdx = NOTIFY_TEST.indexOf("describe('ntfy notification'");
    const beforeIdx   = NOTIFY_TEST.indexOf('before(');
    assert.ok(
      beforeIdx > describeIdx,
      'A top-level before() (before the describe block) was found — move it inside describe()'
    );
  });
});
