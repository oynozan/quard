# Images for every Quard service. Pick one with --target:
#   services  webhook, control or worker (SERVICE picks it), and the migrate step
#   web       the dashboard
FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@12.6.0

# The backend runs its TypeScript directly on Node, so it needs no build step
FROM base AS services-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY db db
COPY packages/shared packages/shared
COPY services services
RUN pnpm install --frozen-lockfile --prod \
    --filter "@quard/db..." \
    --filter "@quard/webhook..." \
    --filter "@quard/control..." \
    --filter "@quard/worker..."

FROM node:24-alpine AS services
WORKDIR /app
ENV NODE_ENV=production
COPY --from=services-deps --chown=node:node /app ./
USER node
ARG SERVICE=webhook
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "exec node services/${SERVICE}/main.ts"]

FROM base AS web-build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY db db
COPY packages/shared packages/shared
COPY web web
RUN pnpm install --frozen-lockfile --filter "web..."
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# Next's standalone output: the server and only the files it needs
FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build --chown=node:node /app/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/web/.next/static ./web/.next/static
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]
