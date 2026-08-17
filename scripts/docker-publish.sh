#!/usr/bin/env bash
# 构建并推送 AIGC 视频工厂一体化镜像到 Docker Hub
# 用法: ./scripts/docker-publish.sh [dockerhub用户名] [标签]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

USER="${1:-}"
TAG="${2:-latest}"

if [[ -z "$USER" && -f .env ]]; then
  USER="$(grep -E '^\s*DOCKERHUB_USER\s*=' .env | head -1 | cut -d= -f2- | tr -d ' "\r' || true)"
fi

if [[ -z "$USER" ]]; then
  echo "请指定 Docker Hub 用户名："
  echo "  ./scripts/docker-publish.sh <你的用户名> [标签]"
  echo "或在 .env 中设置 DOCKERHUB_USER=你的用户名"
  exit 1
fi

IMAGE="${USER}/ai-video-studio:${TAG}"

echo ">>> 登录 Docker Hub（账号: ${USER}）"
docker login

echo ">>> 构建一体化镜像: ${IMAGE}"
docker build -t "${IMAGE}" .

echo ">>> 推送镜像"
docker push "${IMAGE}"

echo ""
echo "发布成功！"
echo "  镜像: ${IMAGE}"
echo "  （前端 Nginx + 后端 NestJS 同容器，无需 Redis）"
echo ""
echo "他人部署示例："
echo "  1. cp .env.example .env"
echo "  2. 编辑 .env，设置 DOCKERHUB_USER=${USER}"
echo "  3. docker compose -f docker-compose.hub.yml pull"
echo "  4. docker compose -f docker-compose.hub.yml up -d"
