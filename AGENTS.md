# AGENTS.md — openGym Home Assistant fork

This repository is a fork of [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym)
that adds a Home Assistant add-on with ingress. Everything about openGym itself is in CLAUDE.md;
this file covers only what the fork adds and how it follows upstream.

## Golden rule: stay mergeable

Upstream releases are merged in automatically. Every line changed in an upstream file is a
future merge conflict, so:

- Put fork-only things in fork-only files (`opengym/`, `repository.yaml`, `AGENTS.md`,
  `.github/workflows/ha-addon.yml`, `.github/workflows/ha-addon-test.yml`,
  `api/test/server-ha-ingress.test.js`).
- Never reformat, rename or "clean up" upstream code. Change upstream files only when the add-on
  cannot work otherwise, and keep that change as small as possible.
- Never delete upstream files, including workflows. Upstream workflows that make no sense here
  (`mirror.yml`, `docker-publish.yml`, `pages.yml`) are disabled by the `inherited-workflows` job
  in `ha-addon.yml`; add a new one to its list if an upstream release brings another.
  `test.yml` stays enabled.

## What the fork changes in upstream files

The complete list. When resolving a merge conflict, keep these and take upstream for everything
else.

| File | Change |
|------|--------|
| `api/server.js` | `sessionOf()` starts with the `HA_INGRESS` block calling `ingressUser(req)`. |
| `api/server.js` | `HA_INGRESS`, `utf8Header` and `ingressUser()` right after `readSession()`. |
| `api/server.js` | `server.listen(PORT, process.env.HOST \|\| undefined, …)` at the end of the file. |
| `README.md` | The "Home Assistant add-on" section before "Phone app". |
| `CLAUDE.md` | The pointer to this file at the end. |

If upstream renames or restructures `sessionOf`, `readSession` or `server.listen`, re-apply the
same behavior in the new place: a request with a 32-hex `X-Remote-User-Id` header is signed in
as user `ha-<id>` (created on first sight, named after `X-Remote-User-Display-Name`) only when
`HA_INGRESS` is on; the API binds to `HOST` when it is set.

## How the add-on is built

- `opengym/config.yaml` — add-on manifest. `image` points at `ghcr.io/alexknowsit/{arch}-opengym-ha`,
  so Home Assistant pulls a prebuilt image and builds nothing on the device. `version` is written
  by CI; do not bump it by hand.
- `opengym/Dockerfile` — built from the repository root (`docker build -f opengym/Dockerfile .`).
  Frontend built with exercise media from the jsDelivr CDN; API with `--omit=optional` (no Coach).
  Runtime: `node:22-alpine` + nginx.
- `opengym/nginx.conf` — listens on the ingress port 8099, accepts only the Supervisor
  (172.30.32.2), proxies `/api/` to the API on 127.0.0.1:3000. It must never accept other
  clients: the `X-Remote-User-*` headers are only trustworthy because of this.
- `opengym/run.sh` — reads `/data/options.json`, sets `DATA_DIR=/data/opengym HOST=127.0.0.1
  HA_INGRESS=1 FIRST_USER_ADMIN=1`, starts nginx and the API.
- If upstream adds a module that `server.js` imports, nothing needs to change here: the add-on
  copies the whole `api/` folder (unlike upstream's `api/Dockerfile`).
- If upstream adds a new required env var or changes the frontend build, mirror that in
  `opengym/Dockerfile` / `opengym/run.sh`.

## Updates (`.github/workflows/ha-addon.yml`)

1. **sync** — daily (and on "Run workflow"): merges the newest upstream `vX.Y.Z` tag onto
   `main` and pushes the result to the `ha-sync` branch only.
2. **test** — `ha-addon-test.yml` on that merge, the same checks every pull request gets.
3. **promote** — only if all of them pass: fast-forwards `main` to the tested merge.
4. **build** — builds `amd64` and `aarch64` images, tags `<openGym version>.<run number>`.
5. **release** — writes that version into `opengym/config.yaml`; Home Assistant then offers the
   update.

A push to `main` touching `api/`, `frontend/` or `opengym/` builds and releases too.

### Ruleset on `main`

`main` requires the checks "openGym test suites" and "Add-on image" (Settings → Rules →
Rulesets), with "Repository admin" as bypass. The workflow's own pushes to `main` (promote,
release) have no checks attached and go through only with the `SYNC_TOKEN` secret, a token of
the repository owner. Without it they are refused and Home Assistant gets no update.

### When the sync fails

- **Merge conflict**: check out `main`, merge the tag by hand
  (`git fetch https://github.com/DuarteSantos8/openGym refs/tags/vX.Y.Z:refs/tags/upstream-vX.Y.Z && git merge upstream-vX.Y.Z`),
  resolve using the table above, run the tests, push to `main`.
- **Tests fail**: almost always the ingress test after upstream changed sessions/users. Fix the
  fork's block so `api/test/server-ha-ingress.test.js` passes again, without touching upstream
  tests.
- **Push refused because upstream changed `.github/workflows/`**: the default token cannot push
  workflow files. Add a fine-grained token with Contents + Workflows write as the `SYNC_TOKEN`
  repository secret, or merge by hand.

## Tests (`.github/workflows/ha-addon-test.yml`)

Run on every pull request and gate every upstream merge. Run them locally before pushing:

```bash
cd api && npm test                       # incl. server-ha-ingress.test.js
cd frontend && npm test
python3 opengym/test/check-config.py     # manifest vs. nginx.conf, run.sh, build matrix
docker build -f opengym/Dockerfile -t opengym-ha:test .
E2E=1 PLAYWRIGHT=<path to playwright/index.mjs> opengym/test/smoke.sh opengym-ha:test
```

| Test | Catches |
|------|---------|
| `api/test/server-ha-ingress.test.js` | Ingress sign-in broken by an upstream change to sessions/users; headers trusted without `HA_INGRESS`. |
| `opengym/test/check-config.py` | Ingress port ≠ nginx port, nginx open to other containers, framing forbidden, option not read by `run.sh`, arch offered but not built. |
| `opengym/test/smoke.sh` + `smoke.mjs` | The real image as under Home Assistant (network 172.30.32.0/23): app served with relative assets and no `X-Frame-Options`, options reach the API, one profile per HA user with UTF-8 names, first is admin, sync round trip, 2 MB sync not refused, cross-site write refused, other containers get 403 and cannot reach the API port, profile and data survive replacing the container. |
| `opengym/test/ingress-e2e.mjs` (`E2E=1`) | Chromium loads the app in an iframe behind a prefix-stripping ingress stand-in: signed in without a login screen, every API call stays under the ingress prefix, no page errors. |
| aarch64 image build | ARM images that fail to build. |

When a test fails, fix the code, not the test — unless upstream deliberately changed the
behavior the test pins down.

Pitfall: the frontend's `src/lib/audit.test.js` requires a label for every audit event and
reason the server emits. The ingress sign-in therefore records the existing
`auth.register.ok` event; do not invent new events or `msg` values in fork code.
