/**
 * Site visibility toggles — end-to-end behaviour.
 *
 * The first version of this feature passed every static check yet did nothing
 * in production (a stale cached shared.js). These tests run the real code:
 *
 *   1. HTTP: the real routes from lib/site-settings.ts on an Express app,
 *      backed by an in-memory store standing in for Prisma/SQLite.
 *   2. Browser: the real pre-paint head script and the real public/shared.js,
 *      executed in a VM against a minimal fake DOM.
 *   3. CSS: the shipped app.css hides every element the toggles must reach,
 *      and every Services link on every page is covered by those rules.
 *
 * Run:  npm test   OR   node --test tests/site-settings.e2e.test.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const lib = await tsImport('../lib/site-settings.ts', import.meta.url);

// ── In-memory stand-in for prisma.siteSettings ───────────────────────────────
function memoryStore(initial = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    failReads: false,
    siteSettings: {
      async findMany() {
        if (this._store.failReads) throw new Error('database unavailable');
        return [...rows].map(([key, value]) => ({ key, value }));
      },
      async upsert({ where, update, create }) {
        if (rows.has(where.key)) { if ('value' in update) rows.set(where.key, update.value); }
        else rows.set(create.key, create.value);
      },
    },
  };
}
function storeWithBackref(initial) {
  const s = memoryStore(initial);
  s.siteSettings._store = s;
  return s;
}

// ══════════════════════════════════════════════════════════════════════════════
//  1. HTTP behaviour
// ══════════════════════════════════════════════════════════════════════════════
describe('HTTP — site-settings routes, /services gate, sitemap', () => {
  let server, base, store, settings;
  const ADMIN = 'Bearer test-admin';

  before(async () => {
    store = storeWithBackref();
    settings = lib.createSiteSettings(store, { cacheMs: 60_000 });
    const app = express();
    app.use(express.json());
    const requireAdmin = (req, res, next) =>
      req.headers.authorization === ADMIN ? next() : res.status(401).json({ error: 'Unauthorized' });
    lib.registerSiteSettingsRoutes(app, settings, requireAdmin);
    app.get('/services', lib.servicesGate(settings), (_req, res) => res.send('SERVICES PAGE'));
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const post = (body, auth = ADMIN) => fetch(base + '/api/admin/site-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const get = () => fetch(base + '/api/site-settings');
  const reset = () => post({ show_services: true, show_availability: true, show_job_signals: true });

  test('GET returns everything visible when nothing has been saved yet', async () => {
    const res = await get();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { show_services: true, show_availability: true, show_job_signals: true });
  });

  test('GET sends Cache-Control: no-store so toggles are never served stale', async () => {
    assert.equal((await get()).headers.get('cache-control'), 'no-store');
  });

  test('POST without the admin token is rejected and changes nothing', async () => {
    assert.equal((await post({ show_services: false }, null)).status, 401);
    assert.equal((await post({ show_services: false }, 'Bearer wrong')).status, 401);
    assert.equal((await (await get()).json()).show_services, true);
  });

  test('switching Services off is visible on the very next GET, despite the 60 s cache', async () => {
    await get(); // warm the cache with show_services: true
    const res = await post({ show_services: false });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).updated, ['show_services']);
    assert.equal((await (await get()).json()).show_services, false);
    await reset();
  });

  test('each toggle is independent', async () => {
    await post({ show_job_signals: false });
    assert.deepEqual(await (await get()).json(), { show_services: true, show_availability: true, show_job_signals: false });
    await post({ show_availability: false, show_job_signals: true });
    assert.deepEqual(await (await get()).json(), { show_services: true, show_availability: false, show_job_signals: true });
    await reset();
  });

  for (const [label, body] of [
    ['string "false" instead of a boolean', { show_services: 'false' }],
    ['a number', { show_services: 0 }],
    ['an unknown key', { show_everything: false }],
    ['an empty object', {}],
    ['an array', [true]],
  ]) {
    test(`POST with ${label} is rejected with 400 and stores nothing`, async () => {
      const before = new Map(store.rows);
      assert.equal((await post(body)).status, 400);
      assert.deepEqual(store.rows, before);
    });
  }

  test('GET /services serves the page while Services is on', async () => {
    const res = await fetch(base + '/services', { redirect: 'manual' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'SERVICES PAGE');
  });

  test('GET /services redirects home (302, temporary) while Services is off', async () => {
    await post({ show_services: false });
    const res = await fetch(base + '/services', { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/');
    await reset();
  });

  test('if the database is unreachable, GET fails open and /services stays reachable', async () => {
    const isolated = storeWithBackref({ show_services: 'false' });
    const s = lib.createSiteSettings(isolated, { cacheMs: 0 });
    isolated.failReads = true;
    assert.deepEqual(await s.readOrDefault(), { show_services: true, show_availability: true, show_job_signals: true });
  });
});

describe('settings store — seeding and caching', () => {
  test('seedDefaults creates missing rows as "true" and never overwrites an admin choice', async () => {
    const store = storeWithBackref({ show_services: 'false' });
    await lib.createSiteSettings(store).seedDefaults();
    assert.equal(store.rows.get('show_services'), 'false');
    assert.equal(store.rows.get('show_availability'), 'true');
    assert.equal(store.rows.get('show_job_signals'), 'true');
  });

  test('reads are cached for cacheMs, then refreshed from the store', async () => {
    let t = 0;
    const store = storeWithBackref({ show_services: 'true' });
    const s = lib.createSiteSettings(store, { cacheMs: 1000, now: () => t });
    assert.equal((await s.read()).show_services, true);
    store.rows.set('show_services', 'false'); // changed outside write()
    t = 999;  assert.equal((await s.read()).show_services, true);
    t = 1000; assert.equal((await s.read()).show_services, false);
  });
});

describe('sitemap — /services entry removed while Services is off', () => {
  const xml = read('public/sitemap.xml');
  const out = lib.removeServicesFromSitemap(xml);
  const count = s => (s.match(/<url>/g) || []).length;

  test('the shipped sitemap contains a /services entry to begin with', () => {
    assert.match(xml, /<loc>[^<]*\/services<\/loc>/);
  });
  test('the /services entry is removed', () => {
    assert.doesNotMatch(out, /\/services<\/loc>/);
  });
  test('exactly one <url> block is removed and every other page is kept', () => {
    assert.equal(count(out), count(xml) - 1);
    for (const loc of xml.match(/<loc>[^<]*<\/loc>/g).filter(l => !l.endsWith('/services</loc>'))) {
      assert.ok(out.includes(loc), `${loc} must remain in the sitemap`);
    }
  });
  test('the result is still well-formed (balanced <url> tags, closing </urlset>)', () => {
    assert.equal((out.match(/<url>/g) || []).length, (out.match(/<\/url>/g) || []).length);
    assert.match(out.trim(), /<\/urlset>$/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  2. Browser behaviour (real scripts, fake DOM)
// ══════════════════════════════════════════════════════════════════════════════
function fakeElement(attrs = {}, text = '') {
  const a = new Map(Object.entries(attrs));
  return {
    attrs: a, textContent: text, dataset: {},
    hasAttribute: k => a.has(k), getAttribute: k => (a.has(k) ? a.get(k) : null),
    setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: k => a.delete(k),
  };
}
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

const PUBLIC_PAGES = fs.readdirSync(path.join(ROOT, 'pages')).filter(f => f.endsWith('.html') && f !== 'admin.html');
const headScriptOf = html => html.match(/<!-- Theme \+ site-visibility flash prevention[^>]*-->\s*<script>([\s\S]*?)<\/script>/)?.[1];

describe('browser — pre-paint head script', () => {
  const script = headScriptOf(read('pages/index.html'));
  const run = (stored) => {
    const root = fakeElement();
    vm.runInNewContext(script, { document: { documentElement: root }, localStorage: fakeStorage(stored) });
    return root;
  };

  test('every public page carries the identical pre-paint script', () => {
    assert.ok(script, 'index.html must contain the pre-paint script');
    for (const f of PUBLIC_PAGES) assert.equal(headScriptOf(read(`pages/${f}`)), script, `${f}: pre-paint script missing or different`);
  });

  test('applies the remembered settings before first paint', () => {
    const root = run({ vk_site_settings: JSON.stringify({ show_services: false, show_availability: true, show_job_signals: false }) });
    assert.ok(root.hasAttribute('data-hide-services'));
    assert.ok(!root.hasAttribute('data-hide-availability'));
    assert.ok(root.hasAttribute('data-hide-job-signals'));
  });

  test('still applies the saved theme', () => {
    assert.equal(run({ 'theme-mode': 'light' }).getAttribute('data-mode'), 'light');
  });

  test('first visit (nothing stored) hides nothing', () => {
    assert.equal(run({}).attrs.size, 0);
  });

  test('corrupt stored settings do not throw and hide nothing', () => {
    const root = run({ vk_site_settings: '{not json', 'theme-mode': 'dark' });
    assert.equal(root.getAttribute('data-mode'), 'dark');
    assert.ok(![...root.attrs.keys()].some(k => k.startsWith('data-hide-')));
  });
});

describe('browser — applySiteSettings() in public/shared.js', () => {
  function load({ response, contact = false } = {}) {
    const root = fakeElement();
    const els = {};
    let pills = [];
    if (contact) {
      const selected = { value: 'Enterprise AI Advisory' };
      const container = fakeElement();
      container.dataset.servicesOffDefault = 'Career Role';
      const pill = (text, serviceOnly) => {
        const b = fakeElement(serviceOnly ? { 'data-service-only': '' } : {}, text);
        b.click = () => { selected.value = text; };
        return b;
      };
      pills = [pill('Enterprise AI Advisory', true), pill('Fractional HoP', true), pill('Coaching', true),
               pill('Speaking', true), pill('Mentoring', false), pill('Career Role', false)];
      container.querySelectorAll = () => pills;
      els['interest-pills-container'] = container;
      els['selected-interest-input'] = selected;
    }
    const localStorage = fakeStorage();
    const ctx = {
      document: { documentElement: root, addEventListener() {}, getElementById: id => els[id] ?? null, querySelectorAll: () => [] },
      localStorage, sessionStorage: fakeStorage(), navigator: {}, performance: { now: () => 0 }, console,
      setTimeout, fetch: async () => (typeof response === 'function' ? response() : response),
    };
    ctx.window = ctx;
    ctx.window.addEventListener = () => {};
    vm.createContext(ctx);
    vm.runInContext(read('public/shared.js'), ctx);
    return { ctx, root, localStorage, els };
  }
  const ok = body => ({ ok: true, json: async () => body });

  test('sets the hide attributes from the server and remembers them for the next page load', async () => {
    const body = { show_services: false, show_availability: false, show_job_signals: true };
    const { ctx, root, localStorage } = load({ response: ok(body) });
    await ctx.applySiteSettings();
    assert.ok(root.hasAttribute('data-hide-services'));
    assert.ok(root.hasAttribute('data-hide-availability'));
    assert.ok(!root.hasAttribute('data-hide-job-signals'));
    assert.deepEqual(JSON.parse(localStorage.getItem('vk_site_settings')), body);
  });

  test('switching a section back on removes a remembered hide attribute', async () => {
    const { ctx, root } = load({ response: ok({ show_services: true, show_availability: true, show_job_signals: true }) });
    root.setAttribute('data-hide-services', ''); // as left by the pre-paint script
    await ctx.applySiteSettings();
    assert.ok(!root.hasAttribute('data-hide-services'));
  });

  test('a network error does not throw and leaves the page as it is', async () => {
    const { ctx, root } = load({ response: () => { throw new Error('offline'); } });
    await ctx.applySiteSettings();
    assert.equal(root.attrs.size, 0);
  });

  test('a non-200 response leaves the page as it is', async () => {
    const { ctx, root } = load({ response: { ok: false, json: async () => ({}) } });
    await ctx.applySiteSettings();
    assert.equal(root.attrs.size, 0);
  });

  test('contact form: with Services off, a selected service pill moves to "Career Role"', async () => {
    const { ctx, els } = load({ contact: true, response: ok({ show_services: false, show_availability: true, show_job_signals: true }) });
    await ctx.applySiteSettings();
    assert.equal(els['selected-interest-input'].value, 'Career Role');
  });

  test('contact form: a non-service selection is left alone when Services is off', async () => {
    const { ctx, els } = load({ contact: true, response: ok({ show_services: false, show_availability: true, show_job_signals: true }) });
    els['selected-interest-input'].value = 'Mentoring';
    await ctx.applySiteSettings();
    assert.equal(els['selected-interest-input'].value, 'Mentoring');
  });

  test('contact form: the default selection is unchanged while Services is on', async () => {
    const { ctx, els } = load({ contact: true, response: ok({ show_services: true, show_availability: true, show_job_signals: true }) });
    await ctx.applySiteSettings();
    assert.equal(els['selected-interest-input'].value, 'Enterprise AI Advisory');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  3. CSS coverage — the shipped stylesheet reaches every toggled element
// ══════════════════════════════════════════════════════════════════════════════
describe('CSS — shipped app.css hides everything the toggles control', () => {
  const css = read('public/app.css');
  const rules = [
    'html[data-hide-services] a[href="/services"]',
    'html[data-hide-services] #services-section',
    'html[data-hide-services] [data-service-only]',
    'html[data-hide-availability] #availability-badge',
    'html[data-hide-job-signals] #job-signals',
    'html:not([data-hide-services]) [data-services-off-only]',
  ];
  for (const r of rules) test(`app.css contains: ${r}`, () => assert.ok(css.includes(r), `missing selector ${r}`));

  test('app.css is in sync with shared.css (built file not forgotten)', () => {
    assert.ok(css.endsWith(read('public/shared.css') + '\n'),
      'public/app.css must end with public/shared.css. Run `npm run build:css` after editing shared.css.');
  });

  test('every Services <a> link on every page uses exactly href="/services", so the CSS rule matches it', () => {
    for (const f of PUBLIC_PAGES) {
      for (const [, href] of read(`pages/${f}`).matchAll(/<a\b[^>]*\bhref="([^"]*services[^"]*)"/gi)) {
        assert.equal(href, '/services', `${f}: link to ${href} would escape the hide rule; use href="/services"`);
      }
    }
  });

  test('index.html has all three toggled containers', () => {
    const html = read('pages/index.html');
    for (const id of ['services-section', 'availability-badge', 'job-signals']) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  });

  test('contact.html: every service-only paragraph has a services-off alternative', () => {
    const html = read('pages/contact.html');
    const paras = (html.match(/<p [^>]*data-service-only/g) || []).length;
    const alts  = (html.match(/<p [^>]*data-services-off-only/g) || []).length;
    assert.ok(paras > 0);
    assert.equal(alts, paras);
  });

  test('contact.html: the services-off default pill exists and is not service-only', () => {
    const html = read('pages/contact.html');
    const def = html.match(/data-services-off-default="([^"]+)"/)?.[1];
    assert.ok(def, 'interest pill container must declare data-services-off-default');
    const btn = html.match(new RegExp(`<button[^>]*selectInterest\\(this, '${def}'\\)[^>]*>`))?.[0];
    assert.ok(btn, `no pill for "${def}"`);
    assert.ok(!btn.includes('data-service-only'), `"${def}" must stay visible when Services is off`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  4. Wording sweep — no toggle-controlled phrase is left uncontrolled
// ══════════════════════════════════════════════════════════════════════════════
// The innermost element wrapping each phrase must carry the controlling
// attribute. Adding new service or job-search copy without wrapping it makes
// this fail, instead of the copy silently staying visible when toggled off.
describe('wording sweep — controlled phrases are wrapped on every public page', () => {
  const SWEPT_PAGES = PUBLIC_PAGES.filter(f => f !== 'services.html'); // /services redirects when off
  const body = html => html.slice(html.indexOf('<body'));               // skip <head> meta descriptions
  const innermostOpenTag = (html, at) => {
    const before = html.slice(0, at);
    const tags = [...before.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)];
    const stack = [];
    for (const m of tags) {
      if (/\/>$/.test(m[0]) || /^(i|br|img|input|meta|link)$/i.test(m[2])) continue;
      if (m[1]) { const i = stack.map(t => t.name).lastIndexOf(m[2].toLowerCase()); if (i !== -1) stack.splice(i); }
      else stack.push({ name: m[2].toLowerCase(), tag: m[0] });
    }
    return stack.at(-1)?.tag ?? '';
  };
  const RULES = [
    { attr: 'data-service-only', phrases: ['Work With Me', 'Available for engagements', 'advisory engagements',
      'commercial engagements', 'consulting roles', 'advisory conversation', 'AI strategy that ships',
      'transformation needs someone'] },
    { attr: 'data-job-signal', phrases: ['Open to VP'] },
  ];
  for (const { attr, phrases } of RULES) {
    for (const f of SWEPT_PAGES) {
      test(`${f}: every ${phrases.length > 1 ? 'service' : 'job-search'} phrase sits inside a [${attr}] element`, () => {
        const html = body(read(`pages/${f}`));
        for (const p of phrases) {
          for (let at = html.indexOf(p); at !== -1; at = html.indexOf(p, at + 1)) {
            const tag = innermostOpenTag(html, at);
            assert.ok(tag.includes(attr), `${f}: "${p}" is inside ${tag || '(no element)'}, which lacks ${attr}`);
          }
        }
      });
    }
  }

  test('contact.html: the Status & Availability card is controlled by the availability toggle', () => {
    const html = read('pages/contact.html');
    const card = html.indexOf('<div data-availability');
    assert.ok(card !== -1, 'status card must carry data-availability');
    const label = html.indexOf('Status & Availability');
    assert.ok(label > card && label < html.indexOf('Response time', card), 'the label must be inside the data-availability card');
  });

  test('every services-off alternative on index.html pairs with a services-on original', () => {
    const html = read('pages/index.html');
    const on  = (html.match(/data-service-only/g) || []).length;
    const off = (html.match(/data-services-off-only/g) || []).length;
    assert.equal(off, 4, 'expected alternatives for: hero badge, bio, CTA text, CTA button');
    assert.ok(on >= off);
  });
});
