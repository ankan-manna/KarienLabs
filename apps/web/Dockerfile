# syntax=docker/dockerfile:1

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@medcommerce/shared --workspace=@medcommerce/web --include-workspace-root

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
# packages/shared's tsconfig.cjs.json/tsconfig.esm.json both `extends`
# this — without it, its build fails with "error TS5083: Cannot read file
# '/app/tsconfig.base.json'" (apps/api/Dockerfile already copies this for
# the same reason, building the same shared package).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# npm's resolver nests a few packages (react-router/react-router-dom/cookie)
# directly under apps/web/node_modules instead of hoisting them to the root
# — hoisting is an optimization, not a guarantee, and the lockfile is the
# source of truth for where each package actually lands (see
# package-lock.json's "apps/web/node_modules/..." entries). The root
# node_modules copied above doesn't include these; without this copy,
# `vite build`'s TypeScript step fails with "Cannot find module
# 'react-router-dom'" even though `npm ci` installed it correctly.
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_GA_MEASUREMENT_ID=
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
# @medcommerce/shared's package.json points main/module/types at dist/ (it's
# a compiled workspace package, not run from source) — must be built BEFORE
# @medcommerce/web, which imports from it, same ordering apps/api/Dockerfile
# already uses. Without this, vite build fails: "Failed to resolve entry for
# package @medcommerce/shared" (no dist/ exists yet).
RUN npm run build --workspace=@medcommerce/shared \
  && npm run build --workspace=@medcommerce/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/conf.d/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/ || exit 1
