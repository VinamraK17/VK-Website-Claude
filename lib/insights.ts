/**
 * Insights — the monthly newsletter archive at /insights.
 *
 * Each issue is one Markdown file in content/insights/. Files are read on every
 * request (there are only ever a handful), which is what makes scheduling work:
 * an issue whose `date` is in the future is deployed but stays hidden until that
 * day arrives in Zurich, with no restart needed.
 *
 * Files whose name starts with "_" are never published (templates, drafts).
 * See content/README.md for the authoring format.
 */
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";

export const SITE = "https://vinamrakumar.com";

export interface Insight {
  slug: string;
  title: string;
  date: string;          // YYYY-MM-DD
  summary: string;
  linkedin?: string;     // URL of the LinkedIn Newsletter edition, once it exists
  html: string;
  readingMinutes: number;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Raw HTML inside an issue is shown as text, never executed. Issues are written
// in Markdown; a pasted <script> or <iframe> from a draft must not reach the page.
const markdown = new Marked({
  gfm: true,
  renderer: { html: ({ text }: { text: string }) => escapeHtml(text) },
});

export function insightsDir(): string {
  return process.env.INSIGHTS_DIR || path.join(process.cwd(), "content", "insights");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Today's date in Zurich as YYYY-MM-DD, so an issue goes live at local midnight. */
export function todayInZurich(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Minimal front matter: `key: value` lines between two `---` fences. */
export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { meta, body: m[2] };
}

function parseFile(file: string): Insight | null {
  const name = path.basename(file, ".md");
  const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"));
  const slug = meta.slug || name;
  if (!SLUG_RE.test(slug)) { console.warn(`[insights] skipped ${name}: invalid slug "${slug}"`); return null; }
  if (!meta.title) { console.warn(`[insights] skipped ${name}: missing title`); return null; }
  if (!DATE_RE.test(meta.date || "")) { console.warn(`[insights] skipped ${name}: date must be YYYY-MM-DD`); return null; }
  if ((meta.published || "").toLowerCase() === "false") return null;
  const words = body.split(/\s+/).filter(Boolean).length;
  const linkedin = meta.linkedin && /^https:\/\/(www\.)?linkedin\.com\//.test(meta.linkedin) ? meta.linkedin : undefined;
  return {
    slug,
    title: meta.title,
    date: meta.date,
    summary: meta.summary || "",
    linkedin,
    html: markdown.parse(body, { async: false }) as string,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/** Published issues, newest first. Future-dated and unpublished files are excluded. */
export function loadInsights(dir = insightsDir(), today = todayInZurich()): Insight[] {
  if (!fs.existsSync(dir)) return [];
  const items: Insight[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md") || f.startsWith("_")) continue;
    try {
      const item = parseFile(path.join(dir, f));
      if (item && item.date <= today) items.push(item);
    } catch (err: any) {
      console.warn(`[insights] failed to read ${f}: ${err.message}`);
    }
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
}

/** Replace every {{KEY}} in a template. Values are inserted as given. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => (key in values ? values[key] : all));
}

export function renderListItems(items: Insight[]): string {
  if (items.length === 0) {
    return `<p class="text-sm text-[var(--color-ink-faint)] font-light">The first issue is on its way. In the meantime, the archive will appear here.</p>`;
  }
  return items.map(i => `
                <article class="py-8 border-b border-[var(--color-border)]">
                    <p class="text-[10px] font-mono uppercase tracking-widest text-[var(--color-ink)]/40">${escapeHtml(formatDate(i.date))} · ${i.readingMinutes} min read</p>
                    <h2 class="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-[var(--color-ink)]"><a href="/insights/${i.slug}" class="hover:text-[var(--color-accent)] transition-colors">${escapeHtml(i.title)}</a></h2>
                    ${i.summary ? `<p class="mt-3 text-sm text-[var(--color-ink-faint)] font-light leading-relaxed max-w-2xl">${escapeHtml(i.summary)}</p>` : ""}
                    <a href="/insights/${i.slug}" class="inline-block mt-4 text-[10px] font-mono uppercase tracking-widest text-[var(--color-accent)] hover:opacity-80">Read issue →</a>
                </article>`).join("\n");
}

export function renderArticleValues(i: Insight): Record<string, string> {
  const url = `${SITE}/insights/${i.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: i.title,
    description: i.summary,
    datePublished: i.date,
    author: { "@type": "Person", name: "Vinamra Kumar", url: SITE },
    mainEntityOfPage: url,
  };
  return {
    TITLE: escapeHtml(i.title),
    SUMMARY: escapeHtml(i.summary),
    URL: url,
    DATE_ISO: i.date,
    DATE: escapeHtml(formatDate(i.date)),
    READING: String(i.readingMinutes),
    CONTENT: i.html,
    // JSON in a <script> block: escape "<" so the content can never close the tag.
    JSON_LD: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
    LINKEDIN: i.linkedin
      ? `<a href="${escapeHtml(i.linkedin)}" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent)] hover:opacity-80">Read and discuss this issue on LinkedIn</a> · `
      : "",
  };
}

export function renderRss(items: Insight[]): string {
  const x = (s: string) => escapeHtml(s);
  const entries = items.map(i => `
    <item>
      <title>${x(i.title)}</title>
      <link>${SITE}/insights/${i.slug}</link>
      <guid isPermaLink="true">${SITE}/insights/${i.slug}</guid>
      <pubDate>${new Date(i.date + "T07:00:00Z").toUTCString()}</pubDate>
      <description>${x(i.summary)}</description>
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Insights | Vinamra Kumar</title>
    <link>${SITE}/insights</link>
    <atom:link href="${SITE}/insights/feed.xml" rel="self" type="application/rss+xml" />
    <description>A monthly letter on AI in operations, seen through a systems lens.</description>
    <language>en-gb</language>${entries}
  </channel>
</rss>
`;
}

/** Adds the archive and each issue to the static sitemap. */
export function extendSitemap(staticXml: string, items: Insight[]): string {
  const urls = [
    `  <url>\n    <loc>${SITE}/insights</loc>\n${items[0] ? `    <lastmod>${items[0].date}</lastmod>\n` : ""}    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
    ...items.map(i => `  <url>\n    <loc>${SITE}/insights/${i.slug}</loc>\n    <lastmod>${i.date}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>`),
  ].join("\n");
  return staticXml.replace("</urlset>", `\n  <!-- Insights (generated) -->\n${urls}\n</urlset>`);
}
