/**
 * Newsletter (Insights) — subscriptions, consent and delivery.
 *
 * Privacy model, in one place so the code and the privacy notice agree:
 *  - Double opt-in. Nothing is sent until the confirmation button is pressed.
 *  - Stored per subscriber: email, status, source, consent wording version,
 *    timestamps, two random tokens, and which issues were sent. Nothing else.
 *  - Unconfirmed rows are deleted after RETENTION.pendingDays, unsubscribed
 *    rows after RETENTION.unsubscribedDays.
 *  - No open or click tracking: no pixels, no redirected links.
 *  - Every issue carries RFC 8058 one-click unsubscribe headers plus a link.
 *  - Unsubscribe feedback is stored without any link to the email address.
 *
 * The subscribe form only appears when sending is fully configured
 * (see newsletterConfig), so the site never collects addresses it cannot serve.
 */
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { escapeHtml, formatDate, type Insight } from "./insights";

export const CONSENT_VERSION = "2026-11-v1";
export const CONSENT_TEXT =
  "I agree to receive the monthly Insights letter by email. I can unsubscribe at any time with one click.";
export const RETENTION = { pendingDays: 7, unsubscribedDays: 30 };
const DAY = 24 * 60 * 60 * 1000;

export const FEEDBACK_REASONS: Record<string, string> = {
  "not-relevant": "Not relevant to my work",
  "too-long": "Too long to read",
  "linkedin": "I prefer reading on LinkedIn",
  "not-expected": "I didn't expect these emails",
  "quality": "Not what I hoped for",
  "other": "Something else",
};

// ── Configuration ───────────────────────────────────────────────────────────
export interface NewsletterConfig {
  enabled: boolean;
  missing: string[];
  publicUrl: string;
  from: string;
  replyTo?: string;
  testTo?: string;
  processor: string;
  sendIntervalMs: number;
  smtp: { host: string; port: number; user: string; pass: string };
}

export function newsletterConfig(env: NodeJS.ProcessEnv = process.env): NewsletterConfig {
  const required = ["NEWSLETTER_SMTP_HOST", "NEWSLETTER_SMTP_USER", "NEWSLETTER_SMTP_PASS", "NEWSLETTER_FROM", "NEWSLETTER_PROCESSOR"];
  const missing = required.filter(k => !(env[k] || "").trim());
  return {
    enabled: missing.length === 0,
    missing,
    publicUrl: (env.PUBLIC_URL || "https://vinamrakumar.com").replace(/\/+$/, ""),
    from: (env.NEWSLETTER_FROM || "").trim(),
    replyTo: (env.NEWSLETTER_REPLY_TO || "").trim() || undefined,
    testTo: (env.NEWSLETTER_TEST_TO || env.CONTACT_EMAIL || "").trim() || undefined,
    processor: (env.NEWSLETTER_PROCESSOR || "").trim(),
    sendIntervalMs: Math.max(100, parseInt(env.NEWSLETTER_SEND_INTERVAL_MS || "1000", 10) || 1000),
    smtp: {
      host: (env.NEWSLETTER_SMTP_HOST || "").trim(),
      port: parseInt(env.NEWSLETTER_SMTP_PORT || "587", 10) || 587,
      user: (env.NEWSLETTER_SMTP_USER || "").trim(),
      pass: env.NEWSLETTER_SMTP_PASS || "",
    },
  };
}

// ── Small helpers ───────────────────────────────────────────────────────────
export function normaliseEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length > 3 && email.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z0-9-]{2,}$/i.test(email);
}

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function isToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

export function cleanSource(raw: unknown): string {
  const s = String(raw ?? "");
  return /^(insights|issue:[a-z0-9-]{1,80})$/.test(s) ? s : "insights";
}

// ── Subscription lifecycle ──────────────────────────────────────────────────
// `db` is the Prisma client. Typed loosely so the module has no hard
// dependency on generated types.
type Db = any;

export type SubscribeResult =
  | { action: "confirm-sent"; subscriber: any }
  | { action: "already-confirmed" }
  | { action: "throttled" };

/**
 * Starts (or restarts) a subscription. The caller always shows the same
 * "check your inbox" page whatever the result, so the form cannot be used to
 * find out who is subscribed.
 */
