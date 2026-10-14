# Newsletter email setup (Amazon SES, Frankfurt)

The site sends the Insights newsletter through **Amazon SES in Frankfurt (`eu-central-1`)**. Subscriber data stays in SQLite on the NAS. SES only receives each recipient's address and the email content at the moment it is sent.

Why Frankfurt and not Zurich: SES does run in Zurich (`eu-central-2`), but that region has **no SMTP endpoint**, and this site sends over SMTP. Germany counts as having adequate data protection under the Swiss FADP.

**Deadline:** have step 5 submitted by **Tue 20 October** and steps 1–9 done by **Tue 27 October**. That leaves a week to test before the launch on 3 November.

Cost: USD 0.10 per 1,000 emails. One issue to a few hundred readers costs a few cents a month.

---

## 1. Open SES in the right region (5 min)

1. Sign in to the AWS console. Use an existing account or create one. Turn on MFA for the root user before anything else.
2. Switch the region selector (top right) to **Europe (Frankfurt) eu-central-1**. Everything below is per-region. An identity verified in another region does not count here.
3. Open **Amazon Simple Email Service**.

## 2. Verify the domain with DKIM (10 min + waiting)

1. SES → **Configuration → Identities → Create identity**.
2. Identity type: **Domain**. Domain: `vinamrakumar.com`.
3. Tick **Use a custom MAIL FROM domain** and enter `bounce`, which gives `bounce.vinamrakumar.com`. Behaviour on MX failure: **Use default MAIL FROM domain**.
4. Leave **Easy DKIM**, **RSA_2048_BIT**, DKIM signatures **enabled**.
5. **Create identity**. SES now shows **three CNAME records** for DKIM, plus one **MX** and one **TXT** record for MAIL FROM.

## 3. Add the records in Cloudflare (10 min)

Cloudflare dashboard → `vinamrakumar.com` → **DNS → Records → Add record**. Copy each value exactly from the SES screen.

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `<token1>._domainkey` | `<token1>.dkim.amazonses.com` | **DNS only** (grey cloud) |
| CNAME | `<token2>._domainkey` | `<token2>.dkim.amazonses.com` | **DNS only** |
| CNAME | `<token3>._domainkey` | `<token3>.dkim.amazonses.com` | **DNS only** |
| MX | `bounce` | `feedback-smtp.eu-central-1.amazonses.com`, priority `10` | n/a |
| TXT | `bounce` | `v=spf1 include:amazonses.com ~all` | n/a |

- **The DKIM CNAMEs must be "DNS only".** A proxied (orange cloud) CNAME breaks verification.
- `bounce` must have exactly one MX record and must not be used for anything else.
- **Do not change the SPF record on `vinamrakumar.com` itself.** It covers the mailbox you already use for the contact form. SES uses `bounce.vinamrakumar.com` for SPF instead.

Back in SES, the identity turns **Verified** and DKIM **Successful**, usually within an hour (AWS allows up to 72 hours).

## 4. DMARC (5 min)

In Cloudflare DNS, look for a TXT record named `_dmarc`.

- **One already exists:** leave it. Do not add a second record.
- **None exists:** add one.

| Type | Name | Content |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<your address>` |

`p=none` only monitors. Once a couple of issues have gone out cleanly, you can tighten it to `p=quarantine`.

## 5. Request production access (5 min + up to ~24 h)

A new SES account is in the **sandbox**: it can only send to addresses you have verified, and at most 200 emails a day. Request production access once the domain is verified, because a verified domain speeds up approval.

SES → **Account dashboard** → **View Get set up page** → **Request production access**:

- **Mail type:** Marketing
- **Website URL:** `https://vinamrakumar.com/insights`
- **Use case description** (paste and adjust):

  > Monthly personal newsletter ("Insights") from vinamrakumar.com, one email on the first Tuesday of each month. Subscribers sign up through a form with an unticked consent box and must confirm by clicking a link in a confirmation email (double opt-in); unconfirmed addresses are deleted after 7 days. Every email carries RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers plus a visible one-click unsubscribe link, processed immediately. Bounces and complaints are handled by the SES account-level suppression list. Expected volume: under 500 emails per month initially. No purchased or third-party lists.

