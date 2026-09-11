FROM oven/bun:1 AS build
WORKDIR /build
COPY package.json bun.lock* .npmrc ./
# The shared package lives on GitHub Packages, which needs a token even though it is
# public. Mounted as a secret rather than passed as a build-arg, so it never lands in a
# layer of the published image.
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" bun install --frozen-lockfile
COPY . .
# Where the browser sends diagnostics, and only after the reader consents. Not a secret —
# it ends up in the public bundle either way — but environment-specific, so it comes from
# the CI variable rather than the repo. Left empty, the build tree-shakes Faro away
# entirely and the app ships with no diagnostics code at all.
ARG VITE_FARO_COLLECTOR_URL=""
ENV VITE_FARO_COLLECTOR_URL=$VITE_FARO_COLLECTOR_URL
RUN bun run build

# Unprivileged variant: runs as UID 101 and keeps its temp paths under /tmp, so the
# container needs no CHOWN capability and no writable /var mounts.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 8080
