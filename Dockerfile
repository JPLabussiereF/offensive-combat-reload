# Offensive Combat: one build, two images.
#   server  Bun game server (WebSocket, sessions, rules)
#   web     nginx serving the built game and proxying /ws to the server
# Usually started together with docker compose (see docker-compose.yml and docs/DEPLOY.md).

FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-alpine AS server
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production && bun pm cache rm
COPY --from=build /app/build ./build
COPY --from=build /app/dist ./dist
COPY server/migrations ./server/migrations
# The map builder thread (server/mapWorker.ts) runs from source: it builds maps with the client's own loader to
# check their draw budget and bake a zumbi map's navmesh when one is saved. It needs those sources and the map
# data the server seeds the official maps from (shared/data).
COPY tsconfig.json ./
COPY shared ./shared
COPY client ./client
COPY tools/headless.ts ./tools/headless.ts
COPY server/mapWorker.ts ./server/mapWorker.ts
# Where the uploaded models go (a volume in docker-compose.yml), writable by the server.
RUN mkdir -p /app/dados/mapas && chown bun:bun /app/dados/mapas
USER bun
EXPOSE 8787
CMD ["bun", "build/server.js"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx/docker.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
