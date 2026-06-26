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