export async function subscribe(db: Db, email: string, source: string, now = new Date()): Promise<SubscribeResult> {
  const existing = await db.subscriber.findUnique({ where: { email } });

  if (existing?.status === "confirmed") return { action: "already-confirmed" };

  if (existing?.status === "pending") {
    // Do not let the form be used to flood someone's inbox.
    if (now.getTime() - new Date(existing.requestedAt).getTime() < 10 * 60 * 1000) return { action: "throttled" };
    const subscriber = await db.subscriber.update({
      where: { id: existing.id },
      data: { requestedAt: now, source, consentVersion: CONSENT_VERSION, confirmToken: newToken() },
    });
    return { action: "confirm-sent", subscriber };
  }

  if (existing) {
    // Previously unsubscribed: start again from scratch, fresh consent.
    await db.subscriber.delete({ where: { id: existing.id } });
  }

  const subscriber = await db.subscriber.create({
    data: {
      email, source, status: "pending", consentVersion: CONSENT_VERSION, requestedAt: now,
      confirmToken: newToken(), unsubToken: newToken(),
    },
  });
  return { action: "confirm-sent", subscriber };
}

/** Returns the confirmed subscriber, "already" if it was confirmed before, or null. */
export async function confirmSubscription(db: Db, token: string, now = new Date()): Promise<any | "already" | null> {
  const s = await db.subscriber.findUnique({ where: { confirmToken: token } });
  if (!s) return null;
  if (s.status === "confirmed") return "already";
  if (s.status !== "pending") return null;
  if (now.getTime() - new Date(s.requestedAt).getTime() > RETENTION.pendingDays * DAY) return null;
  return db.subscriber.update({
    where: { id: s.id },
    data: { status: "confirmed", confirmedAt: now, unsubscribedAt: null },
  });
}

/** Unsubscribes and returns a one-time token for the optional feedback form. */
export async function unsubscribe(db: Db, token: string, now = new Date()): Promise<{ feedbackToken: string; wasActive: boolean } | null> {
  const s = await db.subscriber.findUnique({ where: { unsubToken: token } });
  if (!s) return null;
  const wasActive = s.status !== "unsubscribed";
  if (wasActive) {
    await db.subscriber.update({ where: { id: s.id }, data: { status: "unsubscribed", unsubscribedAt: now } });
  }
  const feedbackToken = newToken();
  if (wasActive) await db.unsubscribeFeedback.create({ data: { token: feedbackToken } });
  return { feedbackToken, wasActive };
}

/** "Unsubscribed by mistake": restores a subscription within the retention window. */
export async function resubscribe(db: Db, token: string, now = new Date()): Promise<boolean> {
  const s = await db.subscriber.findUnique({ where: { unsubToken: token } });
  if (!s || s.status !== "unsubscribed") return false;
  await db.subscriber.update({
    where: { id: s.id },
    data: { status: "confirmed", confirmedAt: now, unsubscribedAt: null, consentVersion: CONSENT_VERSION },
  });
  return true;
}

export async function saveFeedback(db: Db, token: string, reason: unknown, comment: unknown): Promise<boolean> {
  const r = String(reason ?? "");
  const c = String(comment ?? "").trim().slice(0, 500);
  if (!(r in FEEDBACK_REASONS) && !c) return false;
  const res = await db.unsubscribeFeedback.updateMany({
    where: { token, reason: null, comment: null },
    data: { reason: r in FEEDBACK_REASONS ? r : null, comment: c || null },
  });
  return res.count > 0;
}

/** Deletes unconfirmed and long-unsubscribed rows. Run hourly. */
export async function purgeExpired(db: Db, now = new Date()): Promise<{ pending: number; unsubscribed: number }> {
  const pending = await db.subscriber.deleteMany({
    where: { status: "pending", requestedAt: { lt: new Date(now.getTime() - RETENTION.pendingDays * DAY) } },
  });
  const unsubscribed = await db.subscriber.deleteMany({
    where: { status: "unsubscribed", unsubscribedAt: { lt: new Date(now.getTime() - RETENTION.unsubscribedDays * DAY) } },
  });
  return { pending: pending.count, unsubscribed: unsubscribed.count };
}

// ── Email content ───────────────────────────────────────────────────────────
export interface Email { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }

