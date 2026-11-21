FROM docker:27-cli AS dockercli
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS build
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium firefox webkit
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci
COPY . .
RUN npm --prefix frontend run build

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "server.js"]

FROM build AS manual-browser
USER pwuser
ENV HOME=/tmp XDG_CONFIG_HOME=/tmp/config XDG_CACHE_HOME=/tmp/cache
CMD ["xvfb-run", "-e", "/dev/stderr", "--server-args=-screen 0 1440x900x24 -nolisten tcp", "node", "manual-browser/runtime.js"]

FROM build AS app
