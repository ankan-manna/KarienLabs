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
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build --workspace=@medcommerce/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/conf.d/spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/ || exit 1
