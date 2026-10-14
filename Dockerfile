# syntax=docker/dockerfile:1
# One image: API build + React build + production dependencies, run as the unprivileged `node` user.
# All stages share the same base so better-sqlite3's native module matches the runtime Node ABI.
FROM node:22-bookworm-slim AS base
WORKDIR /app
# Toolchain only for compiling better-sqlite3 when no prebuilt binary fits; not part of the runtime stage.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN npm ci
COPY apps ./apps
COPY packages ./packages
RUN npm run build -w @gdg/api && npm run build -w @gdg/web

FROM base AS deps
RUN npm ci --omit=dev && mkdir -p apps/api/node_modules

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/gdg.sqlite
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/start.js"]
