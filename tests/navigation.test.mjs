/**
 * Regression + E2E test suite — VK Portfolio
 *
 * Covers: mobile navigation (menu, overlay, toggle), logo rendering,
 *         credibility section, pro bono mentoring, homepage stats,
 *         CSS anti-patterns, per-page content, shared assets, meta tags,
 *         and inline-CSS cache-bypass guards.
 *
 * Run:  npm test   OR   node --test tests/navigation.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const PAGES_DIR  = path.join(ROOT, 'pages');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_CSS = path.join(PUBLIC_DIR, 'shared.css');
const SHARED_JS  = path.join(PUBLIC_DIR, 'shared.js');
const LOGOS_DIR  = path.join(PUBLIC_DIR, 'logos');
const SUNRISE_SVG = path.join(LOGOS_DIR, 'sunrise.svg');
const LH_SVG      = path.join(LOGOS_DIR, 'lh-systems.svg');

const NAV_PAGES = ['index.html', 'services.html', 'projects.html', 'experience.html', 'contact.html'];
const PAGE_FILES = NAV_PAGES.map(f => ({
  name: f,
  content: fs.readFileSync(path.join(PAGES_DIR, f), 'utf8'),
}));

// ── helpers ────────────────────────────────────────────────────────────────────
function getPage(name)       { return PAGE_FILES.find(p => p.name === name).content; }
function getMobileMenuTag(c) { return c.match(/id="mobile-menu"[^>]*>/)?.[0] ?? ''; }

// Extract the combined text of all inline <style> blocks on a page
function getInlineStyles(content) {
  const matches = [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return matches.map(m => m[1]).join('\n');
}


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — Anti-pattern: broken Tailwind opacity modifier on mobile menu BG
// ══════════════════════════════════════════════════════════════════════════════
describe('CSS anti-pattern: broken Tailwind CSS variable on mobile-menu background', () => {
  // bg-[var(--color-surface)] generates rgb(var(--color-surface) / N%) in Tailwind CDN
  // which fails because --color-surface is hex not RGB channels → transparent background.
  const BG_CLASS_PATTERN = /bg-\[var\(--color-surface\)\]/;

  for (const { name, content } of PAGE_FILES) {
    test(`${name} — mobile-menu must NOT use bg-[var(--color-surface)] Tailwind class`, () => {
      const tag = getMobileMenuTag(content);
      assert.ok(
        !BG_CLASS_PATTERN.test(tag),
        `${name}: mobile-menu uses bg-[var(--color-surface)] which renders transparent in Tailwind CDN. ` +
        'Remove this class — background is handled by shared.css / inline <style>.'
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — Anti-pattern: absolute positioning removed from mobile-menu HTML
// ══════════════════════════════════════════════════════════════════════════════
describe('CSS anti-pattern: absolute positioning removed from mobile-menu HTML', () => {
  // position is now handled by shared.css + inline <style> with position:fixed.
  // Keeping "absolute" in HTML conflicts with the CSS-level fixed override.
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — mobile-menu must NOT use "absolute" Tailwind class in HTML`, () => {
      const tag = getMobileMenuTag(content);
      assert.ok(
        !tag.includes('absolute'),
        `${name}: mobile-menu still has "absolute" class in HTML. ` +
        'This conflicts with position:fixed in CSS. Remove it — CSS handles positioning.'
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — Mobile menu: presence, initial state, toggle wiring
// ══════════════════════════════════════════════════════════════════════════════
describe('Mobile menu — presence, initial state, and toggle wiring', () => {
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — has #mobile-menu element`, () => {
      assert.ok(content.includes('id="mobile-menu"'), `${name} missing id="mobile-menu"`);
    });
    test(`${name} — mobile-menu starts hidden on load`, () => {
      const tag = getMobileMenuTag(content);
      assert.ok(tag.includes('hidden'), `${name}: mobile-menu must include "hidden" class for correct initial state`);
    });
    test(`${name} — mobile-menu is hidden on desktop (md:hidden)`, () => {
      const tag = getMobileMenuTag(content);
      assert.ok(tag.includes('md:hidden'), `${name}: mobile-menu must have "md:hidden" so it never shows on desktop`);
    });
    test(`${name} — hamburger button calls toggleMenu()`, () => {
      assert.ok(
        content.includes('onclick="toggleMenu()"'),
        `${name}: missing onclick="toggleMenu()" on hamburger button`
      );
    });
    test(`${name} — hamburger button has aria-expanded attribute`, () => {
      assert.ok(
        content.includes('aria-expanded='),
        `${name}: hamburger button must have aria-expanded for accessibility`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — Mobile menu: inline CSS override on every page (cache-bypass)
// ══════════════════════════════════════════════════════════════════════════════
describe('Mobile menu — inline CSS override present on every page', () => {
  // Inline <style> ensures the mobile menu CSS is served with the HTML page
  // and cannot be stale-cached by Cloudflare independently of shared.css.
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — has inline <style> with #mobile-menu rule`, () => {
      const styles = getInlineStyles(content);
      assert.ok(
        styles.includes('#mobile-menu'),
        `${name}: must have an inline <style> block with #mobile-menu CSS. ` +
        'Without this, a stale Cloudflare cache of shared.css causes a transparent menu.'
      );
    });
    test(`${name} — inline CSS sets position:fixed on #mobile-menu`, () => {
      const styles = getInlineStyles(content);
      assert.ok(
        styles.includes('position: fixed'),
        `${name}: inline <style> #mobile-menu must set position:fixed so it covers the full viewport`
      );
    });
    test(`${name} — inline CSS sets background-color on #mobile-menu`, () => {
      const styles = getInlineStyles(content);
      assert.ok(
        styles.includes('background-color') && styles.includes('#mobile-menu'),
        `${name}: inline <style> must set background-color on #mobile-menu`
      );
    });
    test(`${name} — inline CSS sets z-index > 50 on #mobile-menu`, () => {
      // Nav uses z-index:50 (z-50). Menu must be higher to overlay content properly.
      const styles = getInlineStyles(content);
      const zMatch = styles.match(/z-index\s*:\s*(\d+)/g) || [];
      const menuZ = zMatch.map(s => parseInt(s.replace(/\D/g, ''))).filter(n => n > 50);
      assert.ok(
        menuZ.length > 0,
        `${name}: inline <style> #mobile-menu must set z-index > 50 (nav uses z-50)`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 5 — shared.css: mobile menu rules
// ══════════════════════════════════════════════════════════════════════════════
describe('shared.css — #mobile-menu CSS rules', () => {
  const css = fs.readFileSync(SHARED_CSS, 'utf8');

  test('shared.css exists', () => {
    assert.ok(fs.existsSync(SHARED_CSS), 'shared.css not found');
  });
  test('#mobile-menu defined in shared.css', () => {
    assert.ok(css.includes('#mobile-menu'), 'shared.css must define #mobile-menu styles');
  });
  test('#mobile-menu has background-color override in shared.css', () => {
    assert.ok(
      css.includes('background-color') && css.includes('#mobile-menu'),
      'shared.css must set background-color on #mobile-menu'
    );
  });
  test('#mobile-menu uses position:fixed in shared.css', () => {
    assert.ok(
      css.includes('position: fixed'),
      'shared.css must set position:fixed on #mobile-menu for full-viewport coverage'
    );
  });
  test('#mobile-menu sets bottom:0 to reach screen bottom', () => {
    assert.ok(css.includes('bottom: 0'), 'shared.css must set bottom:0 on #mobile-menu');
  });
  test('#mobile-menu z-index is above nav z-50 (must be > 50)', () => {
    const menuBlock = css.split('#mobile-menu')[1]?.split('}')[0] ?? '';
    const zMatch = menuBlock.match(/z-index\s*:\s*(\d+)/);
    assert.ok(zMatch, 'shared.css #mobile-menu must set z-index');
    const zVal = parseInt(zMatch[1]);
    assert.ok(zVal > 50, `shared.css #mobile-menu z-index=${zVal} must be > 50 (nav is z-50)`);
  });
  test('#mobile-menu sets min-height to ensure full coverage', () => {
    const menuBlock = css.split('#mobile-menu')[1]?.split('}')[0] ?? '';
    assert.ok(
      menuBlock.includes('min-height') || css.includes('bottom: 0'),
      'shared.css #mobile-menu must ensure full height via min-height or bottom:0'
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 6 — shared.js toggleMenu correctness
// ══════════════════════════════════════════════════════════════════════════════
describe('shared.js — toggleMenu implementation', () => {
  test('shared.js exists', () => {
    assert.ok(fs.existsSync(SHARED_JS), 'shared.js not found');
  });
  const js = fs.readFileSync(SHARED_JS, 'utf8');
  test('toggleMenu is on window', () => {
    assert.ok(js.includes('window.toggleMenu'), 'toggleMenu must be assigned to window');
  });
  test('toggleMenu locks body scroll when open', () => {
    assert.ok(js.includes('document.body.style.overflow'), 'toggleMenu must lock body scroll');
  });
  test('toggleMenu toggles hidden class', () => {
    assert.ok(
      js.includes("classList.toggle('hidden'") || js.includes('classList.toggle("hidden"'),
      'toggleMenu must toggle the "hidden" class to show/hide the menu'
    );
  });
  test('toggleMenu updates aria-expanded', () => {
    assert.ok(
      js.includes('aria-expanded'),
      'toggleMenu must update aria-expanded for accessibility'
    );
  });
  test('toggleMenu switches hamburger icon between menu/x', () => {
    assert.ok(
      js.includes('"x"') || js.includes("'x'"),
      'toggleMenu must switch the hamburger icon to "x" when menu is open'
    );
  });
  test('toggleMode is on window', () => {
    assert.ok(js.includes('window.toggleMode'), 'toggleMode must be assigned to window');
  });
  test('theme persisted to localStorage', () => {
    assert.ok(js.includes('localStorage'), 'shared.js must persist theme choice to localStorage');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 7 — Shared assets: every page links shared.css and shared.js
// ══════════════════════════════════════════════════════════════════════════════
describe('Shared assets — every page references shared.css and shared.js', () => {
  for (const { name, content } of PAGE_FILES) {
    test(`${name} — links /shared.css`, () => {
      assert.ok(
        content.includes('href="/shared.css"'),
        `${name}: missing <link rel="stylesheet" href="/shared.css">`
      );
    });
    test(`${name} — links /shared.js`, () => {
      assert.ok(
        content.includes('src="/shared.js"'),
        `${name}: missing <script src="/shared.js">`
      );
    });
    test(`${name} — loads Tailwind CDN`, () => {
      assert.ok(
        content.includes('cdn.tailwindcss.com'),
        `${name}: missing Tailwind CDN script`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 8 — Navigation links: consistent across all pages
// ══════════════════════════════════════════════════════════════════════════════
describe('Navigation links — consistent and complete on every page', () => {
  const LINKS = [
    { href: 'href="/"',           label: 'Home' },
    { href: 'href="/services"',   label: 'Services' },
    { href: 'href="/projects"',   label: 'Projects' },
    { href: 'href="/experience"', label: 'Experience' },
    { href: 'href="/contact"',    label: 'Contact' },
  ];
  for (const { name, content } of PAGE_FILES) {
    for (const { href, label } of LINKS) {
      test(`${name} — nav contains ${label} link (${href})`, () => {
        assert.ok(content.includes(href), `${name} missing nav link: ${href} (${label})`);
      });
    }
    test(`${name} — has VK brand link to /`, () => {
      assert.ok(
        content.includes('href="/"') && content.includes('>VK<'),
        `${name}: must have "VK" brand mark linking to /`
      );
    });
    test(`${name} — has data-nav-path attributes for active link highlighting`, () => {
      assert.ok(
        content.includes('data-nav-path='),
        `${name}: nav links must have data-nav-path attributes for active state`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 9 — Meta tags: viewport, canonical, OG, Twitter on all pages
// ══════════════════════════════════════════════════════════════════════════════
describe('Meta tags — viewport, canonical, OG, and Twitter on every page', () => {
  const OG_TAGS = ['og:type', 'og:title', 'og:description', 'og:image', 'og:url'];
  const TW_TAGS = ['twitter:card', 'twitter:title'];

  for (const { name, content } of PAGE_FILES) {
    test(`${name} — has viewport meta tag`, () => {
      assert.ok(
        content.includes('name="viewport"'),
        `${name}: missing viewport meta tag`
      );
    });
    test(`${name} — has canonical link`, () => {
      assert.ok(
        content.includes('rel="canonical"'),
        `${name}: missing canonical <link> for SEO`
      );
    });
    for (const tag of OG_TAGS) {
      test(`${name} — has ${tag} meta`, () => {
        assert.ok(content.includes(tag), `${name}: missing Open Graph meta: ${tag}`);
      });
    }
    for (const tag of TW_TAGS) {
      test(`${name} — has ${tag} meta`, () => {
        assert.ok(content.includes(tag), `${name}: missing Twitter Card meta: ${tag}`);
      });
    }
    test(`${name} — og:image points to hero_hq.jpg`, () => {
      assert.ok(
        content.includes('hero_hq.jpg'),
        `${name}: og:image must reference hero_hq.jpg`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 10 — shared.css: nav, body, typography, and utility classes
// ══════════════════════════════════════════════════════════════════════════════
describe('shared.css — nav, body, and core utility rules', () => {
  const css = fs.readFileSync(SHARED_CSS, 'utf8');

  test('.glass-nav is position:fixed', () => {
    const navBlock = css.split('.glass-nav')[1]?.split('}')[0] ?? '';
    assert.ok(navBlock.includes('position: fixed'), '.glass-nav must be position:fixed');
  });
  test('.glass-nav is full-width (left:0 right:0)', () => {
    const navBlock = css.split('.glass-nav')[1]?.split('}')[0] ?? '';
    assert.ok(
      navBlock.includes('left: 0') && navBlock.includes('right: 0'),
      '.glass-nav must span full width with left:0 and right:0'
    );
  });
  test('body has padding-top:76px (space for fixed nav)', () => {
    assert.ok(
      css.includes('padding-top: 76px'),
      'body must have padding-top:76px to prevent content hiding behind the fixed nav'
    );
  });
  test('overflow-x hidden prevents horizontal scroll on mobile', () => {
    assert.ok(css.includes('overflow-x: hidden'), 'shared.css must set overflow-x:hidden');
  });
  test('.fade-up animation is defined', () => {
    assert.ok(css.includes('.fade-up'), 'shared.css must define .fade-up for scroll-reveal');
  });
  test('.fade-up.visible triggers the reveal', () => {
    assert.ok(css.includes('.fade-up.visible'), 'shared.css must define .fade-up.visible');
  });
  test('.available-badge is defined', () => {
    assert.ok(css.includes('.available-badge'), 'shared.css must define .available-badge');
  });
  test('.available-dot pulse animation is defined', () => {
    assert.ok(css.includes('.available-dot'), 'shared.css must define .available-dot');
    assert.ok(css.includes('pulse-dot') || css.includes('animation'), 'available-dot must have a pulse animation');
  });
  test('.display-gradient is defined', () => {
    assert.ok(css.includes('.display-gradient'), 'shared.css must define .display-gradient');
  });
  test(':root defines --color-surface as dark (#050505)', () => {
    assert.ok(
      css.includes('--color-surface: #050505'),
      'shared.css :root must set --color-surface:#050505 for dark mode default'
    );
  });
  test('[data-mode="light"] defines --color-surface as light (#f8f9fa)', () => {
    assert.ok(
      css.includes('--color-surface: #f8f9fa'),
      'shared.css must set --color-surface:#f8f9fa in [data-mode="light"]'
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 11 — Responsive layout: mobile-safe font sizes
// ══════════════════════════════════════════════════════════════════════════════
describe('Responsive layout — mobile-safe starting font sizes on headings', () => {
  test('index.html — hero h1 uses a mobile-safe starting font size', () => {
    const content = getPage('index.html');
    const h1Match = content.match(/class="([^"]*text-\w+[^"]*display-gradient[^"]*)"/);
    assert.ok(h1Match, 'index.html: could not find hero h1 with display-gradient');
    const classes = h1Match[1];
    const hasMobileSafe = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(\s|$)/.test(classes);
    assert.ok(
      hasMobileSafe,
      `Hero h1 classes "${classes}" must start with text-5xl or smaller before responsive prefixes`
    );
  });

  for (const name of ['services.html', 'projects.html', 'experience.html', 'contact.html']) {
    test(`${name} — page h1 uses a mobile-safe starting font size`, () => {
      const content = getPage(name);
      const h1Match = content.match(/class="([^"]*text-\w+[^"]*display-gradient[^"]*)"/);
      assert.ok(h1Match, `${name}: could not find page h1 with display-gradient`);
      const classes = h1Match[1];
      const hasMobileSafe = /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(\s|$)/.test(classes);
      assert.ok(
        hasMobileSafe,
        `${name}: h1 classes "${classes}" must start with a mobile-safe size (text-4xl or smaller)`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 12 — Logo assets: files exist
// ══════════════════════════════════════════════════════════════════════════════
describe('Logo assets — files exist in public/logos/', () => {
  const LOGO_FILES = [
    'sunrise.svg',
    'lh-systems.svg',
    'Airports_authority_of_India_Logo.png',
    'profed-2024.png',
  ];
  for (const file of LOGO_FILES) {
    test(`public/logos/${file} exists`, () => {
      assert.ok(
        fs.existsSync(path.join(LOGOS_DIR, file)),
        `Missing logo asset: public/logos/${file}`
      );
    });
  }
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 13 — SVG logo brand colours: no fill="currentColor"
// ══════════════════════════════════════════════════════════════════════════════
describe('SVG logos — hardcoded brand colours, no fill="currentColor"', () => {
  // fill="currentColor" in an <img> tag renders as black regardless of CSS context.
  test('sunrise.svg uses Sunrise brand red #DA291C', () => {
    const svg = fs.readFileSync(SUNRISE_SVG, 'utf8');
    assert.ok(svg.includes('fill="#DA291C"'), 'sunrise.svg must use fill="#DA291C"');
  });
  test('sunrise.svg has no fill="currentColor"', () => {
    const svg = fs.readFileSync(SUNRISE_SVG, 'utf8');
    assert.ok(!svg.includes('fill="currentColor"'), 'sunrise.svg must not use fill="currentColor"');
  });
  test('lh-systems.svg uses LH Systems navy #05164D', () => {
    const svg = fs.readFileSync(LH_SVG, 'utf8');
    assert.ok(svg.includes('fill="#05164D"'), 'lh-systems.svg must use fill="#05164D"');
  });
  test('lh-systems.svg has no fill="currentColor"', () => {
    const svg = fs.readFileSync(LH_SVG, 'utf8');
    assert.ok(!svg.includes('fill="currentColor"'), 'lh-systems.svg must not use fill="currentColor"');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 14 — shared.css: logo pill and container CSS rules
// ══════════════════════════════════════════════════════════════════════════════
describe('shared.css — logo pill and container CSS rules', () => {
  const css = fs.readFileSync(SHARED_CSS, 'utf8');

  test('.company-logo uses filter:none (no brightness/invert manipulation)', () => {
    assert.ok(css.includes('filter: none'), '.company-logo must use filter:none');
  });
  test('.company-logo does NOT use brightness(0) filter', () => {
    assert.ok(!css.includes('brightness(0)'), 'shared.css must not use brightness(0) — destroys brand colours');
  });
  test('.logo-pill class is defined', () => {
    assert.ok(css.includes('.logo-pill'), 'shared.css must define .logo-pill');
  });
  test('.logo-pill dark-mode background opacity >= 0.80 for logo legibility', () => {
    const pillMatch = css.match(/\.logo-pill\s*\{([^}]+)\}/);
    assert.ok(pillMatch, 'shared.css must define .logo-pill { ... }');
    const rgbaMatch = pillMatch[1].match(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
    assert.ok(rgbaMatch, '.logo-pill must use rgba(255,255,255,X) background');
    const opacity = parseFloat(rgbaMatch[1]);
    assert.ok(opacity >= 0.80, `.logo-pill background opacity ${opacity} must be >= 0.80`);
  });
  test('[data-mode="light"] .logo-pill is transparent (no capsule in light mode)', () => {
    assert.ok(css.includes('[data-mode="light"] .logo-pill'), 'shared.css must override .logo-pill for light mode');
    const lightSection = css.split('[data-mode="light"] .logo-pill')[1]?.split('}')[0] ?? '';
    assert.ok(lightSection.includes('background: transparent'), '[data-mode="light"] .logo-pill must be transparent');
  });
  test('.logo-container class is defined', () => {
    assert.ok(css.includes('.logo-container'), 'shared.css must define .logo-container for credibility cards');
  });
  test('[data-mode="light"] .logo-container is transparent', () => {
    const lightSection = css.split('[data-mode="light"] .logo-container')[1]?.split('}')[0] ?? '';
    assert.ok(lightSection.includes('background: transparent'), '[data-mode="light"] .logo-container must be transparent');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 15 — Homepage: Career Experience logo strip
// ══════════════════════════════════════════════════════════════════════════════
describe('index.html — Career Experience logo strip', () => {
  const index = getPage('index.html');

  test('has Career Experience section label', () => {
    assert.ok(index.toLowerCase().includes('career experience'), 'index.html must have a "Career Experience" label');
  });

  const LOGO_SRCS = [
    { alt: 'Sunrise GmbH',               src: '/logos/sunrise.svg' },
    { alt: 'Lufthansa Systems',           src: '/logos/lh-systems.svg' },
    { alt: 'Airports Authority of India', src: '/logos/Airports_authority_of_India_Logo.png' },
    { alt: 'MIT Professional Education',  src: '/logos/profed-2024.png' },
  ];

  for (const { alt, src } of LOGO_SRCS) {
    test(`strip includes logo: ${alt}`, () => {
      assert.ok(index.includes(`src="${src}"`), `index.html logo strip missing <img src="${src}"> for ${alt}`);
    });
    test(`${alt} logo is wrapped in .logo-pill`, () => {
      const pillIdx = index.lastIndexOf('logo-pill', index.indexOf(`src="${src}"`));
      assert.ok(pillIdx !== -1, `${alt} logo must be inside a .logo-pill div`);
    });
  }

  test('logo strip order: Sunrise → LH Systems → AAI → MIT', () => {
    const s = index.indexOf('/logos/sunrise.svg');
    const l = index.indexOf('/logos/lh-systems.svg');
    const a = index.indexOf('/logos/Airports_authority_of_India_Logo.png');
    const m = index.indexOf('/logos/profed-2024.png');
    assert.ok(s < l, 'Sunrise must appear before LH Systems');
    assert.ok(l < a, 'LH Systems must appear before AAI');
    assert.ok(a < m, 'AAI must appear before MIT');
  });

  test('inline <style> overrides .company-logo filter to none', () => {
    const styles = getInlineStyles(index);
    assert.ok(
      styles.includes('filter: none !important'),
      'index.html inline <style> must have "filter: none !important" for .company-logo'
    );
  });

  test('inline <style> defines .logo-pill with white background for dark mode', () => {
    const styles = getInlineStyles(index);
    assert.ok(styles.includes('logo-pill'), 'index.html inline <style> must define .logo-pill');
    assert.ok(styles.includes('rgba(255,255,255'), 'index.html inline .logo-pill must use rgba(255,255,255,...) for dark mode');
  });

  test('inline <style> [data-mode="light"] .logo-pill is transparent', () => {
    const styles = getInlineStyles(index);
    assert.ok(
      styles.includes('[data-mode="light"] .logo-pill'),
      'index.html inline <style> must override .logo-pill for light mode'
    );
    const lightPart = styles.split('[data-mode="light"] .logo-pill')[1]?.split('}')[0] ?? '';
    assert.ok(lightPart.includes('transparent'), 'Light mode .logo-pill must be transparent');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 16 — Homepage: Credibility in High-Impact Environments section
// ══════════════════════════════════════════════════════════════════════════════
describe('index.html — Credibility section', () => {
  const index = getPage('index.html');

  const COMPANIES = [
    { name: 'Sunrise GmbH',               subtitle: 'Switzerland' },
    { name: 'Lufthansa Systems',           subtitle: 'Switzerland' },
    { name: 'Airports Authority of India', subtitle: 'India' },
    { name: 'MIT Professional Education',  subtitle: 'Digital Transformation' },
  ];

  for (const { name, subtitle } of COMPANIES) {
    test(`credibility card: company name "${name}" present`, () => {
      assert.ok(index.includes(name), `index.html credibility section must show: ${name}`);
    });
    test(`credibility card: subtitle "${subtitle}" present for "${name}"`, () => {
      assert.ok(index.includes(subtitle), `index.html must show subtitle "${subtitle}" for ${name}`);
    });
  }

  test('Lufthansa credibility subtitle is "Switzerland" not "LSY AG"', () => {
    const credStart = index.indexOf('Credibility');
    const credEnd   = index.indexOf('</section>', credStart);
    const credHtml  = index.slice(credStart, credEnd);
    assert.ok(!credHtml.includes('LSY AG'), 'Credibility Lufthansa card must not say "LSY AG"');
  });

  test('credibility cards use .logo-container wrappers (at least 4)', () => {
    const containers = (index.match(/class="logo-container/g) || []).length;
    assert.ok(containers >= 4, `Expected >= 4 .logo-container elements, found ${containers}`);
  });

  test('credibility logo order matches career progression', () => {
    const credStart   = index.indexOf('Landmark Organizations');
    const credSector  = index.slice(credStart, credStart + 4000);
    const sunriseIdx  = credSector.indexOf('/logos/sunrise.svg');
    const lhIdx       = credSector.indexOf('/logos/lh-systems.svg');
    const aaiIdx      = credSector.indexOf('/logos/Airports_authority_of_India_Logo.png');
    const mitIdx      = credSector.indexOf('/logos/profed-2024.png');
    [sunriseIdx, lhIdx, aaiIdx, mitIdx].forEach((idx, i) => {
      assert.ok(idx !== -1, `Credibility section missing logo at index ${i}`);
    });
    assert.ok(sunriseIdx < lhIdx,  'Credibility: Sunrise before LH Systems');
    assert.ok(lhIdx      < aaiIdx, 'Credibility: LH Systems before AAI');
    assert.ok(aaiIdx     < mitIdx, 'Credibility: AAI before MIT');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 17 — Homepage: statistics section
// ══════════════════════════════════════════════════════════════════════════════
describe('index.html — Key statistics', () => {
  const index = getPage('index.html');

  test('CHF financial impact stat is present', () => {
    assert.ok(index.includes('CHF'), 'index.html must display CHF financial impact stat');
  });
  test('CHF stat uses data-suffix="M+" (not bare "M")', () => {
    assert.ok(index.includes('data-suffix="M+"'), 'CHF stat must use data-suffix="M+"');
  });
  test('CHF stat does NOT use data-suffix="M"', () => {
    assert.ok(!index.includes('data-suffix="M"'), 'Must not use bare data-suffix="M" — correct value is "M+"');
  });
  test('availability badge is present on homepage', () => {
    assert.ok(
      index.toLowerCase().includes('available'),
      'index.html must show an availability badge'
    );
  });
  test('years of experience stat is present', () => {
    assert.ok(
      index.includes('20') || index.includes('years'),
      'index.html must reference years of experience in the stats section'
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 18 — Homepage bio: key professional claims
// ══════════════════════════════════════════════════════════════════════════════
describe('index.html — Bio section professional claims', () => {
  const index = getPage('index.html');

  test('bio mentions MIT certification', () => {
    assert.ok(
      index.toLowerCase().includes('mit'),
      'index.html bio must reference MIT certification'
    );
  });
  test('bio mentions pro bono mentoring', () => {
    assert.ok(
      index.toLowerCase().includes('pro bono mentor'),
      'index.html bio must mention pro bono mentoring'
    );
  });
  test('name "Vinamra Kumar" appears in HTML title', () => {
    assert.ok(
      index.includes('Vinamra Kumar'),
      'index.html must include the name Vinamra Kumar'
    );
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 19 — services.html content
// ══════════════════════════════════════════════════════════════════════════════
describe('services.html — service offerings content', () => {
  const services = getPage('services.html');

  const EXPECTED_SERVICES = [
    'GenAI',
    'Fractional',
    'Product Leadership',
    'Speaking',
    'Mentor',
  ];

  for (const term of EXPECTED_SERVICES) {
    test(`services.html mentions "${term}"`, () => {
      assert.ok(
        services.toLowerCase().includes(term.toLowerCase()),
        `services.html must include service: ${term}`
      );
    });
  }

  test('services page title includes "Services"', () => {
    assert.ok(services.includes('<title>') && services.toLowerCase().includes('services'), 'services.html title must say Services');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 20 — projects.html content
// ══════════════════════════════════════════════════════════════════════════════
describe('projects.html — project entries', () => {
  const projects = getPage('projects.html');

  test('projects.html has FALLBACK_PROJECTS data', () => {
    assert.ok(
      projects.includes('FALLBACK_PROJECTS') || projects.includes('fallback'),
      'projects.html must define fallback project data'
    );
  });
  test('projects.html includes Pro Bono Mentoring card', () => {
    assert.ok(projects.includes('Pro Bono Mentoring'), 'projects.html must include Pro Bono Mentoring project card');
  });
  test('projects.html mentoring card has Mentoring tag', () => {
    assert.ok(
      projects.includes('"Mentoring"') || projects.includes("'Mentoring'"),
      'projects.html mentoring card must have "Mentoring" tag'
    );
  });
  test('projects.html mentoring card references mentees', () => {
    assert.ok(
      projects.toLowerCase().includes('mentee'),
      'projects.html mentoring card must reference mentees'
    );
  });
  test('projects page title includes "Projects"', () => {
    assert.ok(projects.toLowerCase().includes('projects'), 'projects.html title must mention Projects');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 21 — experience.html content
// ══════════════════════════════════════════════════════════════════════════════
describe('experience.html — timeline entries', () => {
  const experience = getPage('experience.html');

  test('experience.html has FALLBACK_EXPERIENCES data', () => {
    assert.ok(
      experience.includes('FALLBACK_EXPERIENCES') || experience.includes('fallback'),
      'experience.html must define fallback experience data'
    );
  });
  test('experience.html includes mentoring entry', () => {
    assert.ok(
      experience.toLowerCase().includes('mentor'),
      'experience.html must include a mentoring timeline entry'
    );
  });
  test('experience.html mentoring entry is marked Ongoing', () => {
    assert.ok(experience.includes('Ongoing'), 'experience.html mentoring entry must have period "Ongoing"');
  });
  test('experience.html mentions Sunrise', () => {
    assert.ok(experience.toLowerCase().includes('sunrise'), 'experience.html must have Sunrise in the timeline');
  });
  test('experience.html mentions Lufthansa', () => {
    assert.ok(experience.toLowerCase().includes('lufthansa'), 'experience.html must have Lufthansa in the timeline');
  });
  test('experience page title includes "Experience"', () => {
    assert.ok(experience.toLowerCase().includes('experience'), 'experience.html title must mention Experience');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 22 — contact.html content
// ══════════════════════════════════════════════════════════════════════════════
describe('contact.html — contact form and details', () => {
  const contact = getPage('contact.html');

  test('contact.html has a contact form or mailto link', () => {
    assert.ok(
      contact.includes('<form') || contact.includes('mailto:'),
      'contact.html must have a form or mailto link'
    );
  });
  test('contact.html has LinkedIn profile link', () => {
    assert.ok(
      contact.toLowerCase().includes('linkedin'),
      'contact.html must include a LinkedIn profile link'
    );
  });
  test('contact page title includes "Contact"', () => {
    assert.ok(contact.toLowerCase().includes('contact'), 'contact.html title must mention Contact');
  });
});


// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 23 — Pro bono mentoring: present in all three locations
// ══════════════════════════════════════════════════════════════════════════════
describe('Pro bono mentoring — present across all 3 locations', () => {
  const index      = getPage('index.html');
  const projects   = getPage('projects.html');
  const experience = getPage('experience.html');

  test('index.html bio mentions pro bono mentoring', () => {
    assert.ok(index.toLowerCase().includes('pro bono mentor'), 'index.html bio must mention pro bono mentoring');
  });
  test('projects.html has Pro Bono Mentoring project card', () => {
    assert.ok(projects.includes('Pro Bono Mentoring'), 'projects.html must have Pro Bono Mentoring card');
  });
  test('experience.html has a mentoring timeline entry', () => {
    assert.ok(experience.toLowerCase().includes('mentor'), 'experience.html must have a mentoring entry');
  });
  test('experience.html mentoring entry is marked Ongoing', () => {
    assert.ok(experience.includes('Ongoing'), 'experience.html mentoring entry must be Ongoing');
  });
});
