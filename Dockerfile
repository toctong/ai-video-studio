# AI Video Studio 一体化镜像：Nginx + NestJS + FFmpeg

FROM node:22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm install --include-workspace-root --legacy-peer-deps

COPY packages/shared packages/shared
COPY backend backend
COPY frontend frontend

RUN npm run build

FROM node:22-alpine

WORKDIR /app

# Nginx + FFmpeg + 内置 Redis（BullMQ 任务队列，零配置）
RUN apk add --no-cache nginx wget tini ffmpeg redis python3 make g++ \
  && mkdir -p /app/data/logs /app/data/uploads /app/data/redis /run/nginx

ENV NODE_ENV=production
ENV PORT=47822
ENV DB_PATH=/app/data/ai-video-studio.db
ENV LOG_DIR=/app/data/logs
ENV UPLOAD_DIR=/app/data/uploads
ENV REDIS_URL=redis://127.0.0.1:6379
ENV REDIS_DATA_DIR=/app/data/redis
ENV STORAGE_MODE=local

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/

RUN npm install -w ai-video-studio-backend --omit=dev --include-workspace-root \
  && apk del python3 make g++ \
  && npm cache clean --force

COPY --from=builder /build/packages/shared/dist packages/shared/dist
COPY --from=builder /build/backend/dist backend/dist
COPY --from=builder /build/frontend/dist /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/docker-entrypoint.sh"]
