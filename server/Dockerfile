# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ openssl

# Install npm dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy TypeScript configuration and sources
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Remove development dependencies to prepare minimal node_modules
RUN npm prune --production

# =============================================================================
# Stage 2: Production Runner
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal forwarding and openssl for Prisma
RUN apk add --no-cache dumb-init openssl curl

# Create non-root system group and user
RUN addgroup -g 10001 -S roadguard && \
    adduser -u 10001 -S roadguard -G roadguard

# Set up persistent data directories for SQLite database and local uploads
RUN mkdir -p /data/prisma /data/uploads /app/logs && \
    chown -R roadguard:roadguard /data /app

# Copy production artifacts from builder
COPY --from=builder --chown=roadguard:roadguard /app/node_modules ./node_modules
COPY --from=builder --chown=roadguard:roadguard /app/dist ./dist
COPY --from=builder --chown=roadguard:roadguard /app/prisma ./prisma
COPY --from=builder --chown=roadguard:roadguard /app/package.json ./package.json
COPY --chown=roadguard:roadguard docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Environment defaults
ENV NODE_ENV=production \
    PORT=5000 \
    DATABASE_URL="file:/data/prisma/roadguard.db" \
    UPLOAD_DIR="/data/uploads"

# Run container as non-root user
USER roadguard

EXPOSE 5000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]

