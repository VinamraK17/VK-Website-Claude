# Build · Deploy · Test — VK Portfolio

SQLite edition. One container. No separate database server.

---

## Architecture overview

```
GitHub repo ──push──▶ GitHub Actions ──build──▶ ghcr.io image
                                                      │
                                                  Synology NAS
                                              (Dockhand / Container Manager)
                                                      │
                                          portfolio-web container (port 3000)
                                                      │
                                          /app/data/portfolio.db  ← named volume
                                                      │
                                          Cloudflare Tunnel (HTTPS)
```

---

## 1. First-time setup (do this once)

### 1a. Repository secrets — GitHub

Go to **GitHub → repo → Settings → Secrets and variables → Actions** and confirm `GITHUB_TOKEN` exists (it is automatic). No other secrets are needed for the build itself.

### 1b. Environment variables — Synology Dockhand / Container Manager

Open the stack's **Environment** tab and set:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | A strong password you choose |
| `CONTACT_EMAIL` | `contact@vinamrakumar.com` |
| `CONTACT_PHONE` | `+41 76 326 31 55` |
| `SMTP_HOST` | *(optional)* your SMTP server |
| `SMTP_PORT` | *(optional)* |
| `SMTP_USER` | *(optional)* |
| `SMTP_PASS` | *(optional)* |

`DATABASE_URL` is already hardcoded in `compose.yaml` as `file:/app/data/portfolio.db` — do **not** set it in the environment tab.

### 1c. Remove old MariaDB and phpMyAdmin containers

If you have the old three-container stack running:

1. In Dockhand/Container Manager, stop and delete the **portfolio-db** and **db-dashboard** containers.
2. Delete the **portfolio-db-data** named volume (it held MariaDB data — the new SQLite DB starts fresh).
3. Remove the old `portfolio-network` network if it still appears.

> **Contact messages and analytics from the old MariaDB will not be migrated.** They are lost when the volume is removed. If you need them, export via phpMyAdmin before deleting.

---

## 2. Build

### Automatic (recommended)

Push any commit to the `main` branch:

```bash
git add .
git commit -m "your message"
git push origin main
```

GitHub Actions (`.github/workflows/docker-publish.yml`) will:
1. Check out the repo
2. Build the Docker image using the `Dockerfile`
3. Push it to `ghcr.io/vinamrak17/vk-website-claude:latest`

Monitor progress at **GitHub → repo → Actions tab**. A green tick means the image is ready. Takes roughly 2–4 minutes.

### Manual (local test only)

```bash
docker build -t vk-portfolio-local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=file:/tmp/test.db \
  -e ADMIN_PASSWORD=testpass \
  -e CONTACT_EMAIL=test@example.com \
  -e CONTACT_PHONE="+41 76 000 00 00" \
  vk-portfolio-local
```

Open `http://localhost:3000` to verify locally.

---

## 3. Deploy on Synology NAS

### 3a. Update the compose stack

1. Open **Dockhand** (or Container Manager → Projects).
2. Select the **vk-portfolio** stack.
3. Replace the entire compose content with the new `compose.yaml` from this repo (copy-paste or re-upload).
4. Click **Deploy** / **Update**.

Dockhand will:
- Pull `ghcr.io/vinamrak17/vk-website-claude:latest`
- Create the `portfolio-data` named volume (if it doesn't already exist)
- Start the container
- On startup, `prisma db push` runs automatically — it creates `/app/data/portfolio.db` and all tables if they don't exist

### 3b. Confirm the container is running

In Container Manager, the `portfolio-web` container should show **Running**. Check logs for:

```
✓ Prisma schema pushed to database
Server running on port 3000
```

---

## 4. Test checklist

Run through this after every deployment.

### Public site
- [ ] `https://vinamrakumar.com` loads (home page, dark mode default)
- [ ] Light/dark mode toggle works
- [ ] All 5 nav links work: Home, Services, Projects, Experience, Contact
- [ ] **Mobile**: open hamburger menu — background must be fully opaque (no hero bleed-through)
- [ ] Logo strip on homepage shows all 4 logos in dark mode (white frosted pills)
- [ ] Logo strip in light mode shows logos with no visible capsules
- [ ] Contact form: submit a test message → confirmation appears, email arrives at `contact@vinamrakumar.com`

### Admin dashboard
- [ ] `https://vinamrakumar.com/admin` loads the login screen
- [ ] Wrong password → rejected
- [ ] Correct password (`ADMIN_PASSWORD`) → dashboard opens
- [ ] Contact messages tab shows the test message submitted above
- [ ] Analytics tab shows page view events
- [ ] Delete the test message → it disappears

### Regression tests (run locally or in CI)
```bash
node --test tests/navigation.test.mjs
```
All 186 tests must pass before any commit is pushed.

---

## 5. Day-to-day workflow

```
Edit files locally
       │
       ▼
node --test tests/navigation.test.mjs   ← must be 186/186 green
       │
       ▼
git add . && git commit -m "..." && git push origin main
       │
       ▼
GitHub Actions builds + pushes image (~3 min)
       │
       ▼
Dockhand → Deploy (pulls latest image, restarts container)
       │
       ▼
Run test checklist above
```

### Updating content (projects, experience)

Content is seeded from `server.ts` on startup. To change what appears:
1. Edit the seed arrays in `server.ts`
2. Push to main → GitHub Actions builds
3. Redeploy on Synology

The seed logic deletes and re-seeds only if the count doesn't match, so it's safe to redeploy.

### Database location on NAS

The SQLite file lives inside the Docker-managed volume `portfolio-data`. To inspect or back it up:

```bash
# On the Synology, find the volume path
docker volume inspect portfolio-data

# Copy the DB out for a backup
docker cp portfolio-web:/app/data/portfolio.db ./portfolio-backup-$(date +%Y%m%d).db
```

---

## 6. Rollback

If a bad image is deployed:

1. In Dockhand, change the image tag from `latest` to a specific SHA (visible in GitHub Actions logs, e.g. `sha-abc1234`).
2. Redeploy. The `portfolio-data` volume is untouched, so no data is lost.

---

## 7. Contact notifications (ntfy)

Contact submissions are stored in SQLite and pushed to a self-hosted ntfy
instance running beside the site in the same Compose stack. Nothing leaves the
NAS except the push itself.

Until this was set up, the form saved messages and notified nobody: the old
code required `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, none of which were ever set,
then fell through to a Google API path with no credentials in the container.
Both failures were only logged to stdout.

### One-time setup

**1. Deploy the stack** so the `ntfy` service exists, then create the publisher
account and a token. Run on the NAS:

```bash
docker exec -it ntfy ntfy user add --role=user vk
docker exec -it ntfy ntfy access vk "vk-contact" rw
docker exec -it ntfy ntfy token add vk
```

The last command prints a token starting `tk_`. Copy it.

`NTFY_AUTH_DEFAULT_ACCESS=deny-all` is set in `compose.yaml`, so without an
account nothing can be read or published — the topic name alone is not a
credential.

**2. Expose it through the existing Cloudflare tunnel.** Add a public hostname
`ntfy.vinamrakumar.com` pointing at `http://<nas-ip>:8089` (or the `ntfy`
service if the tunnel container shares the `portfolio` network). The site does
NOT use this hostname — it talks to ntfy over the internal Docker network — it
exists so the phone app can subscribe.

