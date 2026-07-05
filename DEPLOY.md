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