- Tick the acknowledgement and **Submit**.

AWS usually answers within 24 hours. While you wait, test by verifying your own address: Identities → Create identity → **Email address**. Then do steps 6–9 and send a test to that address.

## 6. Check the suppression list (1 min)

SES → **Configuration → Suppression list**. Check that account-level suppression is on for **Bounces and Complaints**. It is the default on new accounts. With it on, SES stops delivering to addresses that hard-bounce or mark the newsletter as spam, which protects your domain's reputation.

## 7. Create SMTP credentials (5 min)

1. SES → **SMTP settings**. Note the endpoint: `email-smtp.eu-central-1.amazonaws.com`, port `587` (STARTTLS).
2. **Create SMTP credentials**. This creates a dedicated IAM user with send-only permission.
3. Copy the **SMTP user name** and **SMTP password**. AWS shows the password only once. These are **not** your AWS sign-in details.

## 8. Add the settings in Dockhand (5 min)

Stack → **Environment variables**. Add these, never commit them:

| Variable | Value |
|---|---|
| `NEWSLETTER_SMTP_HOST` | `email-smtp.eu-central-1.amazonaws.com` |
| `NEWSLETTER_SMTP_PORT` | `587` |
| `NEWSLETTER_SMTP_USER` | SMTP user name from step 7 |
| `NEWSLETTER_SMTP_PASS` | SMTP password from step 7 |
| `NEWSLETTER_FROM` | `Vinamra Kumar <insights@vinamrakumar.com>` |
| `NEWSLETTER_REPLY_TO` | the address where you want replies, e.g. your contact address |
| `NEWSLETTER_TEST_TO` | your own address, for test sends |
| `NEWSLETTER_PROCESSOR` | `Amazon Web Services EMEA SARL (Amazon SES, Frankfurt region, Germany)` |
| `PUBLIC_URL` | `https://vinamrakumar.com` |

- The subscribe form and the processor sentence on `/privacy` appear only when the first five settings are all present. Until then the site collects nothing.
- `NEWSLETTER_FROM` must be on the verified domain. `insights@` does not need to be a real mailbox, because replies go to `NEWSLETTER_REPLY_TO`.

Then merge the branch, **pull + rebuild + restart** the stack. The new database tables are created automatically on start (`prisma db push` in the Dockerfile).

## 9. Test end to end (15 min)

1. Open `https://vinamrakumar.com/insights`. The subscribe box should be visible.
2. Open `https://vinamrakumar.com/privacy#newsletter`. The SES sentence should name the provider.
3. Subscribe with your own address, then confirm from the email.
4. `/admin` → **Newsletter** tab. You should appear as **confirmed**.
5. Pick an issue → **Send test to me**.
6. In Gmail, open the test → ⋮ → **Show original**. **SPF, DKIM and DMARC** must all say **PASS**. If DKIM fails, recheck step 3.
7. Click **Unsubscribe with one click** at the bottom of a real (non-test) issue and check that the admin tab shows you as unsubscribed. Then use **Stay subscribed** to undo it.

## 10. Launch day (Tue 3 November)

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
- **No tracking:** no pixels, no redirected links. SES open and click tracking stay off, since no configuration set is used.
- **Access and erasure requests:** admin → Newsletter → **Export CSV** or **Erase**. Erasing also removes that person's delivery history.
- **Abuse limits:** 5 sign-ups per IP per 15 minutes, a hidden bot field, at most one confirmation email per address per 10 minutes, and at most 100 confirmation emails per hour in total.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| No subscribe box on `/insights` | One of the five required settings is missing. The admin Newsletter tab lists which. |
| "Something went wrong" after subscribing | SMTP login or connection failed. Check the container logs for `[NEWSLETTER]`. |
| Emails only reach your own address | The account is still in the SES sandbox (step 5). |
| DKIM fails in "Show original" | A CNAME is proxied (orange cloud) or mistyped (step 3). |
| A send stopped halfway | Press **Send to subscribers** again. Delivered recipients are skipped. |
