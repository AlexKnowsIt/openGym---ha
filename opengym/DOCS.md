# openGym

Self-hosted gym & body-weight tracker, opened from the Home Assistant sidebar through ingress.

## Sign-in

There is no separate login. Each Home Assistant user who opens openGym gets their own profile,
named after their Home Assistant display name. The first one to open it becomes the openGym
admin (Settings → Admin). Passkeys are not used under ingress.

## Options

| Option         | Default | Meaning                                                                 |
|----------------|---------|-------------------------------------------------------------------------|
| `allow_guest`  | `false` | Offer "continue without account" (data stays in the browser only).      |
| `default_lang` | empty   | Language for new profiles, e.g. `de` or `pt-BR`. Empty: browser default. |

## Data and backups

Everything lives in the add-on's `/data` folder and is included in Home Assistant backups.
Exercise images and animations are loaded by the browser from the jsDelivr CDN
(source: github.com/hasaneyldrm/exercises-dataset, © Gym visual — see NOTICE.md in the repository).

## Updating

The add-on builds the current `main` branch of this repository. Bump `version` in
`opengym/config.yaml` (or use "Rebuild") to pick up changes.
