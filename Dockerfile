# syntax=docker/dockerfile:1

# ---- build: install everything, build the web app and bundle the server ----
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so the dependency layer is cached until a package.json changes.
COPY package.json package-lock.json ./
COPY packages/bots/package.json packages/bots/
COPY packages/engine/package.json packages/engine/
COPY packages/i18n/package.json packages/i18n/
COPY packages/protocol/package.json packages/protocol/
COPY themes/space/package.json themes/space/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages packages
COPY themes themes
COPY apps apps
RUN npm run build

# ---- deps: production dependencies of the server workspace only ----
# (the web app, test tools and sharp stay out of the runtime image)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/bots/package.json packages/bots/
COPY packages/engine/package.json packages/engine/
COPY packages/i18n/package.json packages/i18n/
COPY packages/protocol/package.json packages/protocol/
COPY themes/space/package.json themes/space/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @starhold/server --include-workspace-root=false \
  && npm cache clean --force

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# apps/server/dist/index.js finds the web build at ../../web/dist (apps/web/dist).
CMD ["node", "apps/server/dist/index.js"]
