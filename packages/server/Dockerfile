FROM ghcr.io/pnpm/pnpm:latest AS build
RUN pnpm runtime set node 26 -g
WORKDIR /app
ARG DEFAULT_STATIC_DATA_API_BASE_URL
COPY . .
ENV FROM_SOURCE=1
RUN pnpm install --frozen-lockfile && pnpm build:no-typing server...

FROM node:26 AS deploy
WORKDIR /app/packages/server
COPY --from=build /app/packages/server/dist/* /app/packages/server/prisma /app/packages/server/prisma.config.ts ./
RUN npm install @node-rs/argon2

CMD ["node", "--experimental-vm-modules", "--enable-source-maps", "main.js"]
