FROM mcr.microsoft.com/playwright:v1.63.0-noble
# xvfb-run needs xauth in addition to the Xvfb server supplied by Playwright.
RUN apt-get update && apt-get install -y --no-install-recommends xauth && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
# Download only the locked Electron binary; do not enable other package lifecycle scripts.
RUN node node_modules/electron/install.js
# The runner supplies current source through stdin. No source or host mounts are retained.
ENTRYPOINT ["/bin/sh", "-ec", "tar -xf - -C /work; exec node scripts/web/container-entry.mts \"$@\"", "tree-tests"]
CMD ["web"]
