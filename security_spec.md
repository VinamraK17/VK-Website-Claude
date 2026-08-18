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
