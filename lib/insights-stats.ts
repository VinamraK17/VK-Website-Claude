/**
 * Per-issue reading statistics for the admin Analytics tab.
 *
 * Built only from data the site already records: first-party page_view and
 * page_exit events (path, referrer, time on page, scroll depth) and the page a
 * newsletter sign-up came from. Nothing here adds tracking; it only groups
 * existing rows by Insights page.
 */

export type StatsEvent = {
  event: string;
  details: string;          // JSON as stored in Analytics.details
  sessionId: string | null;
  referrer: string | null;
};

export type StatsSubscriber = { source: string | null; status: string };

export type StatsIssue = { slug: string; title: string; issue?: number; date: string };

export type Sources = { linkedin: number; search: number; direct: number; internal: number; other: number };

export type PageStats = {
  path: string;
  label: string;
  date?: string;
  views: number;
  sessions: number;
  medianReadSec: number | null;
  finishedPct: number | null;   // share of measured visits that scrolled to the end
  measured: number;             // visits with a page_exit (time + scroll) recorded
  sources: Sources;
  signups: number;              // confirmed sign-ups from this page's form
  pendingSignups: number;
};

/** Scroll depth (percent) that counts as having read to the end. */
export const FINISHED_AT = 90;
/** Ignore exit timings above this: a tab left open is not reading time. */
export const MAX_READ_SEC = 60 * 60;

const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|search\.yahoo\.com|yahoo\.com|startpage\.com|qwant\.com|search\.brave\.com|yandex\.[a-z]+|baidu\.com)$/;

export function classifyReferrer(ref: string | null | undefined, ownHost = "vinamrakumar.com"): keyof Sources {
  if (!ref) return "direct";
  let host: string;
  try { host = new URL(ref).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "other"; }
  if (host === ownHost || host.endsWith("." + ownHost)) return "internal";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") return "linkedin";
  if (SEARCH_HOSTS.test(host)) return "search";
  return "other";
}

export function normalisePath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/")) return null;
  const clean = p.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "");
  return clean || "/";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function insightsStats(events: StatsEvent[], subscribers: StatsSubscriber[], issues: StatsIssue[]): { list: PageStats; issues: PageStats[] } {
  type Acc = { views: number; sessions: Set<string>; reads: number[]; depths: number[]; sources: Sources };
  const blank = (): Acc => ({ views: 0, sessions: new Set(), reads: [], depths: [], sources: { linkedin: 0, search: 0, direct: 0, internal: 0, other: 0 } });

  const LIST = "/insights";
  const acc = new Map<string, Acc>([[LIST, blank()]]);
  for (const i of issues) acc.set(`/insights/${i.slug.toLowerCase()}`, blank());

  for (const e of events) {
    if (e.event !== "page_view" && e.event !== "page_exit") continue;
    let d: any = {};
    try { d = JSON.parse(e.details || "{}"); } catch { continue; }
    const path = normalisePath(d.path);
    const a = path ? acc.get(path) : undefined;
    if (!a) continue;
    if (e.event === "page_view") {
      a.views++;
      if (e.sessionId) a.sessions.add(e.sessionId);
      a.sources[classifyReferrer(e.referrer || d.referrer)]++;
    } else {
      if (typeof d.duration === "number" && d.duration >= 0 && d.duration <= MAX_READ_SEC) a.reads.push(d.duration);
      if (typeof d.scrollDepth === "number") a.depths.push(d.scrollDepth);
    }
  }

  const signups = (source: string) => ({
    signups: subscribers.filter(s => s.source === source && s.status === "confirmed").length,
    pendingSignups: subscribers.filter(s => s.source === source && s.status === "pending").length,
  });

  const build = (path: string, label: string, source: string, date?: string): PageStats => {
    const a = acc.get(path)!;
    return {
      path, label, date,
      views: a.views,
      sessions: a.sessions.size,
      medianReadSec: median(a.reads),
      finishedPct: a.depths.length ? Math.round((a.depths.filter(x => x >= FINISHED_AT).length / a.depths.length) * 100) : null,
      measured: a.depths.length,
      sources: a.sources,
      ...signups(source),
    };
  };

  return {
    list: build(LIST, "Insights list page", "insights"),
    issues: [...issues]
      .sort((x, y) => (y.date || "").localeCompare(x.date || ""))
      .map(i => build(`/insights/${i.slug.toLowerCase()}`, (i.issue ? `#${i.issue} ` : "") + i.title, `issue:${i.slug}`, i.date)),
  };
}
