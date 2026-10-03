# One image for every backend part; SERVICE picks what runs
FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@12.6.0
COPY . .
RUN pnpm install --frozen-lockfile \
    --filter "@quard/db..." \
    --filter "@quard/webhook..." \
    --filter "@quard/control..." \
    --filter "@quard/worker..."
ARG SERVICE=webhook
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "pnpm --filter @quard/${SERVICE} start"]
