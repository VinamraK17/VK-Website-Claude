FROM node:20-slim AS builder

# Update OS packages to apply available security patches, then install openssl for Prisma
RUN apt-get update && apt-get upgrade -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# --- Production Image ---
FROM node:20-slim

WORKDIR /app

# openssl is required by the Prisma query engine even with SQLite
RUN apt-get update && apt-get upgrade -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portfolio.html ./portfolio.html
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Create the data directory so SQLite can write its file.
# The compose.yaml mounts a named volume here, so data persists across restarts.
RUN mkdir -p /app/data

EXPOSE 3000
ENV NODE_ENV=production

# Push schema (creates/migrates the SQLite file), then start the server
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && npm start"]
