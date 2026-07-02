/**
 * Regression tests — VK Portfolio
 * Covers: mobile navigation, logo rendering, credibility section,
 *         pro bono mentoring, homepage stats, CSS anti-patterns.
 * Run:  npm test   OR   node --test tests/navigation.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const PAGES_DIR   = path.join(ROOT, 'pages');
const SHARED_CSS  = path.join(ROOT, 'public', 'shared.css');
const SHARED_JS   = path.join(ROOT, 'public', 'shared.js');
const LOGOS_DIR   = path.join(ROOT, 'public', 'logos');
const SUNRISE_SVG = path.join(LOGOS_DIR, 'sunrise.svg');
const LH_SVG      = path.join(LOGOS_DIR, 'lh-systems.svg');

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

// ─── 8. SVG logo asset files exist ────────────────────────────────────────
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

// ─── 9. SVG logo brand colours — no fill="currentColor" ───────────────────
// Using fill="currentColor" in an <img> tag renders as black regardless of
// CSS context, making logos invisible on dark backgrounds.
describe('SVG logos — hardcoded brand colours (not currentColor)', () => {
  test('sunrise.svg uses Sunrise brand red #DA291C', () => {
    const svg = fs.readFileSync(SUNRISE_SVG, 'utf8');
    assert.ok(
      svg.includes('fill="#DA291C"'),
      'sunrise.svg must use fill="#DA291C" — currentColor renders black in <img> tags'
    );
  });
  test('sunrise.svg has no fill="currentColor"', () => {
    const svg = fs.readFileSync(SUNRISE_SVG, 'utf8');
    assert.ok(
      !svg.includes('fill="currentColor"'),
      'sunrise.svg must not use fill="currentColor" — it renders black in <img> context'
    );
  });
  test('lh-systems.svg uses Lufthansa Systems navy #05164D', () => {
    const svg = fs.readFileSync(LH_SVG, 'utf8');
    assert.ok(
      svg.includes('fill="#05164D"'),
      'lh-systems.svg must use fill="#05164D" — currentColor renders black in <img> tags'
    );
  });
  test('lh-systems.svg has no fill="currentColor"', () => {
    const svg = fs.readFileSync(LH_SVG, 'utf8');
    assert.ok(
      !svg.includes('fill="currentColor"'),
      'lh-systems.svg must not use fill="currentColor" — it renders black in <img> context'
    );
  });
});

// ─── 10. shared.css logo CSS rules ────────────────────────────────────────
describe('shared.css — company logo rendering rules', () => {
  const css = fs.readFileSync(SHARED_CSS, 'utf8');

  test('.company-logo uses filter: none (no brightness/invert manipulation)', () => {
    assert.ok(
      css.includes('filter: none'),
      '.company-logo must use filter:none — brightness(0)/invert(1) destroys brand colours'
    );
  });
  test('.company-logo does NOT use brightness(0) filter', () => {
    // brightness(0) turns logos black; brightness(0) invert(1) turns them white
    assert.ok(
      !css.includes('brightness(0)'),
      'shared.css must not use brightness(0) on .company-logo — this overrides brand colours'
    );
  });
  test('.logo-pill class is defined in shared.css', () => {
    assert.ok(css.includes('.logo-pill'), 'shared.css must define .logo-pill for logo strip containers');
  });
  test('.logo-pill dark mode has high-opacity white background for dark-coloured logo visibility', () => {
    // Must have rgba(255,255,255,...) with opacity >= 0.80 so navy/maroon logos are legible
    const pillMatch = css.match(/\.logo-pill\s*\{([^}]+)\}/);
    assert.ok(pillMatch, 'shared.css must define .logo-pill { ... }');
    const rgbaMatch = pillMatch[1].match(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
    assert.ok(rgbaMatch, '.logo-pill must use rgba(255,255,255,X) background for dark mode contrast');
    const opacity = parseFloat(rgbaMatch[1]);
    assert.ok(
      opacity >= 0.80,
      `.logo-pill background opacity ${opacity} is too low — dark-coloured logos (e.g. navy) need >= 0.80`
    );
  });
  test('[data-mode="light"] .logo-pill has transparent background (no capsule in light mode)', () => {
    assert.ok(
      css.includes('[data-mode="light"] .logo-pill'),
      'shared.css must override .logo-pill for light mode'
    );
    const lightSection = css.split('[data-mode="light"] .logo-pill')[1]?.split('}')[0] ?? '';
    assert.ok(
      lightSection.includes('background: transparent'),
      '[data-mode="light"] .logo-pill must set background:transparent — no visible capsule in light mode'
    );
  });
  test('.logo-container class is defined in shared.css', () => {
    assert.ok(css.includes('.logo-container'), 'shared.css must define .logo-container for credibility cards');
  });
  test('[data-mode="light"] .logo-container has transparent background', () => {
    const lightSection = css.split('[data-mode="light"] .logo-container')[1]?.split('}')[0] ?? '';
    assert.ok(
      lightSection.includes('background: transparent'),
      '[data-mode="light"] .logo-container must use transparent background in light mode'
    );
  });
});

// ─── 11. Homepage — logo strip (Career Experience section) ────────────────
describe('index.html — Career Experience logo strip', () => {
  const index = fs.readFileSync(path.join(PAGES_DIR, 'index.html'), 'utf8');

  test('has Career Experience heading label', () => {
    assert.ok(
      index.toLowerCase().includes('career experience'),
      'index.html must include a "Career Experience" label above the logo strip'
    );
  });

  const LOGO_SRCS = [
    { alt: 'Sunrise GmbH',                src: '/logos/sunrise.svg' },
    { alt: 'Lufthansa Systems',            src: '/logos/lh-systems.svg' },
    { alt: 'Airports Authority of India',  src: '/logos/Airports_authority_of_India_Logo.png' },
    { alt: 'MIT Professional Education',   src: '/logos/profed-2024.png' },
  ];

  for (const { alt, src } of LOGO_SRCS) {
    test(`strip includes logo: ${alt}`, () => {
      assert.ok(
        index.includes(`src="${src}"`),
        `index.html logo strip must include <img src="${src}"> for ${alt}`
      );
    });
    test(`strip logo wrapped in .logo-pill: ${alt}`, () => {
      // The logo-pill div must appear before the img src in the source order
      const pillIdx = index.lastIndexOf('logo-pill', index.indexOf(`src="${src}"`));
      assert.ok(
        pillIdx !== -1,
        `${alt} logo must be wrapped in a .logo-pill div for dark-mode contrast`
      );
    });
  }

  test('logo strip order: Sunrise → LH Systems → AAI → MIT', () => {
    const sunriseIdx = index.indexOf('/logos/sunrise.svg');
    const lhIdx      = index.indexOf('/logos/lh-systems.svg');
    const aaiIdx     = index.indexOf('/logos/Airports_authority_of_India_Logo.png');
    const mitIdx     = index.indexOf('/logos/profed-2024.png');
    assert.ok(sunriseIdx < lhIdx,  'Sunrise must appear before LH Systems in logo strip');
    assert.ok(lhIdx      < aaiIdx, 'LH Systems must appear before AAI in logo strip');
    assert.ok(aaiIdx     < mitIdx, 'AAI must appear before MIT in logo strip');
  });

  test('inline <style> overrides filter to none with !important', () => {
    assert.ok(
      index.includes('filter: none !important'),
      'index.html inline <style> must include "filter: none !important" to override any cached shared.css'
    );
  });

  test('inline <style> sets .logo-pill white background for dark mode', () => {
    // Check that the inline style defines logo-pill with a high-opacity white background
    const styleBlock = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    assert.ok(
      styleBlock.includes('logo-pill'),
      'index.html inline <style> must define .logo-pill styles (cache-busting override)'
    );
    assert.ok(
      styleBlock.includes('rgba(255,255,255'),
      'index.html inline <style> .logo-pill must use rgba(255,255,255,...) for dark mode logo contrast'
    );
  });

  test('inline <style> sets [data-mode="light"] .logo-pill to transparent', () => {
    const styleBlock = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    assert.ok(
      styleBlock.includes('[data-mode="light"] .logo-pill'),
      'index.html inline <style> must override .logo-pill for light mode'
    );
    const lightPart = styleBlock.split('[data-mode="light"] .logo-pill')[1]?.split('}')[0] ?? '';
    assert.ok(
      lightPart.includes('transparent'),
      '[data-mode="light"] .logo-pill in inline style must be transparent — no visible capsule in light mode'
    );
  });
});

// ─── 12. Homepage — Credibility in High-Impact Environments section ────────
describe('index.html — Credibility section cards', () => {
  const index = fs.readFileSync(path.join(PAGES_DIR, 'index.html'), 'utf8');

  const COMPANIES = [
    { name: 'Sunrise GmbH',                subtitle: 'Switzerland' },
    { name: 'Lufthansa Systems',            subtitle: 'Switzerland' },
    { name: 'Airports Authority of India',  subtitle: 'India' },
    { name: 'MIT Professional Education',   subtitle: 'Digital Transformation' },
  ];

  for (const { name, subtitle } of COMPANIES) {
    test(`credibility card shows company name: "${name}"`, () => {
      assert.ok(
        index.includes(name),
        `index.html credibility section must display company name: ${name}`
      );
    });
    test(`credibility card subtitle correct for "${name}": "${subtitle}"`, () => {
      assert.ok(
        index.includes(subtitle),
        `index.html credibility section must show "${subtitle}" as subtitle for ${name}`
      );
    });
  }

  test('credibility section subtitle for Lufthansa is "Switzerland" not "LSY AG"', () => {
    // Extract only the credibility section to avoid false positives from other content
    const credStart = index.indexOf('Credibility');
    const credEnd   = index.indexOf('</section>', credStart);
    const credHtml  = index.slice(credStart, credEnd);
    assert.ok(
      !credHtml.includes('LSY AG'),
      'Credibility card for Lufthansa Systems must use "Switzerland" not "LSY AG"'
    );
  });

  test('each credibility card logo is wrapped in .logo-container', () => {
    const containers = (index.match(/class="logo-container/g) || []).length;
    assert.ok(
      containers >= 4,
      `Expected at least 4 .logo-container wrappers in credibility cards, found ${containers}`
    );
  });

  test('credibility logo order: Sunrise → LH Systems → AAI → MIT', () => {
    // Find the credibility section boundaries
    const credStart  = index.indexOf('Landmark Organizations');
    const credSector = index.slice(credStart, credStart + 4000);
    const sunriseIdx = credSector.indexOf('/logos/sunrise.svg');
    const lhIdx      = credSector.indexOf('/logos/lh-systems.svg');
    const aaiIdx     = credSector.indexOf('/logos/Airports_authority_of_India_Logo.png');
    const mitIdx     = credSector.indexOf('/logos/profed-2024.png');
    assert.ok(sunriseIdx !== -1, 'Credibility section must contain Sunrise logo');
    assert.ok(lhIdx      !== -1, 'Credibility section must contain LH Systems logo');
    assert.ok(aaiIdx     !== -1, 'Credibility section must contain AAI logo');
    assert.ok(mitIdx     !== -1, 'Credibility section must contain MIT logo');
    assert.ok(sunriseIdx < lhIdx,  'Credibility: Sunrise must come before LH Systems');
    assert.ok(lhIdx      < aaiIdx, 'Credibility: LH Systems must come before AAI');
    assert.ok(aaiIdx     < mitIdx, 'Credibility: AAI must come before MIT');
  });
});

// ─── 13. Pro bono mentoring — present across all three locations ───────────
describe('Pro bono mentoring — homepage bio, projects, experience', () => {
  const index      = fs.readFileSync(path.join(PAGES_DIR, 'index.html'),     'utf8');
  const projects   = fs.readFileSync(path.join(PAGES_DIR, 'projects.html'),  'utf8');
  const experience = fs.readFileSync(path.join(PAGES_DIR, 'experience.html'),'utf8');

  test('index.html bio section mentions pro bono mentoring', () => {
    assert.ok(
      index.toLowerCase().includes('pro bono mentor'),
      'index.html bio must mention pro bono mentoring'
    );
  });
  test('projects.html FALLBACK_PROJECTS includes Pro Bono Mentoring entry', () => {
    assert.ok(
      projects.includes('Pro Bono Mentoring'),
      'projects.html FALLBACK_PROJECTS must include a "Pro Bono Mentoring" project card'
    );
  });
  test('projects.html mentoring card has Mentoring tag', () => {
    assert.ok(
      projects.includes('"Mentoring"') || projects.includes("'Mentoring'"),
      'projects.html mentoring entry must have tag: "Mentoring"'
    );
  });
  test('projects.html mentoring card has stat about mentees', () => {
    assert.ok(
      projects.toLowerCase().includes('mentee'),
      'projects.html mentoring card must include a stat referencing mentees'
    );
  });
  test('experience.html FALLBACK_EXPERIENCES includes mentoring entry', () => {
    assert.ok(
      experience.toLowerCase().includes('mentor'),
      'experience.html FALLBACK_EXPERIENCES must include a mentoring experience entry'
    );
  });
  test('experience.html mentoring entry has role label', () => {
    assert.ok(
      experience.includes('Career & Leadership Mentor') ||
      experience.toLowerCase().includes('mentor'),
      'experience.html must show a mentor role in the timeline'
    );
  });
  test('experience.html mentoring entry marked as Ongoing', () => {
    assert.ok(
      experience.includes('Ongoing'),
      'experience.html mentoring entry must have period: "Ongoing"'
    );
  });
});

// ─── 14. Homepage stats — CHF 10M+ suffix correct ─────────────────────────
describe('index.html — key statistics', () => {
  const index = fs.readFileSync(path.join(PAGES_DIR, 'index.html'), 'utf8');

  test('CHF stat uses data-suffix="M+" (not "M")', () => {
    assert.ok(
      index.includes('data-suffix="M+"'),
      'index.html CHF stat must use data-suffix="M+" — was incorrectly "M" before'
    );
  });
  test('CHF stat does NOT use bare data-suffix="M"', () => {
    // data-suffix="M+" should be the only suffix for the CHF figure
    assert.ok(
      !index.includes('data-suffix="M"'),
      'index.html must not use data-suffix="M" — the correct value is "M+"'
    );
  });
  test('index.html shows CHF financial impact stat', () => {
    assert.ok(
      index.includes('CHF'),
      'index.html must include CHF stat in the hero statistics section'
    );
  });
});
