# Node 22 LTS (security support until April 2027). Node 20 reached end of life
# in April 2026 and no longer receives security fixes.
FROM node:22-slim AS builder

# Update OS packages to apply available security patches, then install openssl for Prisma
RUN apt-get update && apt-get upgrade -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install exactly what package-lock.json pins (npm ci), so the image ships the
# versions that were audited and tested, not whatever is newest on build day.
COPY package.json package-lock.json ./
# Copy the Prisma schema before npm install so @prisma/client's postinstall
# script can find it. Without this, postinstall silently corrupts the cache
# and the explicit prisma generate step below fails with exit code 1.
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY . .

RUN npx prisma generate
RUN npm run build
# Drop build-only packages (Tailwind, esbuild, TypeScript...) before they are
# copied into the runtime image. The Prisma CLI stays: it is a runtime dependency.
RUN npm prune --omit=dev

# --- Production Image ---
FROM node:22-slim

WORKDIR /app

# openssl is required by the Prisma query engine even with SQLite
RUN apt-get update && apt-get upgrade -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Create the data directory so SQLite can write its file.
# The compose.yaml mounts a named volume here, so data persists across restarts.
RUN mkdir -p /app/data

EXPOSE 3000
ENV NODE_ENV=production

# Docker/Portainer health check: polls the DB-status endpoint every 30 s.
# If it fails 3 times in a row the container is marked unhealthy, which
# Dockhand/Portainer surfaces in the UI and can use to trigger a restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/db-status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Push schema (creates/migrates the SQLite file), then start the server
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && npm start"]
