# AIGC 视频工厂

基于 Vue 3 + NestJS + SQLite 的 AI 视频 / AI 动漫 / AI 短剧 / AI 漫剧自动化生成平台。
前后端打成一个 Docker 镜像，内置 Nginx、NestJS、Redis（BullMQ）和 ffmpeg，开箱即用。

## 功能菜单

- 首页：灵感输入、最近项目、官方精选提示词
- 制作大片：文生视频、图生视频、动漫、短剧剧本、漫剧分镜
- 生成工作台：会话式生成、引用图 / 参考视频、任务进度
- 工具箱：制作大片、生成工作台、提示词广场、资产、模型等快捷入口
- 我的项目：项目 / 文件夹 / 复制 / 删除 / 搜索
- 资产管理：工作流资产与生成资产统一浏览、清理、导出
- 模型管理：火山方舟渠道、默认对话 / 图片 / 视频模型、连通测试
- 系统设置：账号、渠道、模型、任务与存储、Hub 同步

## 内置火山引擎

模型管理页内置火山方舟渠道，默认提供：

- 对话：`doubao-seed-1-6-250615`
- 图片：`doubao-seedream-5-0-pro-260628`
- 视频：`doubao-seedance-2-0-260128`

首次使用只需填入火山方舟 API Key，保存后测试连接即可开始生成。

## Docker 一键部署

```bash
docker compose up -d --build
```

访问 `http://127.0.0.1:9088`，默认账号 `admin` / `admin123`。

单容器包含 Nginx + NestJS + 内置 Redis + ffmpeg，数据保存在 `./config`。默认使用本地磁盘存储，不需要额外启动 MinIO；如需 S3/MinIO，可在 `.env` 中设置 `STORAGE_MODE=minio` 并填写 `FILE_OSS_*`。

## 本地开发

前置：Node.js ≥ 22。

```bash
npm install
npm run build:shared
# 终端 1
npm run dev:backend
# 终端 2
npm run dev:frontend
```

- 前端：http://127.0.0.1:5177
- 后端：http://127.0.0.1:47822
- 默认账号：`admin` / `admin123`

## 常用脚本

```bash
npm run build            # 全量构建 shared + backend + frontend
npm run check:types      # 前端类型检查
npm run test:backend     # 后端测试
```

## 配置

复制 `.env.example` 为 `.env` 后按需修改。生产环境务必更换 `ADMIN_PASSWORD`、`JWT_SECRET`、`SETTINGS_SECRET`。

> 说明：本平台保留参考项目的工作流画布与小说书库能力，但主导航已切换为面向视频生产的页面结构。
