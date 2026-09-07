# Security Specification — VK Portfolio

## 1. Architectural Overview
- **Runtime**: Node.js 20 (Debian Bookworm) + Express + TypeScript
- **Database**: SQLite via Prisma ORM (`/app/data/portfolio.db` mounted via persistent Docker volume)
- **Deployment**: Docker container behind reverse proxy / Cloudflare Tunnel
- **Security Headers**: HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Permissions-Policy, Referrer-Policy

---

## 2. Endpoint Specifications & Access Control

### A. Public Endpoints

| Endpoint | Method | Purpose | Protection & Validation |
| :--- | :--- | :--- | :--- |
| `/api/contact` | `POST` | Contact form submission | • **Rate Limiting**: Max 5 submissions per 15 minutes per IP (`HTTP 429` with `Retry-After`).<br>• **Honeypot Protection**: Hidden `website_url` field catches automated bots (returns synthetic `200 OK` without DB write or email trigger).<br>• **Payload Validation**: Name <= 100 chars, Email <= 254 chars + RFC-compliant regex, Message <= 5000 chars.<br>• **HTML Sanitization**: All fields escaped (`&`, `<`, `>`, `"`, `'`) before template rendering. |
| `/api/analytics` | `POST` | First-party telemetry | • Anonymous event tracking (page views, exits, durations, scroll depth).<br>• No tracking cookies or PII stored.<br>• Geolocation derived from proxy headers (`cf-ipcountry`). |
| `/api/db-status` | `GET` | Healthcheck badge | Verifies SQLite connectivity via `SELECT 1`. |
| `/api/projects` | `GET` | Portfolio showcase | Read-only from SQLite (`order: asc`). |
| `/api/experiences` | `GET` | Career timeline | Read-only from SQLite (`order: asc`). |

---

### B. Protected Admin Endpoints

| Endpoint | Method | Purpose | Protection |
| :--- | :--- | :--- | :--- |
| `/api/admin/messages` | `GET` | View received contact messages | Requires `Bearer <ADMIN_PASSWORD>`. |
| `/api/admin/analytics` | `GET` | View aggregate telemetry & sessions | Requires `Bearer <ADMIN_PASSWORD>`. |
| `/api/admin/messages/:id` | `DELETE` | Delete message record | Requires `Bearer <ADMIN_PASSWORD>`. |

#### Admin Security Invariants:
1. **Timing-Safe Comparison**: Passwords are compared using SHA-256 digests and `crypto.timingSafeEqual` to eliminate timing attack vectors.
2. **Brute-Force Lockout**: 5 failed login attempts from a given IP within 10 minutes triggers an automatic 15-minute IP lockout (`HTTP 429`).
3. **No-Index / No-Cache**: Admin routes deliver `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` headers.

---

## 3. Threat Model & Mitigations

| Threat | Mitigation |
| :--- | :--- |
| **Contact Form Spam / Mail Bombing** | Honeypot trap + IP rate limiting (5 req / 15 min) + character limits. |
| **Admin Password Brute Force** | Constant-time string hashing (`crypto.timingSafeEqual`) + IP lockout mechanism. |
| **XSS / HTML Injection in Emails** | `escapeHtml()` sanitization on all user inputs before HTML email assembly. |
| **Clickjacking** | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. |
| **MIME-Type Sniffing** | `X-Content-Type-Options: nosniff`. |
| **SQL / ORM Injection** | Prisma parameterized queries throughout. |

## 4. Browser Security Headers

Set on every response in `server.ts`. Verified by the "Security headers" suite in
`tests/navigation.test.mjs`, which fails if the policy and the site drift apart.

| Header | Value | Purpose |
| :--- | :--- | :--- |
| `Content-Security-Policy` | see below | Restricts where scripts, styles, fonts, images and connections may come from. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Two years, subdomains included, eligible for the browser preload list. |
| `Cross-Origin-Opener-Policy` | `same-origin` | A page this site opens cannot reach back through `window.opener`. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Other origins cannot embed this site's responses. |
| `X-Frame-Options` / `frame-ancestors` | `DENY` / `'none'` | Clickjacking. Both, because older browsers ignore CSP. |
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type guessing. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URLs are not leaked to third parties. |
| `Permissions-Policy` | camera, microphone, geolocation, payment all `()` | Denies APIs the site never uses. |

### Content Security Policy

```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
font-src 'self'
img-src 'self' data: https://images.unsplash.com
connect-src 'self'
frame-src 'none'
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
object-src 'none'
upgrade-insecure-requests
```

Every third-party origin has been removed. Until September 2026 the policy still
trusted `cdn.tailwindcss.com`, `unpkg.com`, `fonts.googleapis.com` and
`fonts.gstatic.com` — origins the site had already stopped using. `img-src` was
`https:`, which trusted every host on the internet for images.

### Known gaps

**`'unsafe-inline'` on `script-src`.** This is the one weakness that matters: it
means an injected `<script>` or `onclick` would execute. It cannot be removed
without refactoring, because the markup currently contains:

- 78 inline event handlers (75 `onclick`, 3 `oninput`)
- 5 inline `<script>` blocks

Closing it means moving the handlers to `addEventListener` in `shared.js` and
either hashing the remaining blocks (`'sha256-…'`) or serving pages through a
template that can inject a per-request nonce. `sendFile` cannot do the latter as
things stand.

**`'unsafe-inline'` on `style-src`.** 73 inline `style=` attributes. Lower risk
than the script case — CSS injection is largely an exfiltration and defacement
vector rather than code execution — and it is fixed by the same kind of work.

**Trusted Types.** `require-trusted-types-for 'script'` would block DOM-based XSS
at the sink. 16 `innerHTML` assignments across `shared.js`, `admin.html`,
`contact.html`, `experience.html` and `projects.html` would have to move to
`textContent` or a sanitiser first.

None of these are exploitable on their own — they widen the blast radius of an
injection that would have to get past the server-side escaping documented in
section 3. They are recorded here so the gap is deliberate rather than forgotten.
