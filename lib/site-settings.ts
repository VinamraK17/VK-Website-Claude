/**
 * Site visibility toggles (admin → Settings).
 *
 * Three booleans, stored as "true"/"false" rows in the SiteSettings table:
 *   show_services      Services nav/footer links, homepage section, /services page,
 *                      sitemap entry and the service interest pill on /contact
 *   show_availability  "Available for engagements" badge in the homepage hero
 *   show_job_signals   "Open to VP / Head of Digital Product roles" line in the hero
 *
 * Kept out of server.ts so the routes can be exercised over HTTP in tests
 * against an in-memory store (see tests/site-settings.e2e.test.mjs).
 */
import type { Express, RequestHandler } from "express";

export const SETTINGS_KEYS = ["show_services", "show_availability", "show_job_signals"] as const;
export type SettingsKey = typeof SETTINGS_KEYS[number];
export type SiteSettingsMap = Record<SettingsKey, boolean>;

/** Everything visible. Used for first-deploy seeding and whenever the DB is unreachable. */
export const DEFAULT_SETTINGS: SiteSettingsMap = {
  show_services: true,
  show_availability: true,
  show_job_signals: true,
};

/** The slice of the Prisma client this module needs, so tests can supply a fake. */
export interface SettingsStore {
  siteSettings: {
    findMany(): Promise<Array<{ key: string; value: string }>>;
    upsert(args: {
      where: { key: string };
      update: { value?: string };
      create: { key: string; value: string };
    }): Promise<unknown>;
  };
}

export class SettingsValidationError extends Error {}

export function createSiteSettings(db: SettingsStore, opts: { cacheMs?: number; now?: () => number } = {}) {
  const cacheMs = opts.cacheMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let cache: { data: SiteSettingsMap; at: number } | null = null;

  /** Current settings. Anything other than an explicit "false" counts as on. */
  async function read(): Promise<SiteSettingsMap> {
    if (cache && now() - cache.at < cacheMs) return cache.data;
    const rows = await db.siteSettings.findMany();
    const data = Object.fromEntries(
      SETTINGS_KEYS.map(k => [k, rows.find(r => r.key === k)?.value !== "false"])
    ) as SiteSettingsMap;
    cache = { data, at: now() };
    return data;
  }

  /** Like read(), but fails open: if the DB is down, everything stays visible. */
  async function readOrDefault(): Promise<SiteSettingsMap> {
    try { return await read(); } catch { return { ...DEFAULT_SETTINGS }; }
  }

  /** Apply a partial update. Values must be real booleans; unknown keys are rejected. */
  async function write(updates: unknown): Promise<SettingsKey[]> {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new SettingsValidationError("Body must be a JSON object.");
    }
    const entries = Object.entries(updates as Record<string, unknown>);
    const unknown = entries.filter(([k]) => !(SETTINGS_KEYS as readonly string[]).includes(k)).map(([k]) => k);
    if (unknown.length) throw new SettingsValidationError(`Unknown setting(s): ${unknown.join(", ")}`);
    if (entries.length === 0) throw new SettingsValidationError("No settings provided.");
    const notBool = entries.filter(([, v]) => typeof v !== "boolean").map(([k]) => k);
    if (notBool.length) throw new SettingsValidationError(`Value must be true or false: ${notBool.join(", ")}`);

    for (const [key, value] of entries) {
      await db.siteSettings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    cache = null; // the next read sees the change immediately
    return entries.map(([k]) => k as SettingsKey);
  }

  /** Create any missing rows as "true". Never overwrites a value the admin has set. */
  async function seedDefaults(): Promise<void> {
    for (const key of SETTINGS_KEYS) {
      await db.siteSettings.upsert({ where: { key }, update: {}, create: { key, value: "true" } });
    }
  }

  return { read, readOrDefault, write, seedDefaults };
}

export type SiteSettings = ReturnType<typeof createSiteSettings>;

/** GET /api/site-settings (public) and POST /api/admin/site-settings (admin). */
export function registerSiteSettingsRoutes(app: Express, settings: SiteSettings, requireAdmin: RequestHandler): void {
  app.get("/api/site-settings", async (_req, res) => {
    // Never cache: a toggle must reach visitors on their next page load,
    // not after a browser or Cloudflare cache expires.
    res.setHeader("Cache-Control", "no-store");
    res.json(await settings.readOrDefault());
  });

  app.post("/api/admin/site-settings", requireAdmin, async (req, res) => {
    try {
      const updated = await settings.write(req.body);
      res.json({ ok: true, updated, settings: await settings.read() });
    } catch (err: any) {
      if (err instanceof SettingsValidationError) return res.status(400).json({ error: err.message });
      res.status(500).json({ error: "Could not save settings." });
    }
  });
}

/**
 * Middleware for GET /services: redirect home while Services is switched off.
 * 302 rather than 301, because the page is expected to come back.
 */
export function servicesGate(settings: SiteSettings): RequestHandler {
  return async (_req, res, next) => {
    const { show_services } = await settings.readOrDefault();
    if (!show_services) return res.redirect(302, "/");
    next();
  };
}

/** Remove the /services <url> entry from a sitemap document. */
export function removeServicesFromSitemap(xml: string): string {
  return xml.replace(/\s*<url>\s*<loc>[^<]*\/services<\/loc>[\s\S]*?<\/url>/, "");
}
