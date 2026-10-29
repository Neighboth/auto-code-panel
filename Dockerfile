# syntax=docker/dockerfile:1.7
#
# The application image is built from the project's own Node.js runtime image
# (Debian slim, glibc) instead of Alpine: the stack ships native modules
# (@libsql/client, imapflow/socks) that behave predictably on glibc, and the
# custom server.js needs a regular Node.js environment.
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------- deps ------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --------------------------------------------------------------- build ------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p data public && npm run build

# -------------------------------------------------------------- runtime -----
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SQLITE_PATH=/data/app.db \
    NEXT_TELEMETRY_DISABLED=1

# Runtime dependencies only (no build tooling in the final image).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/LICENSE ./src/LICENSE

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home nextjs \
 && mkdir -p /data /app/data \
 && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
