/**
 * Site-settings feature toggle tests — VK Portfolio
 *
 * Covers:
 *   1. Prisma schema has SiteSettings model with correct fields
 *   2. server.ts seeds the three default keys (fail-open defaults)
 *   3. server.ts exposes GET /api/site-settings and POST /api/admin/site-settings
 *   4. index.html has the three toggleable section IDs
 *   5. contact.html has the data-service-pill attribute for JS-driven hiding
 *   6. shared.js has applySiteSettings() and calls it in DOMContentLoaded
 *   7. admin.html has the Settings tab button, panel, and three toggles
 *   8. admin.html loadSettings() and saveSetting() functions are present
 *
 * Run:  npm test   OR   node --test tests/site-settings.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SCHEMA    = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
const SERVER    = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
const SHARED_JS = fs.readFileSync(path.join(ROOT, 'public/shared.js'), 'utf8');
const INDEX     = fs.readFileSync(path.join(ROOT, 'pages/index.html'), 'utf8');
const CONTACT   = fs.readFileSync(path.join(ROOT, 'pages/contact.html'), 'utf8');
const ADMIN     = fs.readFileSync(path.join(ROOT, 'pages/admin.html'), 'utf8');

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Prisma schema
// ══════════════════════════════════════════════════════════════════════════════
describe('SiteSettings Prisma model', () => {
  test('schema.prisma declares the SiteSettings model', () => {
    assert.ok(SCHEMA.includes('model SiteSettings {'), 'SiteSettings model not found in schema.prisma');
  });

  test('SiteSettings has a String @id key field', () => {
    const modelStart = SCHEMA.indexOf('model SiteSettings {');
    const modelEnd   = SCHEMA.indexOf('}', modelStart);
    const block = SCHEMA.slice(modelStart, modelEnd);
    assert.ok(block.includes('key   String @id'), 'SiteSettings must have: key String @id');
  });

  test('SiteSettings has a value field', () => {
    const modelStart = SCHEMA.indexOf('model SiteSettings {');
    const modelEnd   = SCHEMA.indexOf('}', modelStart);
    const block = SCHEMA.slice(modelStart, modelEnd);
    assert.ok(block.includes('value String'), 'SiteSettings must have: value String');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — server.ts seeding and API
// ══════════════════════════════════════════════════════════════════════════════
describe('server.ts — site-settings seed and API endpoints', () => {
  const SETTING_KEYS = ['show_services', 'show_availability', 'show_job_signals'];

  for (const key of SETTING_KEYS) {
    test(`seeds "${key}" with a default value`, () => {
      assert.ok(
        SERVER.includes(`key: "${key}"`),
        `server.ts must upsert a default for "${key}" in seedData()`
      );
    });
  }

  test('GET /api/site-settings endpoint is registered', () => {
    assert.match(SERVER, /app\.get\(["']\/api\/site-settings["']/, 'GET /api/site-settings not found');
  });

  test('POST /api/admin/site-settings endpoint is registered', () => {
    assert.match(SERVER, /app\.post\(["']\/api\/admin\/site-settings["']/, 'POST /api/admin/site-settings not found');
  });

  test('POST /api/admin/site-settings requires admin auth (requireAdmin middleware)', () => {
    const idx = SERVER.indexOf('"/api/admin/site-settings"');
    assert.ok(idx !== -1, '/api/admin/site-settings not found in server.ts');
    const surrounding = SERVER.slice(idx - 10, idx + 60);
    assert.ok(
      surrounding.includes('requireAdmin'),
      'POST /api/admin/site-settings must pass requireAdmin middleware'
    );
  });

  test('settings cache is invalidated after a write (settingsCache = null)', () => {
    assert.ok(
      SERVER.includes('settingsCache = null'),
      'server.ts must set settingsCache = null after a successful admin write'
    );
  });

  test('GET /api/site-settings fails open (returns all-true on error)', () => {
    // Check the catch block returns safe defaults
    const getIdx = SERVER.indexOf('app.get("/api/site-settings"');
    const block  = SERVER.slice(getIdx, getIdx + 800);
    assert.ok(
      block.includes('show_services: true') && block.includes('show_availability: true'),
      'GET /api/site-settings catch block must return all-true defaults'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — index.html section IDs
// ══════════════════════════════════════════════════════════════════════════════
describe('index.html — toggleable section IDs', () => {
  test('availability badge has id="availability-badge"', () => {
    assert.ok(INDEX.includes('id="availability-badge"'), 'index.html: availability badge must have id="availability-badge"');
  });

  test('job signals paragraph has id="job-signals"', () => {
    assert.ok(INDEX.includes('id="job-signals"'), 'index.html: job-signals paragraph must have id="job-signals"');
  });

  test('services section has id="services-section"', () => {
    assert.ok(INDEX.includes('id="services-section"'), 'index.html: services section must have id="services-section"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — contact.html service pill attribute
// ══════════════════════════════════════════════════════════════════════════════
describe('contact.html — service pill data attribute', () => {
  test('interest-pills-container has data-service-pill attribute', () => {
    assert.ok(
      CONTACT.includes('data-service-pill='),
      'contact.html: #interest-pills-container must have a data-service-pill attribute for JS-driven hiding'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 5 — shared.js applySiteSettings
// ══════════════════════════════════════════════════════════════════════════════
describe('shared.js — applySiteSettings()', () => {
  test('applySiteSettings function is defined', () => {
    assert.ok(SHARED_JS.includes('async function applySiteSettings()'), 'shared.js must define applySiteSettings()');
  });

  test('applySiteSettings fetches /api/site-settings', () => {
    assert.ok(SHARED_JS.includes("fetch('/api/site-settings')"), 'applySiteSettings must fetch /api/site-settings');
  });

  test('applySiteSettings handles all three toggle keys', () => {
    const fn = SHARED_JS.slice(SHARED_JS.indexOf('async function applySiteSettings()'));
    assert.ok(fn.includes('show_availability'), 'applySiteSettings must handle show_availability');
    assert.ok(fn.includes('show_job_signals'),  'applySiteSettings must handle show_job_signals');
    assert.ok(fn.includes('show_services'),     'applySiteSettings must handle show_services');
  });

  test('applySiteSettings is called in DOMContentLoaded', () => {
    const boot = SHARED_JS.slice(SHARED_JS.indexOf("document.addEventListener('DOMContentLoaded'"));
    assert.ok(
      boot.includes('applySiteSettings()'),
      'applySiteSettings() must be called inside the DOMContentLoaded handler'
    );
  });

  test('applySiteSettings fails open (catch block does not throw)', () => {
    const fn = SHARED_JS.slice(SHARED_JS.indexOf('async function applySiteSettings()'));
    const catchIdx = fn.indexOf('} catch');
    assert.ok(catchIdx !== -1, 'applySiteSettings must have a catch block');
    // The catch block should be a no-op / comment — not a re-throw
    const catchBody = fn.slice(catchIdx, catchIdx + 80);
    assert.ok(!catchBody.includes('throw'), 'applySiteSettings catch block must not re-throw');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 6 — admin.html Settings tab
// ══════════════════════════════════════════════════════════════════════════════
describe('admin.html — Settings tab', () => {
  test('Settings tab button is present', () => {
    assert.ok(ADMIN.includes("data-tab=\"settings\""), 'admin.html must have a tab button with data-tab="settings"');
  });

  test('Settings tab panel is present with id="tab-settings"', () => {
    assert.ok(ADMIN.includes('id="tab-settings"'), 'admin.html must have a panel with id="tab-settings"');
  });

  test('switchTab handles the settings tab', () => {
    assert.ok(
      ADMIN.includes("'tab-settings'") || ADMIN.includes('"tab-settings"'),
      'switchTab() must toggle the tab-settings panel'
    );
  });

  const toggles = ['show_services', 'show_availability', 'show_job_signals'];
  for (const key of toggles) {
    test(`admin.html has a checkbox toggle for "${key}"`, () => {
      assert.ok(
        ADMIN.includes(`id="toggle-${key}"`),
        `admin.html must have a checkbox with id="toggle-${key}"`
      );
    });

    test(`checkbox for "${key}" calls saveSetting on change`, () => {
      assert.ok(
        ADMIN.includes(`saveSetting('${key}'`),
        `The ${key} toggle must call saveSetting('${key}', ...) on change`
      );
    });
  }

  test('loadSettings() function is defined in admin.html', () => {
    assert.ok(ADMIN.includes('async function loadSettings()'), 'admin.html must define loadSettings()');
  });

  test('saveSetting() function is defined in admin.html', () => {
    assert.ok(ADMIN.includes('async function saveSetting('), 'admin.html must define saveSetting()');
  });

  test('saveSetting POSTs to /api/admin/site-settings with Bearer TOKEN', () => {
    const fnIdx = ADMIN.indexOf('async function saveSetting(');
    const fn    = ADMIN.slice(fnIdx, fnIdx + 600);
    assert.ok(fn.includes('/api/admin/site-settings'), 'saveSetting must POST to /api/admin/site-settings');
    assert.ok(fn.includes("'Bearer ' + TOKEN"), 'saveSetting must include Bearer TOKEN auth header');
  });
});
