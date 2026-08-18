## AIGC 视频工厂

Vue 3 + NestJS 章节小说写作工作台。单容器部署：Nginx + NestJS + **内置 Redis（BullMQ 任务队列）**，无需单独配置 Redis。

功能：工作室画布、书库、大纲/章节写作、角色、时间线；封面 / 出图 / 出视频。

---

## 部署

```bash
mkdir ai-video-studio && cd ai-video-studio
```

**`.env`**

```env
FRONTEND_PORT=9088
DATA_DIR=./data
JWT_SECRET=请改成随机长字符串（≥16）
SETTINGS_SECRET=请改成随机长字符串（≥16）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成强密码
TYPEORM_SYNCHRONIZE=false
DOCKERHUB_USER=your-dockerhub-user
IMAGE_TAG=latest
```

生产环境必须设置强随机的 `JWT_SECRET`、`SETTINGS_SECRET` 和 `ADMIN_PASSWORD`。对象存储推荐外挂 MinIO（或兼容 S3），在 `.env` / 设置页配置 `FILE_OSS_*`。  
任务队列默认走镜像内 Redis，**不必**再写 `REDIS_URL`。

**`docker-compose.yml`（应用 + MinIO）**

```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: 请改成强密码
    volumes: ["./data/minio:/data"]
  ai-video-studio:
    image: liuxiaodi2026/ai-video-studio:latest
    container_name: ai-video-studio
    restart: unless-stopped
    depends_on: [minio]
    env_file: [.env]
    ports: ["9088:80"]
    volumes: ["./data/backend:/app/data"]
    environment:
      STORAGE_MODE: minio
      FILE_OSS_BASE_URL: http://服务器公网IP:9000
      FILE_OSS_API_ENDPOINT: http://minio:9000
      FILE_OSS_BUCKET: aivideo
      FILE_OSS_ACCESS_KEY_ID: minioadmin
      FILE_OSS_ACCESS_KEY_SECRET: 与上方 ROOT 密码一致
      FILE_OSS_KEY_PREFIX: ai/video-studio
```

**启动**

```bash
docker compose pull && docker compose up -d
```

访问：**http://服务器IP:9088**

登录需填写账号、密码；首次登录后请绑定腾讯身份验证器动态码。

---

## 说明

| 项 | 内容 |
|----|------|
| 数据 | `./data/backend`（含 SQLite、上传、**Redis AOF**）；删目录会丢数据与队列 |
| 对象存储 | MinIO（9000/9001）；`FILE_OSS_BASE_URL` 须浏览器可访问；容器内 API 用 `http://minio:9000` |
| 任务队列 | 容器内 Redis + BullMQ，刷新后续跑；顶栏「任务队列」可见状态 |
| 外置 Redis | 设 `REDIS_URL=redis://你的主机:6379`（非本机地址时不会再启内置 Redis） |
| 更新 | `docker compose pull && docker compose up -d` |
| 日志 | `docker compose logs -f ai-video-studio` |

生产环境请设置强随机的 `JWT_SECRET`、`SETTINGS_SECRET` 和 `ADMIN_PASSWORD`；`TYPEORM_SYNCHRONIZE` 生产应为 `false`。
