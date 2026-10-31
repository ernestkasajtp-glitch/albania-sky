# Albania Sky / FMS — one container: API + FMS panel (/flight-system/) + booking portal (/)
# Includes Chromium so PDF reports and Wizz e-tickets (--print-to-pdf) work.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@10.28.0

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build \
 && NODE_ENV=production pnpm --filter @workspace/flight-system run build \
 && NODE_ENV=production pnpm --filter @workspace/booking-engine run build

FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production CHROMIUM_BIN=/usr/bin/chromium SERVE_FRONTENDS=1
WORKDIR /app
# Keep the workspace layout: the API serves ../../flight-system/dist/public etc.,
# and the db bootstrap script needs drizzle-kit + the schema sources.
COPY --from=build /app /app
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 10000
CMD ["/app/docker-entrypoint.sh"]
