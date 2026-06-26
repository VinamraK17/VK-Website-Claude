/**
 * Regression tests — Mobile Navigation
 * Run:  npm test   OR   node --test tests/navigation.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const PAGES_DIR  = path.join(ROOT, 'pages');
const SHARED_CSS = path.join(ROOT, 'public', 'shared.css');
const SHARED_JS  = path.join(ROOT, 'public', 'shared.js');

const NAV_PAGES = ['index.html', 'services.html', 'projects.html', 'experience.html', 'contact.html'];
const PAGE_FILES = NAV_PAGES.map(f => ({
  name: f,
  content: fs.readFileSync(path.join(PAGES_DIR, f), 'utf8')
}));

// ─── 1. Anti-pattern: bg CSS variable + opacity modifier on mobile menu ────
// bg-[var(--color-surface)]/N fails silently: Tailwind generates
// rgb(var(--color-surface) / N%) but hex CSS vars cannot be used as channels.
// Result: transparent background, hero content bleeds through the open menu.
describe('CSS anti-pattern: CSS variable opacity modifier on mobile-menu background', () => {
  const PATTERN = /bg-\[var\(--color-surface\)\]\/\d+/g;
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — mobile-menu bg must not use /N opacity modifier`, () => {
      const tag = content.match(/id="mobile-menu"[^>]*>/)?.[0] ?? '';
      const hits = tag.match(PATTERN) || [];
      assert.equal(hits.length, 0,
        `${name}: mobile-menu has broken opacity modifier: ${hits.join(', ')}. ` +
        'Remove /N and use a background-color override in shared.css instead.'
      );
    });
  }
});

// ─── 2. shared.css must have the opaque override ───────────────────────────
describe('shared.css — solid background override for #mobile-menu', () => {
  test('shared.css exists', () => {
    assert.ok(fs.existsSync(SHARED_CSS), 'shared.css not found');
  });
  test('#mobile-menu has background-color override in shared.css', () => {
    const css = fs.readFileSync(SHARED_CSS, 'utf8');
    assert.ok(
      css.includes('#mobile-menu') && css.includes('background-color'),
      'shared.css must define background-color for #mobile-menu to prevent transparent bleed-through'
    );
  });
});

// ─── 3. Mobile menu presence & initial state ───────────────────────────────
describe('Mobile menu — presence and initial state', () => {
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — has #mobile-menu`, () => {
      assert.ok(content.includes('id="mobile-menu"'), `${name} missing id="mobile-menu"`);
    });
    test(`${name} — mobile-menu starts hidden`, () => {
      const tag = content.match(/id="mobile-menu"[^>]*>/)?.[0] ?? '';
      assert.ok(tag.includes('hidden'), `${name}: mobile-menu must include "hidden" class on load`);
    });
    test(`${name} — mobile-menu is absolutely positioned`, () => {
      const tag = content.match(/id="mobile-menu"[^>]*>/)?.[0] ?? '';
      assert.ok(tag.includes('absolute'), `${name}: mobile-menu should use absolute positioning`);
    });
    test(`${name} — hamburger button calls toggleMenu`, () => {
      assert.ok(content.includes('onclick="toggleMenu()"'), `${name}: missing onclick="toggleMenu()"`);
    });
  }
});

// ─── 4. shared.js toggleMenu correctness ──────────────────────────────────
describe('shared.js — toggleMenu implementation', () => {
  test('shared.js exists', () => {
    assert.ok(fs.existsSync(SHARED_JS), 'shared.js not found');
  });
  const js = fs.readFileSync(SHARED_JS, 'utf8');
  test('toggleMenu is on window', () => {
    assert.ok(js.includes('window.toggleMenu'), 'toggleMenu must be assigned to window');
  });
  test('toggleMenu locks body scroll', () => {
    assert.ok(js.includes('document.body.style.overflow'), 'toggleMenu must lock body scroll');
  });
  test('toggleMenu toggles hidden class', () => {
    assert.ok(
      js.includes("classList.toggle('hidden'") || js.includes('classList.toggle("hidden"'),
      'toggleMenu must toggle the hidden class'
    );
  });
});

// ─── 5. Navigation links consistent across all pages ──────────────────────
describe('Navigation links — consistent across all nav pages', () => {
  const LINKS = ['href="/"', 'href="/services"', 'href="/projects"', 'href="/experience"', 'href="/contact"'];
  for (const { name, content } of PAGE_FILES) {
    for (const href of LINKS) {
      test(`${name} — contains ${href}`, () => {
        assert.ok(content.includes(href), `${name} missing nav link: ${href}`);
      });
    }
  }
});

// ─── 6. Mobile menu must cover full viewport (fixed positioning) ───────────
describe('Mobile menu — full-viewport coverage', () => {
  test('shared.css uses fixed positioning for #mobile-menu', () => {
    const css = fs.readFileSync(SHARED_CSS, 'utf8');
    assert.ok(
      css.includes('#mobile-menu') && css.includes('position: fixed'),
      'shared.css must set position:fixed on #mobile-menu so it covers the full viewport below the nav'
    );
  });
  test('shared.css sets bottom:0 so menu reaches the screen bottom', () => {
    const css = fs.readFileSync(SHARED_CSS, 'utf8');
    assert.ok(
      css.includes('bottom: 0'),
      'shared.css must set bottom:0 on #mobile-menu so it fills the viewport height'
    );
  });
});

// ─── 7. Horizontal overflow prevention ────────────────────────────────────
describe('Responsive layout — no horizontal overflow', () => {
  test('shared.css sets overflow-x: hidden on body', () => {
    const css = fs.readFileSync(SHARED_CSS, 'utf8');
    assert.ok(
      css.includes('overflow-x: hidden'),
      'shared.css must set overflow-x:hidden to prevent horizontal scrolling on mobile'
    );
  });

  // Hero h1 on index must start at a mobile-safe size (text-5xl or smaller)
  // text-7xl (72px) in Space Grotesk can overflow on phones narrower than 390px
  test('index.html — hero h1 uses a mobile-safe starting font size', () => {
    const content = PAGE_FILES.find(f => f.name === 'index.html').content;
    const h1Match = content.match(/class="([^"]*text-\w+[^"]*display-gradient[^"]*)"/);
    assert.ok(h1Match, 'index.html: could not find hero h1 with display-gradient');
    const classes = h1Match[1];
    // Must NOT start at text-7xl or larger without a smaller mobile override
    const hasMobileSafe = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(\s|$)/.test(classes);
    assert.ok(
      hasMobileSafe,
      `index.html: hero h1 classes "${classes}" must include a mobile-safe size ` +
      '(text-5xl or smaller as the base, before sm:/md: breakpoint prefixes)'
    );
  });

  // Page h1s on inner pages must start at a mobile-safe size
  const INNER_PAGES = ['services.html', 'projects.html', 'experience.html', 'contact.html'];
  for (const name of INNER_PAGES) {
    test(`${name} — page h1 uses a mobile-safe starting font size`, () => {
      const content = PAGE_FILES.find(f => f.name === name).content;
      const h1Match = content.match(/class="([^"]*text-\w+[^"]*display-gradient[^"]*)"/);
      assert.ok(h1Match, `${name}: could not find page h1 with display-gradient`);
      const classes = h1Match[1];
      const hasMobileSafe = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(\s|$)/.test(classes);
      assert.ok(
        hasMobileSafe,
        `${name}: page h1 classes "${classes}" must include a mobile-safe base size ` +
        '(text-4xl or smaller before sm:/md: breakpoint prefixes)'
      );
    });
  }
});
