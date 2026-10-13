FROM docker:27-cli AS dockercli
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS build
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
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
