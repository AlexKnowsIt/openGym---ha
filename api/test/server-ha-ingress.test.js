/* Home Assistant add-on: with HA_INGRESS on, the Supervisor's X-Remote-User-* headers sign the
   person in, one profile per Home Assistant user. Off (every other deployment), the same headers
   are ignored. Real server.js in a child, same harness as server-admin-delete.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HID = '0123456789abcdef0123456789abcdef';

async function startServer(t, env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-ha-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ...env },
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.me = async headers => {
    const r = await fetch(`${h.api}/api/me`, { headers });
    return { status: r.status, body: await r.json() };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}

test('HA_INGRESS signs the Home Assistant user in and keeps one profile per user', async t => {
  const h = await startServer(t, { HA_INGRESS: '1', FIRST_USER_ADMIN: '1' });
  const headers = { 'X-Remote-User-Id': HID, 'X-Remote-User-Name': 'alex', 'X-Remote-User-Display-Name': 'Alex' };
  const a = await h.me(headers);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.user, { id: 'ha-' + HID, name: 'Alex', admin: true });
  const b = await h.me(headers);
  assert.equal(b.body.user.id, a.body.user.id);
  assert.equal(h.db().users.length, 1);
  // No header, or one that is not a Home Assistant user id: no session.
  assert.equal((await h.me({})).status, 401);
  assert.equal((await h.me({ 'X-Remote-User-Id': '../../etc' })).status, 401);
});

test('without HA_INGRESS the headers are ignored', async t => {
  const h = await startServer(t, {});
  assert.equal((await h.me({ 'X-Remote-User-Id': HID })).status, 401);
});
