/**
 * Per-issue Insights stats: grouping existing first-party events by page.
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let st;
before(async () => { st = await tsImport('../lib/insights-stats.ts', import.meta.url); });

const ISSUES = [
  { slug: 'agents-and-the-control-loop', title: 'Agents need a control loop', issue: 1, date: '2026-11-03' },
  { slug: 'second-issue', title: 'Second', issue: 2, date: '2026-12-01' },
];
const view = (p, sessionId, referrer = null) => ({ event: 'page_view', details: JSON.stringify({ path: p, referrer }), sessionId, referrer });
const exit = (p, duration, scrollDepth) => ({ event: 'page_exit', details: JSON.stringify({ path: p, duration, scrollDepth }), sessionId: 'x', referrer: null });

describe('referrer classification', () => {
  test('LinkedIn, search, direct, own site and other', () => {
    assert.equal(st.classifyReferrer('https://www.linkedin.com/feed/'), 'linkedin');
    assert.equal(st.classifyReferrer('https://lnkd.in/abc'), 'linkedin');
    assert.equal(st.classifyReferrer('https://www.google.ch/'), 'search');
    assert.equal(st.classifyReferrer('https://duckduckgo.com/'), 'search');
    assert.equal(st.classifyReferrer(null), 'direct');
    assert.equal(st.classifyReferrer(''), 'direct');
    assert.equal(st.classifyReferrer('https://vinamrakumar.com/insights'), 'internal');
    assert.equal(st.classifyReferrer('https://news.ycombinator.com/'), 'other');
    assert.equal(st.classifyReferrer('not a url'), 'other');
    assert.equal(st.classifyReferrer('https://notlinkedin.com/'), 'other');
  });
});

describe('insightsStats', () => {
  const A = '/insights/agents-and-the-control-loop';
  const events = [
    view(A, 's1', 'https://www.linkedin.com/'), view(A, 's1', 'https://www.linkedin.com/'),
    view(A + '/', 's2'), view(A.toUpperCase(), 's3', 'https://www.google.com/'),
    view('/insights', 's1', 'https://vinamrakumar.com/'),
    view('/insights/unknown-slug', 's9'), view('/about', 's9'),
    exit(A, 100, 95), exit(A, 300, 40), exit(A, 200, 90), exit(A, 99999, 100),
    { event: 'page_view', details: '{broken', sessionId: 's8', referrer: null },
    { event: 'link_click', details: JSON.stringify({ path: A }), sessionId: 's1', referrer: null },
  ];
  const subs = [
    { source: 'issue:agents-and-the-control-loop', status: 'confirmed' },
    { source: 'issue:agents-and-the-control-loop', status: 'pending' },
    { source: 'issue:agents-and-the-control-loop', status: 'unsubscribed' },
    { source: 'insights', status: 'confirmed' },
  ];
  let r;
  before(() => { r = st.insightsStats(events, subs, ISSUES); });

  test('one row per live issue, newest first, plus the list page', () => {
    assert.deepEqual(r.issues.map(i => i.path), ['/insights/second-issue', A]);
    assert.equal(r.issues[1].label, '#1 Agents need a control loop');
    assert.equal(r.list.path, '/insights');
  });

  test('views and sessions, with trailing slash and case normalised; unknown pages ignored', () => {
    const a = r.issues[1];
    assert.equal(a.views, 4);
    assert.equal(a.sessions, 3);
    assert.equal(r.list.views, 1);
    assert.equal(r.issues[0].views, 0);
  });

  test('sources split by referrer', () => {
    assert.deepEqual(r.issues[1].sources, { linkedin: 2, search: 1, direct: 1, internal: 0, other: 0 });
    assert.equal(r.list.sources.internal, 1);
  });

  test('median read time ignores tabs left open; read-to-end uses the 90% threshold', () => {
    const a = r.issues[1];
    assert.equal(a.medianReadSec, 200);
    assert.equal(a.measured, 4);
    assert.equal(a.finishedPct, 75);
    assert.equal(r.issues[0].medianReadSec, null);
    assert.equal(r.issues[0].finishedPct, null);
  });

  test('sign-ups by form source: confirmed counted, pending separate, unsubscribed excluded', () => {
    assert.equal(r.issues[1].signups, 1);
    assert.equal(r.issues[1].pendingSignups, 1);
    assert.equal(r.list.signups, 1);
  });
});

describe('wiring', () => {
  test('admin-only endpoint, and the admin Analytics tab renders it', () => {
    const server = read('server.ts');
    assert.match(server, /app\.get\("\/api\/admin\/insights-stats", requireAdmin,/);
    const admin = read('pages/admin.html');
    assert.ok(admin.includes('id="insights-stats-tbody"'));
    assert.ok(admin.includes("fetch('/api/admin/insights-stats'"));
  });

  test('adds no client-side tracking', () => {
    assert.equal(read('public/shared.js').includes('insights-stats'), false);
  });
});
