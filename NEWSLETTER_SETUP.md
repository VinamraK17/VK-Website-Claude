# Newsletter email setup (Proton Mail SMTP)

Insights is sent through **Proton Mail's SMTP submission**, from `insights@vinamrakumar.com`. Subscriber data stays in SQLite on the NAS. Proton (Switzerland) receives only each recipient's address and the email content, at the moment of sending.

No DNS changes are needed: `vinamrakumar.com` already publishes Proton's SPF, DKIM and DMARC records.

**Limits to respect:** Proton says it "is not designed for bulk mailing", and its sending limits depend on the account's reputation. The site therefore sends one email at a time, 5 seconds apart. **Move to a dedicated relay** (Appendix: Amazon SES) once the list passes about 100 subscribers, or at the first sign of throttling. Only the Dockhand settings change; the code stays the same.

---

## 1. Sending address (done 15 Oct 2026)

- Proton → Settings → **Identity and addresses**: address `insights@vinamrakumar.com`, display name `Vinamra Kumar`, signature empty.
- **Proton Mail footer** switched **off**, so "Sent with Proton Mail" is not appended.

## 2. SMTP token (done 15 Oct 2026)

- Proton → Settings → **IMAP/SMTP → SMTP tokens** → token for `insights@vinamrakumar.com`.
- Server `smtp.protonmail.ch`, port `587` (STARTTLS).
- The token is stored only in Dockhand and the password manager. If it is ever exposed, delete it in Proton and generate a new one.

## 3. Settings in Dockhand

Stack → **Environment variables** (never commit these):

| Variable | Value |
|---|---|
| `NEWSLETTER_SMTP_HOST` | `smtp.protonmail.ch` |
| `NEWSLETTER_SMTP_PORT` | `587` |
| `NEWSLETTER_SMTP_USER` | `insights@vinamrakumar.com` |
| `NEWSLETTER_SMTP_PASS` | the SMTP token |
| `NEWSLETTER_FROM` | `Vinamra Kumar <insights@vinamrakumar.com>` |
| `NEWSLETTER_REPLY_TO` | `contact@vinamrakumar.com` |
| `NEWSLETTER_TEST_TO` | `contact@vinamrakumar.com` |
| `NEWSLETTER_PROCESSOR` | `Proton AG (Proton Mail, Switzerland)` |
| `NEWSLETTER_SEND_INTERVAL_MS` | `5000` |
| `PUBLIC_URL` | `https://vinamrakumar.com` |

The subscribe form, and the processor sentence on `/privacy`, appear only when `NEWSLETTER_SMTP_HOST`, `_USER`, `_PASS`, `NEWSLETTER_FROM` and `NEWSLETTER_PROCESSOR` are all set.

## 4. Deploy

1. Merge the pull request into `main`. The GitHub Action builds `ghcr.io/vinamrak17/vk-website-claude:latest`, which takes a few minutes; wait until it shows a green tick.
2. In Dockhand: **pull + redeploy** the stack. On start, `prisma db push` creates the three new tables (additive only; existing data is untouched).

## 5. DNS clean-up (separate from the newsletter, do once)

Cloudflare → DNS: delete the two leftover GoDaddy MX records, `mailstore1.secureserver.net` and `smtp.secureserver.net`. Mail is handled by Proton. These fallbacks can swallow mail whenever Proton is briefly unreachable.

## 6. Test end to end (15 min)

1. Open `https://vinamrakumar.com/insights`. The subscribe box should be visible.
2. Open `https://vinamrakumar.com/privacy#newsletter`. The newsletter section should name Proton AG as the email provider.
3. Subscribe with your own address, then confirm from the email.
4. `/admin` → **Newsletter** tab. You should appear as **confirmed**.
5. Pick an issue → **Send test to me**.
6. Send the test to a Gmail address too (temporarily set `NEWSLETTER_TEST_TO` to it). In Gmail, open it → ⋮ → **Show original**. **SPF, DKIM and DMARC** must all say **PASS**, and the headers must include `List-Unsubscribe` and `List-Unsubscribe-Post`. If those two headers are missing, Proton stripped them: the link in the email still works, but plan the move to a relay.
7. Click **Unsubscribe with one click** at the bottom of a real (non-test) issue and check that the admin tab shows you as unsubscribed. Then use **Stay subscribed** to undo it.

## 7. Launch day (Tue 3 November)

1. The issue file is already deployed with `date: 2026-11-03`, so it goes live at midnight on its own.
2. Read it once on the site.
3. `/admin` → Newsletter → select the issue → **Send test to me** → read it in your inbox.
4. Type `SEND` → **Send to subscribers**. Progress shows on the page. If it stops, press it again: anyone who already received the issue is skipped.
5. Two days later, publish it on LinkedIn with "Originally published at vinamrakumar.com/insights/<slug>", put the edition URL in the issue's `linkedin:` field, and redeploy.

---

## What the system does (for your privacy notice and audits)

- **Double opt-in.** Nothing is sent before the confirm button is pressed. A mail scanner opening the link cannot confirm for someone.
- **Consent record:** confirmation time, signup source and consent-wording version (`2026-11-v1`), shown in the admin tab and the CSV export.
- **One-click unsubscribe:** RFC 8058 headers, so Gmail and Apple Mail can show their own Unsubscribe button, plus a link in every email. Unsubscribing takes effect immediately.
- **Retention:** unconfirmed addresses are deleted after 7 days, unsubscribed ones after 30. The clean-up runs hourly.
- **Feedback:** optional, asked only after the unsubscribe is done, and stored without the address.
- **No tracking:** no pixels, no redirected links.
- **Access and erasure requests:** admin → Newsletter → **Export CSV** or **Erase**. Erasing also removes that person's delivery history.
- **Abuse limits:** 5 sign-ups per IP per 15 minutes, a hidden bot field, at most one confirmation email per address per 10 minutes, and at most 100 confirmation emails per hour in total.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| No subscribe box on `/insights` | One of the five required settings is missing. The admin Newsletter tab lists which. |
| "Something went wrong" after subscribing | SMTP login failed: the token is wrong or revoked. Check the container logs for `[NEWSLETTER]`. |
| Sends fail partway with rate or limit errors | Proton throttling. Wait an hour and press Send again (delivered recipients are skipped), then plan the move to a relay. |
| A send stopped halfway | Press **Send to subscribers** again. Delivered recipients are skipped. |

---

## Appendix: moving to Amazon SES (when you outgrow Proton)

1. AWS console, region **Europe (Frankfurt) eu-central-1**. Zurich has no SES SMTP endpoint.
2. SES → Identities → create domain identity `vinamrakumar.com`: Easy DKIM, RSA 2048, custom MAIL FROM `bounce.vinamrakumar.com`.
3. Cloudflare: add the 3 DKIM CNAMEs as **DNS only** (grey cloud), plus MX `bounce` → `10 feedback-smtp.eu-central-1.amazonaws.com` and TXT `bounce` → `v=spf1 include:amazonses.com ~all`. Leave the root SPF and `_dmarc` as they are.
4. Request production access (Marketing). Describe the double opt-in, one-click unsubscribe and suppression-list handling. AWS usually replies within 24 hours.
5. SES → SMTP settings → create SMTP credentials.
6. Dockhand: `NEWSLETTER_SMTP_HOST=email-smtp.eu-central-1.amazonaws.com`, the SES SMTP user and password, `NEWSLETTER_PROCESSOR=Amazon Web Services EMEA SARL (Amazon SES, Frankfurt region, Germany)`, `NEWSLETTER_SEND_INTERVAL_MS=1000`. Redeploy and send a test.
