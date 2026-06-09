FROM node:20-slim AS builder

# Install openssl (required for Prisma client generation)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# --- Production Image ---
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portfolio.html ./portfolio.html
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
ENV NODE_ENV=production

# Push schema to DB (creates tables if missing), then start server
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --skip-generate && npm start"]
