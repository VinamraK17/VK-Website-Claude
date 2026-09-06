# Synology NAS Hosting Guide (Dockhand Deployment)

This guide provides a step-by-step workflow to deploy your custom portfolio app on your Synology NAS using **Dockhand** for container stack management, integrated with a **MariaDB Database**, and exposed via your **Cloudflare Tunnel**.

* **Web Codebase Folder:** `/volume1/docker/portfolio-web`
* **MariaDB Database Folder:** `/volume1/docker/portfolio-db`
* **Docker Compose Config:** `/volume1/docker/compose.yaml`

---

## Step 1: Copy files to your NAS
1. Compress your local project folder (excluding `node_modules` and `.env.local` to save upload time and size).
2. Open **File Station** on your Synology NAS.
3. Navigate to `/volume1/docker/portfolio-web/`.
4. Upload and extract your project files directly into this directory so that `package.json`, `server.ts`, and `src/` are located at the root of `/volume1/docker/portfolio-web/`.

---

## Step 2: Configure the Stack in Dockhand
1. Log into your **Dockhand** web dashboard on your Synology NAS.
2. Go to the **Stacks** tab in the sidebar and click **Create Stack** (or select your existing stack if you have one).
3. Paste the following configuration in the Dockhand visual YAML editor:

```yaml
version: '3.8'

services:
  # 1. MariaDB Database (Mapped to portfolio-db)
  portfolio-db:
    image: mariadb:10.11 # Long-Term Support (LTS) version
    container_name: portfolio-db
    environment:
      MARIADB_ROOT_PASSWORD: change_me_secure_root_password
      MARIADB_DATABASE: portfolio
      MARIADB_USER: portfolio_user
      MARIADB_PASSWORD: change_me_secure_user_password
    volumes:
      - /volume1/docker/portfolio-db:/var/lib/mysql
    networks:
      - portfolio-network
    restart: always

  # 2. Portfolio Web Server (Express + Prisma v5 + React)
  portfolio-web:
    build: ./portfolio-web
    container_name: portfolio-web
    depends_on:
      - portfolio-db
    environment:
      # Connection link pointing to our internal container database
      - DATABASE_URL=mysql://portfolio_user:change_me_secure_user_password@portfolio-db:3306/portfolio
      - NODE_ENV=production
      
      # Optional SMTP: Set if you want email verification triggers
      - SMTP_PORT=465
      - SMTP_HOST=smtp.gmail.com
      - SMTP_USER=your_email@gmail.com
      - SMTP_PASS=your_app_password
      
      - CONTACT_PHONE=+41 76 326 31 55
    ports:
      - "3000:3000"
    networks:
      - portfolio-network
    restart: always

networks:
  portfolio-network:
    driver: bridge
```

4. Click the **Save & Deploy** (or **Deploy**) button in Dockhand. Dockhand will automatically read your `./portfolio-web` local context, compile the React assets, bundle the Express server, and start both containers.

---

## Step 3: Initialize Database Tables in Dockhand
Since this is a fresh MariaDB container, the database is blank. Push your schema using Prisma directly inside the Dockhand GUI terminal:

1. In the **Dockhand** sidebar, click on **Containers**.
2. Locate and click on the running **`portfolio-web`** container.
3. Click the **Terminal** or **Console / Shell** icon at the top right of the container detail screen.
4. If prompted to choose a shell, select `/bin/bash` or `/bin/sh` and click Connect.
5. In the terminal window, execute:
   ```bash
   npx prisma db push
   ```
6. Verify that it says: `✔ Generated Prisma Client (v5.22.0)`. Your database tables are now fully configured and active!

---

## Step 4: Map to your Cloudflare Reverse Proxy
Since your Cloudflare Tunnel is already running:
1. Open the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Networks** > **Tunnels** and select your active tunnel.
3. Add or update a **Public Hostname** rule:
   * **Domain:** `yourdomain.com` (or `portfolio.yourdomain.com`)
   * **Service Type:** `HTTP`
   * **URL:** `portfolio-web:3000` (since both the tunnel client and web containers share host connections or bridges)
4. Save the hostname. Your website is now live, interactive, and database-backed!

---

## How to Handle Future App Updates via Dockhand
Whenever you modify your local portfolio files and want to deploy updates to your NAS:
1. Copy the modified files to `/volume1/docker/portfolio-web/` (excluding `node_modules`).
2. Go to **Stacks** in Dockhand, select your `portfolio-stack`, and click **Rebuild** (or **Recreate** with the force pull/build option checked). Dockhand will re-compile the source files and restart your containers cleanly.
