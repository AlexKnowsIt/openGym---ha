"""Consistency of the add-on manifest with the files that implement it.

Each check is a mistake that would only show in Home Assistant: an add-on that does not appear in
the store, an ingress panel that never loads, an option the add-on silently ignores.
Run from the repository root: python3 opengym/test/check-config.py
"""
import re
import sys

import yaml

errors = []


def check(ok, msg):
    if not ok:
        errors.append(msg)


cfg = yaml.safe_load(open('opengym/config.yaml'))
nginx = open('opengym/nginx.conf').read()
run = open('opengym/run.sh').read()
workflow = yaml.safe_load(open('.github/workflows/ha-addon.yml'))
repo = yaml.safe_load(open('repository.yaml'))

for key in ('name', 'version', 'slug', 'description', 'arch'):
    check(key in cfg, f'config.yaml: "{key}" is required')
for key in ('name', 'url', 'maintainer'):
    check(key in repo, f'repository.yaml: "{key}" is required')
check(isinstance(cfg.get('version'), str), 'config.yaml: version must be a quoted string')
check(re.fullmatch(r'[a-z0-9_]+', cfg.get('slug', '')), 'config.yaml: slug must be lowercase letters, digits, _')

# Ingress: Home Assistant connects to ingress_port, nginx has to listen there and let only the
# Supervisor in, or X-Remote-User-* could be forged by any other container.
check(cfg.get('ingress') is True, 'config.yaml: ingress must be true')
port = cfg.get('ingress_port')
check(re.search(rf'^\s*listen\s+{port};', nginx, re.M), f'nginx.conf must listen on ingress_port {port}')
check(re.search(r'^\s*allow 172\.30\.32\.2;', nginx, re.M) and re.search(r'^\s*deny all;', nginx, re.M),
      'nginx.conf must allow only the Supervisor (172.30.32.2) and deny everything else')
check('X-Frame-Options' not in nginx and 'frame-ancestors' not in nginx,
      'nginx.conf must not forbid framing: the ingress panel is an iframe')
check('ports' not in cfg, 'config.yaml: no published ports, the add-on is reachable through ingress only')
check(re.search(r'HOST=127\.0\.0\.1', run), 'run.sh must bind the API to 127.0.0.1')
check(re.search(r'HA_INGRESS=1', run), 'run.sh must set HA_INGRESS=1')

# The image Home Assistant pulls has to be one the workflow builds, for every arch offered.
image = cfg.get('image', '')
check('{arch}' in image, 'config.yaml: image must contain {arch}')
check(image == image.lower(), 'config.yaml: image must be lowercase (ghcr.io refuses capitals)')
built = {m['arch'] for m in workflow['jobs']['build']['strategy']['matrix']['include']}
check(set(cfg.get('arch', [])) == built, f'config.yaml arch {cfg.get("arch")} != arches the workflow builds {sorted(built)}')

# Every option has a schema entry, and run.sh reads each one (an option nobody reads is a lie).
options, schema = cfg.get('options', {}), cfg.get('schema', {})
check(set(options) == set(schema), f'config.yaml: options {sorted(options)} and schema {sorted(schema)} differ')
read = set(re.findall(r'\$\(opt (\w+)\)', run))
check(read == set(options), f'run.sh reads {sorted(read)}, config.yaml offers {sorted(options)}')

if errors:
    print('\n'.join('✗ ' + e for e in errors))
    sys.exit(1)
print('✓ add-on manifest consistent')
