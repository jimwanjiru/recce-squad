# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Python is used only inside the image for the pinned Prisma generator RPC.
# Cloud builds may provide the session CA as an optional BuildKit secret.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends python3; \
    else \
      apt-get update && apt-get install -y --no-install-recommends python3; \
    fi && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --ignore-scripts --strict-ssl=true; \
    else npm ci --ignore-scripts --strict-ssl=true; fi
COPY . .
RUN npm run db:generate && npm run schema:validate && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=development BIND_HOST=0.0.0.0 PORT=3000 LOCAL_DOCKER=true
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
COPY --from=build --chown=node:node /app/tools ./tools
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["node", "tools/local-entrypoint.cjs"]