const EMAIL_STYLE = `
  body { margin:0; padding:0; background:#f4f4f2; }
  .wrap { max-width:600px; margin:0 auto; padding:32px 24px; background:#ffffff; color:#1a1a1a;
          font-family:-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:16px; line-height:1.65; }
  .eyebrow { font-family:Menlo, Consolas, monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#8a8a85; }
  h1 { font-size:26px; line-height:1.25; margin:12px 0 8px; letter-spacing:-0.01em; }
  h2 { font-size:20px; line-height:1.3; margin:32px 0 8px; }
  h3 { font-size:17px; margin:24px 0 6px; }
  p { margin:0 0 16px; }
  a { color:#8a6d0b; }
  blockquote { margin:0 0 16px; padding-left:14px; border-left:2px solid #d4af37; color:#555; font-style:italic; }
  hr { border:0; border-top:1px solid #e6e6e3; margin:32px 0; }
  ul, ol { padding-left:22px; margin:0 0 16px; }
  .btn { display:inline-block; background:#1a1a1a; color:#ffffff !important; text-decoration:none; padding:12px 22px; border-radius:6px; font-weight:600; }
  .foot { margin-top:40px; padding-top:20px; border-top:1px solid #e6e6e3; font-size:12px; line-height:1.6; color:#8a8a85; }
  .foot a { color:#8a8a85; }
`;

function emailShell(body: string, preheader = ""): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><style>${EMAIL_STYLE}</style></head>
<body><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<div class="wrap">${body}</div></body></html>`;
}

/** Turns article HTML into readable plain text for the text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => `${t} (${href})`)
    .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, (_, t) => `\n\n${t.toUpperCase()}\n`)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<hr[^>]*>/gi, "\n\n———\n\n")
    .replace(/<\/(p|blockquote|ul|ol)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function confirmEmail(cfg: NewsletterConfig, email: string, confirmToken: string): Email {
  const link = `${cfg.publicUrl}/newsletter/confirm?token=${confirmToken}`;
  const html = emailShell(`
    <div class="eyebrow">Insights · Vinamra Kumar</div>
    <h1>Confirm your subscription</h1>
    <p>Someone, hopefully you, asked to receive <strong>Insights</strong>, a monthly letter on AI in operations, at this address.</p>
    <p><a class="btn" href="${link}">Confirm subscription</a></p>
    <p>If you didn't ask for this, ignore this email. Nothing will be sent, and your address will be deleted within ${RETENTION.pendingDays} days.</p>
    <div class="foot">Vinamra Kumar · Zürich, Switzerland · <a href="${cfg.publicUrl}/privacy#newsletter">Privacy notice</a></div>`,
    "One click to confirm, then one email a month.");
  const text = `Confirm your subscription to Insights

Someone, hopefully you, asked to receive Insights, a monthly letter on AI in operations, at this address.

Confirm: ${link}

If you didn't ask for this, ignore this email. Nothing will be sent, and your address will be deleted within ${RETENTION.pendingDays} days.

Vinamra Kumar · Zürich, Switzerland · Privacy notice: ${cfg.publicUrl}/privacy#newsletter`;
  return { to: email, subject: "Confirm your subscription to Insights", html, text };
}

