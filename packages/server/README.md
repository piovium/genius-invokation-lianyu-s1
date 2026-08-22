# `@gi-tcg/server` 对战平台后端

对战平台后端可配合 Web 前端 `@gi-tcg/web-client` 使用。

## 本地开发

1. 安装依赖且构建所有依赖 packages（`core` `data` 等，可在根目录下执行 `pnpm build server` 以自动构建依赖）
2. 在 `packages/server` 下创建 `.env` 文件。至少设置 `JWT_SECRET`、`REGISTRATION_CODE_SECRET`；接入赛事群时还需设置 `BOT_SERVER_ORIGIN` 与 `BOT_SERVER_TOKEN`。

   Passkey 正式部署需要设置 `WEBAUTHN_RP_ID` 与 `WEBAUTHN_ORIGIN`，管理员 QQ 使用英文逗号写入 `ADMIN_QQS`。完整变量参见 `docs/lianyu-s1/server-design.md`。

3. 执行 `pnpm dev` 命令：这将尝试启动本地的 PGLite 模拟数据库并使用 `--watch` 运行服务器以支持本地调试。本地数据库数据持久化存储，如需删除可执行 `pnpm prisma dev rm gi-tcg-lianyu-s1-server-dev`。

- 如果修改了 `prisma/schema.prisma`，则会在启动数据库前进行 Schema 迁移，请按提示输入迁移名称。

赛事群 bot 可用 `python scripts/generate_registration_code.py <QQ> --secret <REGISTRATION_CODE_SECRET>` 生成与 Node 验证器兼容的时效注册码。

## 部署对战平台

- 使用 Docker。在 Monorepo 根目录下执行 `docker build -f packages/server/Dockerfile .` 构建 Docker 镜像。运行时，设置 `JWT_SECRET` 等环境变量并将 `DATABASE_URL` 指向 Postgres 数据库链接串。

- 使用 Docker Compose。在当前目录 (`packages/server`) 创建 `.env` 文件，设置 `JWT_SECRET` 等环境变量，并运行运行 `docker compose up`。

- 或者，通过 Railway 一键部署对战平台。Railway 非免费部署平台；如果想要在 Railway 上降低部署对战平台的成本，可以开启 `genius-invokation` 服务的 Serverless 选项，详情可参见 [Railway Serverless](https://docs.railway.com/reference/app-sleeping)。

  [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/genius-invokation?referralCode=JF0EXE&utm_medium=integration&utm_source=template&utm_campaign=generic)
