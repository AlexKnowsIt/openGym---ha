# Home Assistant add-on: openGym's web app and API in one container, served through ingress.
#
# The Supervisor builds this folder on its own, without the rest of the repository, so the
# sources are fetched from GitHub. A remote ADD is re-downloaded on every build, so rebuilding
# the add-on always picks up the current state of OPENGYM_REF.
FROM node:22-alpine AS build
ARG OPENGYM_REF=main
ADD https://github.com/AlexKnowsIt/openGym---ha/archive/refs/heads/${OPENGYM_REF}.tar.gz /tmp/src.tgz
RUN mkdir /src && tar xzf /tmp/src.tgz -C /src --strip-components=1
# Same as web/Dockerfile; exercise media comes from the CDN the mobile build uses, so the add-on
# needs no ~140 MB download and no media volume.
WORKDIR /src/frontend
RUN npm ci --ignore-scripts \
 && VITE_IMG_BASE=https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/ \
    VITE_GIF_BASE=https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/ \
    npm run build
WORKDIR /src/api
RUN npm ci --omit=dev --omit=optional

FROM node:22-alpine
RUN apk add --no-cache nginx && mkdir -p /run/nginx
COPY --from=build /src/api /app/api
COPY --from=build /src/frontend/dist /app/web
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY --chmod=755 run.sh /run.sh
ENV NODE_ENV=production
CMD ["/run.sh"]
