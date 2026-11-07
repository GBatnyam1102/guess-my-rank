# Two images from one Dockerfile:
#   --target server   game server (tsx runs the TypeScript directly, same as `pnpm dev`).
#                     It is the last stage, so a plain `docker build` (Render) builds it.
#   --target web      Next.js standalone build for deploy/compose.yml; NEXT_PUBLIC_SERVER_URL is baked in at build time

FROM node:22-bookworm-slim AS base
RUN npm install -g pnpm@10.34.9 && npm cache clean --force
ENV CI=true PNPM_HOME=/pnpm
WORKDIR /app

# Only the manifests, so dependency layers are cached until the lockfile changes.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

# ---------- web ----------
FROM manifests AS web-build
RUN pnpm install --frozen-lockfile --filter @gmr/web...
COPY tsconfig.base.json ./
COPY shared shared
COPY web web
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_SERVER_URL" || (echo "NEXT_PUBLIC_SERVER_URL build arg is required" && exit 1)
RUN pnpm --filter @gmr/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build --chown=node:node /app/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/web/.next/static ./web/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]

# ---------- server ----------
FROM manifests AS server-deps
RUN pnpm install --frozen-lockfile --prod --filter @gmr/server...

FROM node:22-bookworm-slim AS server
ENV NODE_ENV=production PORT=4000 STORAGE_DIR=/data/uploads
WORKDIR /app
COPY --from=server-deps /app ./
COPY tsconfig.base.json ./
COPY shared shared
COPY --chown=node:node server server
# /data is the uploads volume; the server also rewrites content/cards on start.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "--import", "tsx", "src/index.ts"]
