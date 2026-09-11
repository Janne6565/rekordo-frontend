FROM oven/bun:1 AS build
WORKDIR /build
COPY package.json bun.lock* .npmrc ./
# The shared package lives on GitHub Packages, which needs a token even though it is
# public. Mounted as a secret rather than passed as a build-arg, so it never lands in a
# layer of the published image.
RUN --mount=type=secret,id=npm_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" bun install --frozen-lockfile
COPY . .
# The Grafana Faro collector that /faro/collect is proxied to. Supplied by the CI variable
# rather than the repo; not a secret, but configuration.
#
# One argument drives both halves, so they cannot disagree: when it is set, the app is
# built to post diagnostics to its own origin at /faro/collect and nginx gets the route;
# when it is empty, the route is cut out of the config and the build tree-shakes Faro away
# entirely. Rendering here rather than in the nginx stage because that image runs as UID
# 101 and cannot write its own conf.d.
ARG FARO_UPSTREAM=""
RUN if [ -n "$FARO_UPSTREAM" ]; then \
      export VITE_FARO_COLLECTOR_URL=/faro/collect; \
      sed "s#__FARO_UPSTREAM__#${FARO_UPSTREAM}#" nginx.conf > nginx.rendered.conf; \
    else \
      sed '/# faro:begin/,/# faro:end/d' nginx.conf > nginx.rendered.conf; \
    fi \
    && bun run build

# Unprivileged variant: runs as UID 101 and keeps its temp paths under /tmp, so the
# container needs no CHOWN capability and no writable /var mounts.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /build/nginx.rendered.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 8080
