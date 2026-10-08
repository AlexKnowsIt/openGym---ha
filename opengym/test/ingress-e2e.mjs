// The app in a real browser behind a stand-in for the Supervisor's ingress proxy, as
// opengym/test/smoke.sh sets it up: an iframe at /api/hassio_ingress/<token>/, prefix stripped,
// X-Remote-User-* added. Catches what only a browser shows: the app asking the site root for
// /api/... instead of its own prefix, a blank frame, a page error, no sign-in.
// Usage: node ingress-e2e.mjs <url of the page holding the iframe>
// Playwright is resolved from $PLAYWRIGHT (a path to its index.mjs) or as the bare package.
import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright')
const PREFIX = '/api/hassio_ingress/TOKEN123/'
const url = process.argv[2]

const browser = await chromium.launch({ args: ['--no-proxy-server'] })
try {
  const page = await browser.newPage({ locale: 'en-US' })
  const errors = []
  const api = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => {
    const path = new URL(r.url()).pathname
    if (path.includes('/api/')) api.push({ path, status: r.status() })
  })
  await page.goto(url)
  const frame = page.frameLocator('iframe')
  // Signed in without a login screen: the greeting carries the Home Assistant display name.
  await frame.getByText('E2E Tester').first().waitFor({ timeout: 20000 })
  // Pulling the profile is the last step of a signed-in boot.
  for (let i = 0; i < 40 && !api.some(a => a.path === PREFIX + 'api/data'); i++) await page.waitForTimeout(250)

  const outside = api.filter(a => !a.path.startsWith(PREFIX) && a.path !== '/')
  assert.deepEqual(outside, [], 'requests outside the ingress prefix')
  assert.ok(api.some(a => a.path === PREFIX + 'api/me' && a.status === 200), 'GET api/me ' + JSON.stringify(api))
  assert.ok(api.some(a => a.path === PREFIX + 'api/data' && a.status === 200), 'GET api/data ' + JSON.stringify(api))
  assert.deepEqual(api.filter(a => a.status >= 500), [])
  assert.deepEqual(errors, [], 'page errors')
  console.log('✓ ingress e2e')
} finally {
  await browser.close()
}
