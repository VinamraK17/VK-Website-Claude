/**
 * Contact notification tests.
 *
 * The original implementation failed silently: unset SMTP variables meant the
 * code skipped straight to a Google fallback with no credentials, and both
 * failures only reached stdout. These tests pin the behaviour that replaced
 * it — in particular that a missing configuration is reported, not swallowed.
 *
 * Run:  npm test   OR   node --test tests/notify.test.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Bundle the TypeScript module so the test exercises the real code rather
// than a re-implementation of it.
// Bundled inside the project so `--packages=external` imports (nodemailer)
// resolve against the repo's node_modules rather than the system temp dir.
const cacheDir = path.join(ROOT, 'node_modules', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const bundle = path.join(cacheDir, `notify.${process.pid}.mjs`);
execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
  [path.join(ROOT, 'lib', 'notify.ts'), '--bundle', '--platform=node',
   '--format=esm', '--packages=external', `--outfile=${bundle}`],
  { stdio: 'pipe' }
);
const { notifyViaNtfy, asciiHeader } = await import(bundle);

let server, received, status, base;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      received = { url: req.url, headers: req.headers, body };
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status === 200 ? 'ok' : 'forbidden');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(bundle, { force: true });
});

function env(overrides) {
  for (const key of ['NTFY_URL', 'NTFY_TOPIC', 'NTFY_TOKEN', 'NTFY_CLICK_URL']) delete process.env[key];
  Object.assign(process.env, overrides);
}

describe('ntfy notification', () => {
  test('posts to the topic with the token and the full message body', async () => {
    status = 200;
    env({ NTFY_URL: base, NTFY_TOPIC: 'vk-contact', NTFY_TOKEN: 'tk_secret', NTFY_CLICK_URL: 'https://vinamrakumar.com/admin' });

    const result = await notifyViaNtfy('Jane Roe', 'jane@example.com', 'Line one\nLine two');

    assert.deepEqual(result, { via: 'ntfy', ok: true });
    assert.equal(received.url, '/vk-contact');
    assert.equal(received.headers.authorization, 'Bearer tk_secret');
    assert.equal(received.headers.title, 'New contact: Jane Roe');
    assert.equal(received.headers.click, 'https://vinamrakumar.com/admin');
    assert.match(received.body, /Jane Roe <jane@example\.com>/);
    assert.match(received.body, /Line one\nLine two/);
  });

  test('a trailing slash on NTFY_URL does not produce a double slash', async () => {
    status = 200;
    env({ NTFY_URL: base + '/', NTFY_TOPIC: 'vk-contact' });
    await notifyViaNtfy('A', 'a@example.com', 'hi');
    assert.equal(received.url, '/vk-contact');
  });

  test('non-ASCII names are sanitised in the header but kept intact in the body', async () => {
    status = 200;
    env({ NTFY_URL: base, NTFY_TOPIC: 'vk-contact' });

    await notifyViaNtfy('Zoë Müller', 'zoe@example.com', 'Grüße');

    assert.ok(/^[\x20-\x7E]*$/.test(received.headers.title), 'Title header must be ASCII-safe');
    assert.match(received.body, /Zoë Müller <zoe@example\.com>/);
    assert.match(received.body, /Grüße/);
  });

  test('missing configuration is reported, not silently skipped', async () => {
    env({});
    const result = await notifyViaNtfy('A', 'a@example.com', 'hi');
    assert.equal(result.ok, false);
    assert.match(result.error, /NTFY_URL or NTFY_TOPIC is not set/);
  });

  test('an HTTP error from ntfy is surfaced with its status', async () => {
    status = 403;
    env({ NTFY_URL: base, NTFY_TOPIC: 'vk-contact' });
    const result = await notifyViaNtfy('A', 'a@example.com', 'hi');
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 403/);
  });

  test('an unreachable host fails without throwing', async () => {
    env({ NTFY_URL: 'http://127.0.0.1:1', NTFY_TOPIC: 'vk-contact' });
    const result = await notifyViaNtfy('A', 'a@example.com', 'hi');
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  });

  test('asciiHeader strips control and non-ASCII characters and truncates', () => {
    assert.equal(asciiHeader('Zoë'), 'Zo?');
    assert.equal(asciiHeader('a'.repeat(200)).length, 120);
  });
});
