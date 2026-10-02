import nodemailer from "nodemailer";

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Contact notifications ────────────────────────────────────────────────
// Primary channel is ntfy, self-hosted beside this container. SMTP is an
// optional extra channel, used only when SMTP_HOST/USER/PASS are all set.
//
// Every attempt records its outcome on the Message row, so the admin console
// shows which submissions actually reached you. Silent failure is what made
// the old implementation useless: it logged to stdout and nothing else.
export type NotifyOutcome = { via: string; ok: boolean; error?: string };

// ntfy headers must be ASCII. The full, unmodified name stays in the body.
export function asciiHeader(value: string, max = 120): string {
  return value.replace(/[^\x20-\x7E]/g, "?").slice(0, max);
}

export async function notifyViaNtfy(name: string, email: string, message: string): Promise<NotifyOutcome> {
  const base = (process.env.NTFY_URL || "").replace(/\/+$/, "");
  const topic = process.env.NTFY_TOPIC || "";
  if (!base || !topic) {
    return { via: "ntfy", ok: false, error: "NTFY_URL or NTFY_TOPIC is not set" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: asciiHeader(`New contact: ${name}`),
    Priority: "high",
    Tags: "envelope",
  };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  if (process.env.NTFY_CLICK_URL) headers.Click = asciiHeader(process.env.NTFY_CLICK_URL, 300);

  const body = `${name} <${email}>\n\n${message}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${base}/${topic}`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { via: "ntfy", ok: false, error: `HTTP ${response.status} ${detail}`.trim().slice(0, 300) };
    }
    return { via: "ntfy", ok: true };
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "timed out after 8s" : String(err?.message ?? err);
    return { via: "ntfy", ok: false, error: reason.slice(0, 300) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyViaSmtp(name: string, email: string, message: string): Promise<NotifyOutcome | null> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(message);
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "465", 10),
      secure: (process.env.SMTP_PORT || "465") === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: `"${safeName}" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_EMAIL || "contact@vinamrakumar.com",
      replyTo: email,
      subject: `Portfolio contact from ${name}`,
      html: `
        <h3>New contact request</h3>
        <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${safeMessage}</p>
      `,
    });
    return { via: "smtp", ok: true };
  } catch (err: any) {
    return { via: "smtp", ok: false, error: String(err?.message ?? err).slice(0, 300) };
  }
}

// Returns what to persist on the Message row.
export async function notifyContact(name: string, email: string, message: string) {
  const outcomes: NotifyOutcome[] = [];
  outcomes.push(await notifyViaNtfy(name, email, message));
  const smtp = await notifyViaSmtp(name, email, message);
  if (smtp) outcomes.push(smtp);

  const delivered = outcomes.filter(o => o.ok);
  const failed = outcomes.filter(o => !o.ok);
  for (const o of failed) console.error(`[NOTIFY] ${o.via} failed: ${o.error}`);
  for (const o of delivered) console.log(`[NOTIFY] delivered via ${o.via}`);

  return {
    notified: delivered.length > 0,
    notifiedAt: delivered.length > 0 ? new Date() : null,
    notifyVia: delivered.map(o => o.via).join(",") || null,
    notifyError: failed.map(o => `${o.via}: ${o.error}`).join(" | ").slice(0, 500) || null,
  };
}
