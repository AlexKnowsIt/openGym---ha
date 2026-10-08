# Home Assistant add-on: openGym's web app and API in one container, served through ingress.
# Built by .github/workflows/ha-addon.yml from the repository root:
#   docker build -f opengym/Dockerfile .
# Home Assistant pulls the result from ghcr.io (config.yaml `image`), so nothing is built on the
# device.

# The build output (static files, pure-JS API dependencies) is arch-independent, so it is built
# on the runner's own arch, not under QEMU (see web/Dockerfile for why that matters).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY api/coach/core/ /src/api/coach/core/
COPY frontend/ ./
# Exercise media comes from the CDN the mobile build uses: no ~140 MB download, no media volume.
RUN VITE_IMG_BASE=https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/ \
    VITE_GIF_BASE=https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/ \
    npm run build
WORKDIR /src/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --omit=optional
COPY api/ ./

FROM node:22-alpine
ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.type="addon" io.hass.version="$BUILD_VERSION" io.hass.arch="$BUILD_ARCH"
RUN apk add --no-cache nginx && mkdir -p /run/nginx
COPY --from=build /src/api /app/api
COPY --from=build /src/frontend/dist /app/web
COPY opengym/nginx.conf /etc/nginx/http.d/default.conf
COPY --chmod=755 opengym/run.sh /run.sh
ENV NODE_ENV=production
CMD ["/run.sh"]
