// Requests against a running add-on container, made from inside the test network by
// opengym/test/smoke.sh. The mode says which address this runs from and at what point:
//   supervisor  from 172.30.32.2, first start
//   outsider    from any other container
//   restarted   from 172.30.32.2, after the container was replaced (an update)
import assert from 'node:assert/strict'

const ADDON = 'http://172.30.33.5'
const BASE = ADDON + ':8099'
const ALEX = '0123456789abcdef0123456789abcdef'
const SAM = 'fedcba9876543210fedcba9876543210'
// Home Assistant sends names as UTF-8 bytes; fetch would send each character as one latin1 byte.
const raw = s => Buffer.from(s, 'utf8').toString('latin1')
const as = (id, name) => ({ 'X-Remote-User-Id': id, 'X-Remote-User-Name': raw(name.toLowerCase()), 'X-Remote-User-Display-Name': raw(name) })
const mode = process.argv[2]

async function get(path, headers = {}, init = {}) {
  const r = await fetch(BASE + path, { headers, ...init })
  const text = await r.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* html */ }
  return { status: r.status, headers: r.headers, text, body }
}

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { if ((await get('/api/health')).status === 200) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('add-on did not answer within 30 s')
}

const checks = {
  async supervisor() {
    await ready()

    const index = await get('/')
    assert.equal(index.status, 200)
    assert.match(index.text, /<script[^>]+src="\.\/assets\//, 'assets must be relative, ingress serves under a prefix')
    assert.equal(index.headers.get('x-frame-options'), null, 'the ingress panel is an iframe')
    const asset = index.text.match(/\.\/(assets\/[^"]+\.js)/)[1]
    const js = await get('/' + asset)
    assert.equal(js.status, 200)
    assert.match(js.headers.get('cache-control') || '', /no-cache/)
    assert.equal((await get('/sw.js')).status, 200)
    assert.equal((await get('/manifest.json')).status, 200)

    // Options from /data/options.json reach the API.
    const cfg = await get('/api/config')
    assert.equal(cfg.body.allow_guest, false)
    assert.equal(cfg.body.default_lang, 'de')

    // Home Assistant users: the first is admin, each gets their own profile, names are UTF-8.
    const alex = await get('/api/me', as(ALEX, 'Älex'))
    assert.equal(alex.status, 200)
    assert.deepEqual(alex.body.user, { id: 'ha-' + ALEX, name: 'Älex', admin: true })
    const sam = await get('/api/me', as(SAM, 'Sam'))
    assert.deepEqual(sam.body.user, { id: 'ha-' + SAM, name: 'Sam', admin: false })
    assert.equal((await get('/api/me')).status, 401, 'no header, no session')
    assert.equal((await get('/api/me', { 'X-Remote-User-Id': 'admin' })).status, 401)

    // Sync: what one user writes comes back to them, and only to them.
    const json = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }
    const state = { unit: 'kg', workouts: [], routines: [], bw: [{ d: '2026-10-01', w: 82.5 }] }
    const put = await get('/api/data', { ...as(ALEX, 'Älex'), ...json }, { method: 'PUT', body: JSON.stringify({ state }) })
    assert.equal(put.status, 200, put.text)
    assert.deepEqual((await get('/api/data', as(ALEX, 'Älex'))).body.state.bw, state.bw)
    assert.equal((await get('/api/data', as(SAM, 'Sam'))).body.state?.bw, undefined)

    // A cross-site write is still refused under ingress.
    const forged = await get('/api/data', { ...as(ALEX, 'Älex'), 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      { method: 'PUT', body: JSON.stringify({ state }) })
    assert.equal(forged.status, 403)

    // Upload limit: the whole history travels in one PUT, larger than nginx's 1 MiB default.
    const big = { ...state, notes: 'x'.repeat(2 * 1024 * 1024) }
    const large = await get('/api/data', { ...as(ALEX, 'Älex'), ...json }, { method: 'PUT', body: JSON.stringify({ state: big }) })
    assert.notEqual(large.status, 413, 'nginx refused a 2 MB sync')
  },

  async outsider() {
    // Only the Supervisor may talk to the add-on; anyone else could put any user in the headers.
    const r = await fetch(BASE + '/api/me', { headers: as(ALEX, 'Älex') })
    assert.equal(r.status, 403)
    await assert.rejects(fetch(ADDON + ':3000/api/health'), 'the API must not be reachable directly')
  },

  async restarted() {
    await ready()
    const alex = await get('/api/me', as(ALEX, 'Älex'))
    assert.deepEqual(alex.body.user, { id: 'ha-' + ALEX, name: 'Älex', admin: true }, 'profile lost across an update')
    assert.equal((await get('/api/data', as(ALEX, 'Älex'))).body.state.bw[0].w, 82.5, 'data lost across an update')
  },
}

if (!checks[mode]) throw new Error('mode: ' + Object.keys(checks).join(' | '))
await checks[mode]()
console.log(`✓ ${mode}`)
