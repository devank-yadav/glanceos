# One container, whole platform: API + screen runtime + config app.
# SQLite lives on the /data volume.
FROM node:24-slim

ENV CI=true
RUN corepack enable
WORKDIR /app

# Dependency layer — cached until a manifest changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/schema/package.json packages/schema/
COPY apps/server/package.json apps/server/
COPY apps/screen/package.json apps/screen/
COPY apps/config/package.json apps/config/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV GLANCEOS_DATA_DIR=/data
VOLUME /data
EXPOSE 8080

CMD ["pnpm", "--filter", "@glanceos/server", "start"]
