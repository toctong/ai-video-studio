#!/bin/sh
set -e

export DB_PATH="${DB_PATH:-/app/data/ai-video-studio.db}"
export LOG_DIR="${LOG_DIR:-/app/data/logs}"
export UPLOAD_DIR="${UPLOAD_DIR:-/app/data/uploads}"
export PORT="${PORT:-47822}"
export NODE_ENV="${NODE_ENV:-production}"
# Docker 默认用容器内 Redis → BullMQ；外置 Redis 时自行设 REDIS_URL
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"

REDIS_DATA_DIR="${REDIS_DATA_DIR:-/app/data/redis}"
mkdir -p "$(dirname "$DB_PATH")" "$LOG_DIR" "$UPLOAD_DIR" "$REDIS_DATA_DIR" /run/nginx
rm -f "${DB_PATH}.lock"

BACKEND_PID=""
NGINX_PID=""
REDIS_PID=""

need_embedded_redis() {
  case "$REDIS_URL" in
    redis://127.0.0.1:*|redis://localhost:*|redis://0.0.0.0:*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

start_embedded_redis() {
  echo "[AI Video Studio] starting embedded Redis (BullMQ) → $REDIS_URL"
  redis-server \
    --bind 127.0.0.1 \
    --port 6379 \
    --dir "$REDIS_DATA_DIR" \
    --appendonly yes \
    --save "" \
    --daemonize no &
  REDIS_PID=$!

  i=0
  while [ "$i" -lt 30 ]; do
    if redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
      echo "[AI Video Studio] Redis ready"
      return 0
    fi
    if ! kill -0 "$REDIS_PID" 2>/dev/null; then
      echo "[AI Video Studio] Redis exited" >&2
      return 1
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[AI Video Studio] Redis timeout" >&2
  return 1
}

cleanup() {
  echo "[AI Video Studio] stopping..."
  for pid in "$NGINX_PID" "$BACKEND_PID" "$REDIS_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$NGINX_PID" "$BACKEND_PID" "$REDIS_PID"; do
    if [ -n "$pid" ]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

if need_embedded_redis; then
  start_embedded_redis || exit 1
else
  echo "[AI Video Studio] using external Redis → $REDIS_URL"
fi

cd /app/backend
node dist/main.js &
BACKEND_PID=$!

echo "[AI Video Studio] waiting backend..."
ready=0
i=0
while [ "$i" -lt 60 ]; do
  if wget -q --spider "http://127.0.0.1:${PORT}/health" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[AI Video Studio] backend exited" >&2
    wait "$BACKEND_PID" || true
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "[AI Video Studio] backend timeout" >&2
  exit 1
fi

echo "[AI Video Studio] starting Nginx"
nginx -g 'daemon off;' &
NGINX_PID=$!

while true; do
  if [ -n "$REDIS_PID" ] && ! kill -0 "$REDIS_PID" 2>/dev/null; then
    echo "[AI Video Studio] Redis exited" >&2
    exit 1
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then echo "[AI Video Studio] backend exited" >&2; exit 1; fi
  if ! kill -0 "$NGINX_PID" 2>/dev/null; then echo "[AI Video Studio] Nginx exited" >&2; exit 1; fi
  sleep 2
done
