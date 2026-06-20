# One container, whole platform: API + screen runtime + config app.
# SQLite lives on the /data volume. Runs as a non-root user.
FROM node:24-slim

ENV CI=true
# Shared, predictable Chromium location so the non-root user finds the browser.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
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

# Bake the Chromium the e-ink render pipeline needs (else /render.bmp 503s on
# first use) plus its OS libraries, then trim apt caches to keep the image lean.
RUN pnpm --filter @glanceos/server exec playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

ENV GLANCEOS_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data /app /ms-playwright
VOLUME /data
EXPOSE 8080

# Drop root for runtime.
USER node

# Liveness/readiness for orchestrators — uses Node's global fetch, no extra pkg.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@glanceos/server", "start"]
