# AIGC 视频工厂

基于 Vue 3 + NestJS + MySQL 的 AI 视频 / AI 动漫 / AI 短剧 / AI 漫剧自动化生成平台。
前台 + 后台管理 + 后端打成一个 Docker 镜像，内置 Nginx、NestJS、Redis（BullMQ）和 ffmpeg；MySQL 使用外置库，不入镜像。

## 功能菜单（前台）

- 首页：灵感输入、最近项目、官方精选提示词
- 制作大片：文生视频、图生视频、动漫、短剧剧本、漫剧分镜
- 生成工作台：会话式生成、引用图 / 参考视频、任务进度
- 工具箱：制作大片、生成工作台、提示词广场、资产、模型等快捷入口
- 我的项目：项目 / 文件夹 / 复制 / 删除 / 搜索
- 资产管理：工作流资产与生成资产统一浏览、清理、导出
- 模型管理：火山方舟渠道、默认对话 / 图片 / 视频模型、连通测试
- 系统设置：账号、渠道、模型、任务与存储（含 MinIO）

## 后台管理（`/admin/`）

参考 Gi Admin（Arco Design）布局，与前台共用同一套后端与账号体系（仅 `role=admin`）：

- 内容运营 CMS：首页轮播 / 入口卡 / 精选作品 / 官方发现视频 / 工具箱卡片
- 对象存储：MinIO baseUrl / API Endpoint / Bucket / AccessKey，支持连通测试
- 渠道管理：渠道库 API Key / Base URL 配置与删除
- 模型管理：默认对话/图片/视频模型、模型库增删、任务并发
- 书库项目 / 制作项目 / 资产 / 任务 / 发现广场：运维检索与清理
- 系统设置：总览与任务并发快捷入口

前台首页与工具箱运营位统一走 `/api/cms/home`；渠道/模型/MinIO 可在后台改。

## Docker 一键部署

```bash
docker compose up -d --build
```

- 前台：`http://127.0.0.1:9088`
- 后台：`http://127.0.0.1:9088/admin/`
- 默认账号：`admin` / `AdminPass123`（Docker 生产态不允许弱口令 `admin123`；本地 `.env` 仍可用 `admin123`）

`docker compose` 会同时启动 **MinIO**（9000 API / 9001 控制台）与应用。数据在 `./config`（含 MinIO 卷 `./config/minio`）。MySQL 通过环境变量连接外置库（默认 `8.130.171.89:8096` / `ai-video-studio`）。

## 本地开发

前置：Node.js ≥ 22、Docker（MinIO）、可访问的 MySQL。

```bash
npm install
npm run build:shared
npm run minio            # 仅启 MinIO
# 终端 1
npm run dev:backend
# 终端 2
npm run dev:frontend
# 终端 3（可选）
npm run dev:admin
```

复制 `.env.example` 为 `.env`（已含 MySQL / MinIO 默认值）。

- 前台：http://127.0.0.1:5177
- 后台：http://127.0.0.1:5178/admin/
- 后端：http://127.0.0.1:47822
- MinIO 控制台：http://127.0.0.1:9001（`minioadmin` / `minioadmin`）

## 常用脚本

```bash
npm run build            # shared + backend + frontend + admin
npm run check:types      # 前台 + 后台类型检查
npm run test:backend     # 后端测试
npm run minio            # 启动本地 MinIO
```

## 配置

复制 `.env.example` 为 `.env` 后按需修改。生产环境务必更换 `ADMIN_PASSWORD`、`JWT_SECRET`、`SETTINGS_SECRET`。

MySQL 相关：`MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE`。
