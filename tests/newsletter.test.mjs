/**
 * Newsletter — behaviour of the subscription lifecycle, the emails and the
 * send job, plus the wiring that a deploy depends on.
 * Runs the real lib/newsletter.ts against an in-memory database stand-in.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { createFakePrisma } from './helpers/fake-prisma.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let nl;
before(async () => { nl = await tsImport('../lib/newsletter.ts', import.meta.url); });

const CFG_ENV = {
  NEWSLETTER_SMTP_HOST: 'smtp.example.test', NEWSLETTER_SMTP_USER: 'u', NEWSLETTER_SMTP_PASS: 'p',
  NEWSLETTER_FROM: 'Vinamra Kumar <insights@vinamrakumar.com>', NEWSLETTER_PROCESSOR: 'Example relay',
  NEWSLETTER_TEST_TO: 'me@example.com', NEWSLETTER_SEND_INTERVAL_MS: '100',
};
const ISSUE = { slug: 'design-the-handoff', title: 'Design the handoff', date: '2026-11-03', summary: 'Sum', html: '<p>Hi <a href="/contact">contact</a></p>', readingMinutes: 6 };

describe('configuration', () => {
  test('disabled, listing what is missing, until all five settings exist', () => {
    const c = nl.newsletterConfig({});
    assert.equal(c.enabled, false);
    assert.deepEqual(c.missing, ['NEWSLETTER_SMTP_HOST', 'NEWSLETTER_SMTP_USER', 'NEWSLETTER_SMTP_PASS', 'NEWSLETTER_FROM', 'NEWSLETTER_PROCESSOR']);
    assert.equal(nl.newsletterConfig(CFG_ENV).enabled, true);
  });
});

describe('input checks', () => {
  test('email normalisation and validation', () => {
    assert.equal(nl.normaliseEmail('  Vin@Example.COM '), 'vin@example.com');
    assert.ok(nl.isValidEmail('vin@example.com'));
    for (const bad of ['', 'vin', 'vin@', '@x.com', 'a b@x.com', 'a@x', `${'a'.repeat(250)}@x.com`, 'a@x.com>']) {
      assert.ok(!nl.isValidEmail(bad), bad);
    }
  });
  test('source is whitelisted', () => {
    assert.equal(nl.cleanSource('issue:design-the-handoff'), 'issue:design-the-handoff');
    assert.equal(nl.cleanSource('<script>'), 'insights');
  });
  test('tokens are long and URL-safe', () => {
    const t = nl.newToken();
    assert.ok(nl.isToken(t) && t.length >= 30);
    assert.ok(!nl.isToken('../etc') && !nl.isToken('short'));
  });
});

describe('double opt-in lifecycle', () => {
  test('subscribe → pending; nothing confirmed without the token', async () => {
    const db = createFakePrisma();
    const r = await nl.subscribe(db, 'a@x.com', 'insights');
    assert.equal(r.action, 'confirm-sent');
    assert.equal(r.subscriber.status, 'pending');
    assert.equal(r.subscriber.consentVersion, nl.CONSENT_VERSION);
    assert.equal(await db.subscriber.count({ where: { status: 'confirmed' } }), 0);
  });

  test('confirming records the moment of consent', async () => {
    const db = createFakePrisma();
    const { subscriber } = await nl.subscribe(db, 'a@x.com', 'insights');
    const s = await nl.confirmSubscription(db, subscriber.confirmToken);
    assert.equal(s.status, 'confirmed');
    assert.ok(s.confirmedAt instanceof Date);
    assert.equal(await nl.confirmSubscription(db, subscriber.confirmToken), 'already');
  });

  test('confirmation links expire after the pending retention window', async () => {
    const db = createFakePrisma();
    const { subscriber } = await nl.subscribe(db, 'a@x.com', 'insights', new Date('2026-11-01T00:00:00Z'));
    assert.equal(await nl.confirmSubscription(db, subscriber.confirmToken, new Date('2026-11-09T00:00:00Z')), null);
  });

  test('re-submitting a pending address within 10 minutes sends nothing new', async () => {
    const db = createFakePrisma();
    const t0 = new Date('2026-11-01T10:00:00Z');
    await nl.subscribe(db, 'a@x.com', 'insights', t0);
    assert.equal((await nl.subscribe(db, 'a@x.com', 'insights', new Date(t0.getTime() + 60_000))).action, 'throttled');
    assert.equal((await nl.subscribe(db, 'a@x.com', 'insights', new Date(t0.getTime() + 11 * 60_000))).action, 'confirm-sent');
  });

  test('a confirmed address gets no email and no different answer', async () => {
    const db = createFakePrisma();
    const { subscriber } = await nl.subscribe(db, 'a@x.com', 'insights');
    await nl.confirmSubscription(db, subscriber.confirmToken);
    assert.equal((await nl.subscribe(db, 'a@x.com', 'insights')).action, 'already-confirmed');
  });
});

describe('unsubscribe, undo and feedback', () => {
  async function confirmed(db) {
    const { subscriber } = await nl.subscribe(db, 'a@x.com', 'insights');
    return nl.confirmSubscription(db, subscriber.confirmToken);
  }

  test('one call unsubscribes and opens one anonymous feedback slot', async () => {
    const db = createFakePrisma();
    const s = await confirmed(db);
    const r = await nl.unsubscribe(db, s.unsubToken);
    assert.equal(r.wasActive, true);
    assert.equal((await db.subscriber.findUnique({ where: { id: s.id } })).status, 'unsubscribed');
    const fb = await db.unsubscribeFeedback.findMany();
    assert.equal(fb.length, 1);
    assert.ok(!('email' in fb[0]) && !('subscriberId' in fb[0]), 'feedback must not be linked to the person');
  });

  test('repeat unsubscribe is harmless and opens no second feedback slot', async () => {
    const db = createFakePrisma();
    const s = await confirmed(db);
    await nl.unsubscribe(db, s.unsubToken);
    const again = await nl.unsubscribe(db, s.unsubToken);
    assert.equal(again.wasActive, false);
    assert.equal((await db.unsubscribeFeedback.findMany()).length, 1);
  });

  test('feedback can be given once, reasons are whitelisted, comments capped', async () => {
    const db = createFakePrisma();
    const s = await confirmed(db);
    const { feedbackToken } = await nl.unsubscribe(db, s.unsubToken);
    assert.equal(await nl.saveFeedback(db, feedbackToken, 'made-up', ''), false);
    assert.equal(await nl.saveFeedback(db, feedbackToken, 'linkedin', 'x'.repeat(900)), true);
    assert.equal(await nl.saveFeedback(db, feedbackToken, 'quality', ''), false);
    const [fb] = await db.unsubscribeFeedback.findMany();
    assert.equal(fb.reason, 'linkedin');
    assert.equal(fb.comment.length, 500);
  });

  test('"stay subscribed" restores the subscription', async () => {
    const db = createFakePrisma();
    const s = await confirmed(db);
    await nl.unsubscribe(db, s.unsubToken);
    assert.equal(await nl.resubscribe(db, s.unsubToken), true);
    assert.equal((await db.subscriber.findUnique({ where: { id: s.id } })).status, 'confirmed');
  });

  test('unknown tokens do nothing', async () => {
    const db = createFakePrisma();
    assert.equal(await nl.unsubscribe(db, nl.newToken()), null);
    assert.equal(await nl.confirmSubscription(db, nl.newToken()), null);
  });
});

describe('retention', () => {
  test('purges unconfirmed after 7 days and unsubscribed after 30, keeps the rest', async () => {
    const db = createFakePrisma();
    const t0 = new Date('2026-11-01T00:00:00Z');
    await nl.subscribe(db, 'pending-old@x.com', 'insights', t0);
    const keep = await nl.subscribe(db, 'confirmed@x.com', 'insights', t0);
    await nl.confirmSubscription(db, keep.subscriber.confirmToken, t0);
    const gone = await nl.subscribe(db, 'unsub@x.com', 'insights', t0);
    const g = await nl.confirmSubscription(db, gone.subscriber.confirmToken, t0);
    await nl.unsubscribe(db, g.unsubToken, t0);

    let r = await nl.purgeExpired(db, new Date('2026-11-09T00:00:00Z'));
    assert.deepEqual(r, { pending: 1, unsubscribed: 0 });
    r = await nl.purgeExpired(db, new Date('2026-12-02T00:00:00Z'));
    assert.deepEqual(r, { pending: 0, unsubscribed: 1 });
    assert.deepEqual((await db.subscriber.findMany()).map(s => s.email), ['confirmed@x.com']);
  });
});

describe('emails', () => {
  test('issue email carries RFC 8058 one-click headers and a visible link', () => {
    const cfg = nl.newsletterConfig(CFG_ENV);
    const m = nl.issueEmail(cfg, ISSUE, 'a@x.com', 'TOKEN_abcdefghijklmnopqrstuv', '2026-11-02T10:00:00Z');
    const url = 'https://vinamrakumar.com/newsletter/unsubscribe?token=TOKEN_abcdefghijklmnopqrstuv';
    assert.equal(m.headers['List-Unsubscribe'], `<${url}>`);
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(m.html.includes(url) && m.text.includes(url));
    assert.ok(m.html.includes('href="https://vinamrakumar.com/contact"'), 'relative links must become absolute');
    assert.ok(!/<img/i.test(m.html), 'no tracking pixels');
  });

  test('confirmation email links to the confirm page and states retention', () => {
    const cfg = nl.newsletterConfig(CFG_ENV);
    const m = nl.confirmEmail(cfg, 'a@x.com', 'CONFIRM_abcdefghijklmnopqrstu');
    assert.ok(m.html.includes('/newsletter/confirm?token=CONFIRM_abcdefghijklmnopqrstu'));
    assert.ok(m.text.includes('deleted within 7 days'));
    assert.equal(m.headers, undefined, 'a confirmation is not a list email');
  });

  test('plain-text version keeps link targets', () => {
    assert.equal(nl.htmlToText('<p>See <a href="https://a.b">this</a></p>'), 'See this (https://a.b)');
  });
});

describe('send job', () => {
  test('sends to confirmed only, never twice, and resumes after failures', async () => {
    const db = createFakePrisma();
    const cfg = nl.newsletterConfig(CFG_ENV);
    for (const e of ['a@x.com', 'b@x.com', 'c@x.com']) {
      const { subscriber } = await nl.subscribe(db, e, 'insights');
      if (e !== 'c@x.com') await nl.confirmSubscription(db, subscriber.confirmToken);
    }
    const sent = [];
    let failB = true;
    const send = async (m) => { if (failB && m.to === 'b@x.com') throw new Error('relay said no'); sent.push(m.to); };

    let j = await nl.sendIssue(db, cfg, ISSUE, 'all', send);
    assert.deepEqual([j.sent, j.failed], [1, 1]);
    assert.deepEqual(sent, ['a@x.com']);

    failB = false;
    j = await nl.sendIssue(db, cfg, ISSUE, 'all', send);
    assert.deepEqual([j.sent, j.failed, j.skipped], [1, 0, 1]);
    assert.deepEqual(sent, ['a@x.com', 'b@x.com']);
  });

  test('test mode goes only to the test address', async () => {
    const db = createFakePrisma();
    const sent = [];
    await nl.sendIssue(db, nl.newsletterConfig(CFG_ENV), ISSUE, 'test', async (m) => sent.push([m.to, m.subject]));
    assert.deepEqual(sent, [['me@example.com', '[TEST] Design the handoff']]);
  });
});

describe('wiring', () => {
  test('schema has the three newsletter tables', () => {
    const s = read('prisma/schema.prisma');
    for (const m of ['model Subscriber', 'model NewsletterDelivery', 'model UnsubscribeFeedback']) assert.ok(s.includes(m), m);
    assert.ok(/onDelete:\s*Cascade/.test(s), 'erasing a subscriber must erase their delivery history');
  });

  test('server registers every newsletter route', () => {
    const s = read('server.ts');
    for (const r of ['app.post("/newsletter/subscribe"', 'app.get("/newsletter/confirm"', 'app.post("/newsletter/confirm"',
      'app.get("/newsletter/unsubscribe"', 'app.post("/newsletter/unsubscribe"', 'app.post("/newsletter/resubscribe"',
      'app.post("/newsletter/feedback"', 'app.get("/api/admin/newsletter", requireAdmin', 'app.delete("/api/admin/newsletter/subscribers/:id", requireAdmin',
      'app.post("/api/admin/newsletter/send", requireAdmin']) {
      assert.ok(s.includes(r), r);
    }
  });

  test('confirm GET never confirms by itself (mail scanners open links)', () => {
    const s = read('server.ts');
    const get = s.slice(s.indexOf('app.get("/newsletter/confirm"'), s.indexOf('app.post("/newsletter/confirm"'));
    assert.ok(!get.includes('confirmSubscription'));
  });

  test('privacy notice has the newsletter section and processor slot', () => {
    const p = read('pages/privacy.html');
    assert.ok(p.includes('id="newsletter"') && p.includes('{{NEWSLETTER_PROCESSOR}}'));
    const main = p.slice(p.indexOf('<main'), p.indexOf('</main>'));
    assert.equal((main.match(/<div\b/g) || []).length, (main.match(/<\/div>/g) || []).length, 'unbalanced <div> in privacy page');
  });

  test('subscribe slot on archive and issue pages; message page is noindex', () => {
    assert.ok(read('pages/insights.html').includes('{{SUBSCRIBE}}'));
    assert.ok(read('pages/insight.html').includes('{{SUBSCRIBE}}'));
    assert.ok(read('pages/newsletter.html').includes('noindex'));
  });

  test('compose passes every newsletter setting through', () => {
    const c = read('compose.yaml');
    for (const k of ['NEWSLETTER_SMTP_HOST', 'NEWSLETTER_SMTP_USER', 'NEWSLETTER_SMTP_PASS', 'NEWSLETTER_FROM', 'NEWSLETTER_PROCESSOR', 'PUBLIC_URL']) {
      assert.ok(c.includes(`${k}=`), k);
    }
  });
});

describe('scheduled issues', () => {
  test('hidden from the site, available to admin test sends only', async () => {
    const ins = await tsImport('../lib/insights.ts', import.meta.url);
    const dir = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'ins-'));
    fs.writeFileSync(path.join(dir, 'live.md'), '---\ntitle: Live\ndate: 2026-10-01\n---\nx');
    fs.writeFileSync(path.join(dir, 'later.md'), '---\ntitle: Later\ndate: 2099-12-31\n---\nx');
    assert.deepEqual(ins.loadInsights(dir, '2026-10-15').map(i => i.slug), ['live']);
    assert.deepEqual(ins.loadInsights(dir, '2026-10-15', true).map(i => i.slug).sort(), ['later', 'live']);
  });

  test('server refuses a subscriber send of a scheduled issue', () => {
    const s = read('server.ts');
    const send = s.slice(s.indexOf('app.post("/api/admin/newsletter/send"'));
    assert.ok(/mode === "all" && issue\.date > todayInZurich\(\)/.test(send));
  });

  test('the system test issue can never go live', () => {
    const t = read('content/insights/zz-system-test.md');
    assert.ok(t.includes('date: 2099-12-31'));
  });
});
