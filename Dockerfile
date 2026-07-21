# 构建 Vite 前端产物。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app/web
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 运行镜像：Bun 同时托管静态前端、登录、SQLite 和受控 AI 代理。
FROM oven/bun:1.3.13-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/web/dist
ENV DATA_DIR=/app/data
ENV APP_SECURE_COOKIES=true

COPY --from=web-build /app/web/dist /app/web/dist
COPY server/src /app/server/src

RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun

EXPOSE 3000

CMD ["bun", "server/src/index.ts"]