**3. Set these in Dockhand** on the stack:

| Variable | Value |
|---|---|
| `NTFY_TOPIC` | `vk-contact` |
| `NTFY_TOKEN` | the `tk_...` token from step 1 |
| `NTFY_BASE_URL` | `https://ntfy.vinamrakumar.com` |
| `NTFY_URL` | leave unset — defaults to `http://ntfy` internally |

**4. Subscribe on the phone.** Install the ntfy app, add
`https://ntfy.vinamrakumar.com` as the server, sign in as `vk`, subscribe to
`vk-contact`.

### Verifying

Send a message through the contact form. Then:

- The phone should buzz within a second or two.
- The admin console's **Notified** column shows `✓ ntfy` for that row.
- A failure shows `✗ failed`; hover it for the reason, which is also stored on
  the message row as `notifyError`.

To test the push path alone, without going through the form:

```bash
curl -H "Authorization: Bearer tk_..." -H "Title: test" \
     -d "hello" https://ntfy.vinamrakumar.com/vk-contact
```

### Optional: email as a second channel

If `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set, an email is sent in
addition to the ntfy push. If any one of them is missing, SMTP is skipped —
deliberately, and now visibly: the skip is recorded in `notifyError` rather
than disappearing into the logs.

### Things that cost an hour the first time

**Dockhand serves a cached compose.** Pulling a new image and recreating the
web container does *not* re-read `compose.yaml` from Git. A new service in the
compose file simply never appears. Use the stack-level redeploy that re-pulls
the repository, then open the stack's compose view and confirm the change is
actually there before debugging anything else.

**Port 8080 is taken on this NAS.** ntfy is on `8089:80`. A port conflict fails
at container *start*, which means Docker reports "failed to start" and there
are **no container logs at all** — nothing ever ran. Dockhand → Activity shows
the daemon's real error; the `create` event succeeding only tells you the image
pulled.

**The compose file is read-only because it comes from Git.** That is correct —
secrets must not go in a public repo. Environment variables live in Dockhand's
own layer at:

```
/app/data/stacks/kumarvinamra/vk-web-claude/.env.dockhand
```

Edit them through the stack's own Edit/Environment screen, not the compose
viewer (which is read-only by design and has no editable env panel). Saving may
ask for a **webhook secret** — that is Dockhand's Git auto-deploy feature, not
related to ntfy. Any random string works; the webhook is only used if you also
configure it on the GitHub side.

**Changing env needs a recreate, not a restart.** After editing, redeploy and
then confirm on Containers → `vk-web-claude-portfolio-web-1` → Environment that
`NTFY_TOKEN` holds the real `tk_…`. A placeholder or an empty value there is the
difference between a working push and a `✗ failed` row.

**Android: subscribe on the right server.** The ntfy app defaults to ntfy.sh. In
the app, **+** → topic name → tick **Use another server** → choose
`https://ntfy.vinamrakumar.com`. Subscribing without that gives you a silent
subscription to an unrelated public topic on ntfy.sh — the site publishes fine,
the admin console shows `✓ ntfy`, and the phone never buzzes.

Also on Pixel: Settings → Apps → ntfy → App battery usage → **Unrestricted**,
and turn on **Instant delivery** in the app. Self-hosted ntfy holds a persistent
connection instead of using Firebase, and Adaptive Battery will kill it.

**iPhone would need one more setting.** iOS only accepts push via APNs, which a
self-hosted server cannot reach. Add `NTFY_UPSTREAM_BASE_URL=https://ntfy.sh` to
the ntfy service; it relays a wake-up ping containing only a topic hash, and the
phone then fetches the content from this server. Not needed for Android.
