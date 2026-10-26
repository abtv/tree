FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS node-runtime

FROM mcr.microsoft.com/playwright:v1.63.0-noble
# Keep the test runtime patched independently of Playwright's bundled Node.js.
COPY --from=node-runtime /usr/local/bin/node /usr/bin/node
# xvfb-run needs xauth in addition to the Xvfb server supplied by Playwright.
# Pin the patched system Brotli decoder used by curl and Git.
RUN apt-get update \
    && apt-get install -y --no-install-recommends xauth libbrotli1=1.1.0-2ubuntu0.1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
# Download only the locked Electron binary; do not enable other package lifecycle scripts.
RUN node node_modules/electron/install.js
# The runner supplies current source through stdin. No source or host mounts are retained.
ENTRYPOINT ["/bin/sh", "-ec", "tar -xf - -C /work; exec node scripts/web/container-entry.mts \"$@\"", "tree-tests"]
CMD ["web"]
