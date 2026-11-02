/**
 * Asset version guard — VK Portfolio
 *
 * shared.js and app.css are served with `Cache-Control: immutable, max-age=1y`
 * and only refreshed when the ?v= query string in the HTML changes. If either
 * file is edited without bumping ?v=, browsers and the Cloudflare edge keep
 * serving the old copy and the change silently never reaches visitors
 * (this is exactly how the site-visibility toggles first shipped broken).
 *
 * The fixture records the hash of each file at the current version. Changing a
 * file makes this suite fail until you:
 *   1. bump ?v= on every page in pages/*.html, and
 *   2. update tests/fixtures/asset-version.json (version + new hashes).
 *
 * Run:  npm test   OR   node --test tests/asset-version.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/asset-version.json'), 'utf8'));
const pages = fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html'))
  .map(f => ({ name: f, content: fs.readFileSync(path.join(ROOT, 'pages', f), 'utf8') }));

// CRLF-normalised so Windows checkouts and Linux CI produce the same hash.
const hashOf = rel => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8').replace(/\r\n/g, '\n'))
  .digest('hex');

describe('asset version guard — edits to cached assets must bump ?v=', () => {
  for (const asset of ['shared.js', 'app.css']) {
    test(`${asset} content matches the hash recorded for v${fixture.version}`, () => {
      assert.equal(
        hashOf(asset), fixture[asset],
        `${asset} changed since v${fixture.version}. Bump ?v= on every page and update ` +
        `tests/fixtures/asset-version.json, otherwise visitors keep the cached old file.`
      );
    });

    test(`every page referencing ${asset} uses ?v=${fixture.version}`, () => {
      const re = new RegExp(`${asset.replace('.', '\\.')}\\?v=([\\d.]+)`, 'g');
      for (const { name, content } of pages) {
        for (const [, v] of content.matchAll(re)) {
          assert.equal(v, fixture.version, `${name} loads ${asset}?v=${v}, expected ?v=${fixture.version}`);
        }
      }
    });
  }
});

// Cache-Control: no-store on /api/site-settings is verified over HTTP in
// tests/site-settings.e2e.test.mjs.
