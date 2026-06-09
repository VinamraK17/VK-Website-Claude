FROM node:20-slim AS builder

# Install openssl (required for Prisma client generation)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package file
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# --- Production Image ---
FROM node:20-slim

WORKDIR /app

# Install openssl (required for Prisma client)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built server, static assets, and runtime dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portfolio.html ./portfolio.html
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma



# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
