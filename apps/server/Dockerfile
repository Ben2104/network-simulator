# Used by CI (.github/workflows/deploy.yml) and the repo owner. Contributors never need Docker.
# Build context is the repo root:  docker build -f apps/server/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci -w @netsim/shared -w @netsim/server --include-workspace-root
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @netsim/shared && npm run build -w @netsim/server

FROM node:22-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci -w @netsim/server --omit=dev

FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
USER node
EXPOSE 3001
# Config (CORS_ORIGIN, LOG_LEVEL, PORT) comes from the environment at run time; nothing is baked in.
CMD ["node", "apps/server/dist/index.js"]