export function issueEmail(cfg: NewsletterConfig, issue: Insight, to: string, unsubToken: string, confirmedAt?: Date | string | null): Email {
  const webUrl = `${cfg.publicUrl}/insights/${issue.slug}`;
  const unsubUrl = `${cfg.publicUrl}/newsletter/unsubscribe?token=${unsubToken}`;
  // Relative links in an issue must become absolute inside an email.
  const content = issue.html.replace(/href="\//g, `href="${cfg.publicUrl}/`);
  const since = confirmedAt ? ` on ${formatDate(new Date(confirmedAt).toISOString().slice(0, 10))}` : "";
  const html = emailShell(`
    <div class="eyebrow">Insights · ${escapeHtml(formatDate(issue.date))}</div>
    <h1>${escapeHtml(issue.title)}</h1>
    ${issue.summary ? `<p style="color:#555">${escapeHtml(issue.summary)}</p>` : ""}
    <hr>
    ${content}
    <hr>
    <p><a href="${webUrl}">Read this issue on the web</a></p>
    <div class="foot">
      You're receiving this because you subscribed at vinamrakumar.com${escapeHtml(since)}.<br>
      <a href="${unsubUrl}">Unsubscribe with one click</a> · <a href="${cfg.publicUrl}/privacy#newsletter">Privacy notice</a><br>
      Vinamra Kumar · Zürich, Switzerland · Views are my own and do not represent any employer.
    </div>`, issue.summary);
  const text = `INSIGHTS · ${formatDate(issue.date)}

${issue.title.toUpperCase()}
${issue.summary ? `\n${issue.summary}\n` : ""}
${htmlToText(content)}

Read on the web: ${webUrl}

—
You're receiving this because you subscribed at vinamrakumar.com${since}.
Unsubscribe (one click): ${unsubUrl}
Privacy notice: ${cfg.publicUrl}/privacy#newsletter
Vinamra Kumar · Zürich, Switzerland · Views are my own and do not represent any employer.`;
  return {
    to, subject: issue.title, html, text,
    headers: {
      // RFC 8058: mail clients show their own Unsubscribe button and POST here.
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "List-Id": "Insights by Vinamra Kumar <insights.vinamrakumar.com>",
    },
  };
}

// ── Sending ─────────────────────────────────────────────────────────────────
export type SendFn = (mail: Email) => Promise<void>;

export function smtpSender(cfg: NewsletterConfig): SendFn {
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.port === 465,
    requireTLS: cfg.smtp.port !== 465,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
    pool: true,
    maxConnections: 1,
  });
  return async (mail) => {
    await transport.sendMail({
      from: cfg.from,
      replyTo: cfg.replyTo,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
  };
}

export interface SendJob {
  running: boolean; slug: string | null; mode: "test" | "all" | null;
  total: number; sent: number; failed: number; skipped: number;
  startedAt: string | null; finishedAt: string | null; lastError: string | null;
}

export const sendJob: SendJob = {
  running: false, slug: null, mode: null, total: 0, sent: 0, failed: 0, skipped: 0,
  startedAt: null, finishedAt: null, lastError: null,
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Sends one issue. "test" goes only to NEWSLETTER_TEST_TO. "all" goes to every
 * confirmed subscriber who has not already received this issue successfully,
 * so a send that stops halfway can simply be started again.
 */
export async function sendIssue(db: Db, cfg: NewsletterConfig, issue: Insight, mode: "test" | "all", send: SendFn): Promise<SendJob> {
  if (sendJob.running) throw new Error("A send is already running.");
  Object.assign(sendJob, {
    running: true, slug: issue.slug, mode, total: 0, sent: 0, failed: 0, skipped: 0,
    startedAt: new Date().toISOString(), finishedAt: null, lastError: null,
  });
  try {
    if (mode === "test") {
      if (!cfg.testTo) throw new Error("Set NEWSLETTER_TEST_TO (or CONTACT_EMAIL) to send a test.");
      sendJob.total = 1;
      await send({ ...issueEmail(cfg, issue, cfg.testTo, "test-link-does-nothing-0000"), subject: `[TEST] ${issue.title}` });
      sendJob.sent = 1;
      return sendJob;
    }
    const subs = await db.subscriber.findMany({ where: { status: "confirmed" }, orderBy: { id: "asc" } });
    const done = await db.newsletterDelivery.findMany({ where: { slug: issue.slug, ok: true } });
    const doneIds = new Set(done.map((d: any) => d.subscriberId));
    const todo = subs.filter((s: any) => !doneIds.has(s.id));
    sendJob.total = todo.length;
    sendJob.skipped = subs.length - todo.length;
    for (const s of todo) {
      // Re-read: the person may have unsubscribed while the send was running.
      const fresh = await db.subscriber.findUnique({ where: { id: s.id } });
      if (!fresh || fresh.status !== "confirmed") { sendJob.skipped++; continue; }
      try {
        await send(issueEmail(cfg, issue, fresh.email, fresh.unsubToken, fresh.confirmedAt));
        await db.newsletterDelivery.upsert({
          where: { subscriberId_slug: { subscriberId: s.id, slug: issue.slug } },
          create: { subscriberId: s.id, slug: issue.slug, ok: true },
          update: { ok: true, error: null, sentAt: new Date() },
        });
        sendJob.sent++;
      } catch (err: any) {
        const msg = String(err?.message ?? err).slice(0, 300);
        sendJob.failed++;
        sendJob.lastError = msg;
        await db.newsletterDelivery.upsert({
          where: { subscriberId_slug: { subscriberId: s.id, slug: issue.slug } },
          create: { subscriberId: s.id, slug: issue.slug, ok: false, error: msg },
          update: { ok: false, error: msg, sentAt: new Date() },
        });
      }
      await sleep(cfg.sendIntervalMs);
    }
    return sendJob;
  } catch (err: any) {
    sendJob.lastError = String(err?.message ?? err).slice(0, 300);
    throw err;
  } finally {
    sendJob.running = false;
    sendJob.finishedAt = new Date().toISOString();
  }
}

// ── Page fragments ──────────────────────────────────────────────────────────
export function subscribeFormHtml(source: string, heading = "Get the next issue by email"): string {
  return `
            <section id="subscribe" class="newsletter-box mt-12 p-6 md:p-8 border border-[var(--color-border)] rounded-2xl" aria-labelledby="subscribe-heading">
                <p class="text-[10px] font-mono uppercase tracking-widest text-[var(--color-accent)] font-bold">Insights · monthly</p>
                <h2 id="subscribe-heading" class="mt-3 text-xl md:text-2xl font-bold tracking-tight text-[var(--color-ink)]">${escapeHtml(heading)}</h2>
                <p class="mt-2 text-sm text-[var(--color-ink-faint)] font-light leading-relaxed">One email on the first Tuesday of each month. No tracking pixels, and every email has a one-click unsubscribe.</p>
                <form method="post" action="/newsletter/subscribe" class="mt-6 space-y-4">
                    <input type="hidden" name="source" value="${escapeHtml(source)}">
                    <div class="nl-hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>
                    <div class="flex flex-col sm:flex-row gap-3">
                        <label for="nl-email-${escapeHtml(source.replace(/[^a-z0-9]/g, "-"))}" class="sr-only">Email address</label>
                        <input id="nl-email-${escapeHtml(source.replace(/[^a-z0-9]/g, "-"))}" type="email" name="email" required maxlength="254" autocomplete="email" placeholder="you@company.com" class="nl-input flex-1">
                        <button type="submit" class="nl-button">Subscribe</button>
                    </div>
                    <label class="flex items-start gap-3 text-xs text-[var(--color-ink-faint)] font-light leading-relaxed cursor-pointer">
                        <input type="checkbox" name="consent" value="yes" required class="nl-check mt-0.5">
                        <span>${escapeHtml(CONSENT_TEXT)} See the <a href="/privacy#newsletter" class="underline hover:text-[var(--color-accent)]">privacy notice</a>.</span>
                    </label>
                </form>
            </section>`;
}

/** Values for pages/newsletter.html. `body` is trusted HTML built by the server. */
export function messagePage(title: string, heading: string, body: string, eyebrow = "Insights · newsletter"): Record<string, string> {
  return { TITLE: escapeHtml(title), EYEBROW: escapeHtml(eyebrow), HEADING: escapeHtml(heading), BODY: body };
}

export function feedbackFormHtml(feedbackToken: string, unsubToken: string): string {
  const options = Object.entries(FEEDBACK_REASONS).map(([k, label]) => `
                        <label class="flex items-center gap-3 text-sm font-light cursor-pointer"><input type="radio" name="reason" value="${k}" class="nl-check"> ${escapeHtml(label)}</label>`).join("");
  return `
                <form method="post" action="/newsletter/feedback" class="mt-10 p-6 border border-[var(--color-border)] rounded-2xl space-y-4">
                    <input type="hidden" name="token" value="${escapeHtml(feedbackToken)}">
                    <p class="text-sm font-bold text-[var(--color-ink)]">Optional: what made you leave?</p>
                    <p class="text-xs text-[var(--color-ink-faint)] font-light">Your answer helps me improve the letter. It is stored without your email address.</p>
                    <fieldset class="space-y-2"><legend class="sr-only">Reason</legend>${options}
                    </fieldset>
                    <label class="block text-xs text-[var(--color-ink-faint)] font-light">Anything else? (optional)
                        <textarea name="comment" maxlength="500" rows="3" class="nl-input mt-2 w-full"></textarea>
                    </label>
                    <button type="submit" class="nl-button">Send feedback</button>
                </form>
                <form method="post" action="/newsletter/resubscribe?token=${escapeHtml(unsubToken)}" class="mt-6">
                    <p class="text-xs text-[var(--color-ink-faint)] font-light">Unsubscribed by mistake? <button type="submit" class="underline hover:text-[var(--color-accent)]">Stay subscribed</button></p>
                </form>`;
}
