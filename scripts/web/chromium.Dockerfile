FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
# The runner supplies current source through stdin. No source or host mounts are retained.
ENTRYPOINT ["/bin/sh", "-ec", "tar -xf - -C /work; exec npm run test:web:built"]
