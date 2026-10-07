#!/bin/sh
set -e
# The add-on's options (Settings → Add-ons → openGym → Configuration).
opt() { node -e 'const v = require("/data/options.json")[process.argv[1]]; process.stdout.write(v == null ? "" : String(v))' "$1"; }

# /data is the add-on's persistent folder, part of every Home Assistant backup.
export DATA_DIR=/data/opengym
export HOST=127.0.0.1 PORT=3000
export HA_INGRESS=1 FIRST_USER_ADMIN=1
export ALLOW_GUEST="$(opt allow_guest)"
export DEFAULT_LANG="$(opt default_lang)"

nginx
cd /app/api
exec node server.js
