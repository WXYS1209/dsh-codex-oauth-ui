import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apply } from '../index.js';
import { PLUGIN_VERSION } from '../controller.js';

test('release metadata matches the Host client handshake and current DSH line', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, PLUGIN_VERSION);
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.2 <0.3.0');
});

function setup() {
  let route, tool, began = 0;
  const effects = [];
  const ctx = {
    authorization: {
      describe: () => ({ methods: [{ id: 'oauth' }], inFlight: false }),
      begin: request => { began++; return new Promise(resolve => request.signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })); },
    },
    credentials: { describeRecord: async () => ({ configured: false }) },
    llm: { listConfigurableProviders: () => [{ provider: 'openai-codex', settingsNs: 'pi', settingsPath: ['providers', 'openai-codex'] }] },
    settings: { describe: () => [{ ns: 'pi', value: { providers: { 'openai-codex': {} } } }] },
    connection: { fetch: { register: value => { route = value; return async () => {}; } } },
    tools: { register: value => { tool = value; return () => {}; } },
    effect: fn => effects.push(fn()),
  };
  apply(ctx);
  return {
    route, tool, ctx, began: () => began,
    async browser() { return (await route.fetch(new Request('http://localhost/api/local-codex-oauth'))).json(); },
    post(body, csrf, contentType = 'application/json') {
      return route.fetch(new Request('http://localhost/api/local-codex-oauth', { method: 'POST', headers: { 'Content-Type': contentType, ...(csrf ? { 'X-Codex-OAuth-CSRF': csrf } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    },
    async close() { for (const effect of effects.reverse()) if (typeof effect === 'function') await effect(); },
  };
}
async function using(run) { const h = setup(); try { await run(h); } finally { await h.close(); } }

test('installation and readonly status do not initiate authorization or expose browser-only material', async () => using(async h => {
  assert.equal(h.began(), 0);
  assert.equal(h.route.path, '/api/local-codex-oauth');
  assert.deepEqual(h.route.methods, ['GET', 'POST']);
  assert.equal(h.route.requestBody, 'buffered');
  assert.equal(h.tool.name, 'codex_login_status');
  assert.deepEqual(h.tool.parameters, { type: 'object', properties: {}, additionalProperties: false });
  const status = await h.tool.execute({ action: 'start' });
  assert.equal(h.began(), 0);
  assert.equal(status.flowAvailable, true);
  assert.equal(status.routeConfigured, true);
  for (const field of ['csrf', 'attempt', 'authUrl', 'deviceCode', 'token', 'prompt']) assert.equal(Object.hasOwn(status, field), false);
}));

test('browser status is no-store and GET has no authorization side effects', async () => using(async h => {
  const response = await h.route.fetch(new Request('http://localhost/api/local-codex-oauth'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const status = await response.json();
  assert.equal(typeof status.csrf, 'string');
  assert.equal(status.attempt, null);
  assert.equal(h.began(), 0);
}));

test('mutation requires both the runtime CSRF token and JSON content type', async () => using(async h => {
  const status = await h.browser();
  for (const [csrf, type] of [[undefined, 'application/json'], ['x'.repeat(43), 'application/json'], [status.csrf, 'application/x-www-form-urlencoded'], [status.csrf, 'text/plain']]) {
    const response = await h.post({ action: 'start', mode: 'browser' }, csrf, type);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  }
  assert.equal(h.began(), 0);
}));

test('explicit browser POST starts a flow, but the agent tool still returns no authorization materials', async () => using(async h => {
  const status = await h.browser();
  const started = await h.post({ action: 'start', mode: 'browser' }, status.csrf);
  assert.equal(started.status, 200);
  const active = await started.json();
  assert.equal(active.active, true);
  assert.equal(active.attempt.mode, 'browser');
  assert.equal(h.began(), 1);
  const safe = await h.tool.execute();
  assert.equal(safe.active, true);
  assert.equal(Object.hasOwn(safe, 'csrf'), false);
  assert.equal(Object.hasOwn(safe, 'attempt'), false);
  const cancelled = await h.post({ action: 'cancel', attemptId: active.attempt.id }, status.csrf);
  assert.equal(cancelled.status, 200);
}));

test('malformed, oversized and unknown actions fail without executing or echoing payloads', async () => using(async h => {
  const status = await h.browser();
  for (const payload of ['{raw-private-callback', '[]', 'null', JSON.stringify({ action: 'constructor', value: 'SECRET_SHOULD_NOT_ECHO' }), JSON.stringify({ action: 'start', mode: 'browser', value: 'x'.repeat(17000) })]) {
    const response = await h.post(payload, status.csrf);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid-request' });
  }
  assert.equal(h.began(), 0);
}));

test('stale callback requests return only a fixed error, never the callback content', async () => using(async h => {
  const status = await h.browser();
  const response = await h.post({ action: 'respond', attemptId: 'old', promptId: 'old', value: 'PRIVATE_CALLBACK_CODE' }, status.csrf);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'stale-prompt' });
}));

test('unexpected service errors are sanitized in both browser and model paths', async () => using(async h => {
  h.ctx.settings.describe = () => { throw Error('PRIVATE_CONFIG_SECRET'); };
  const response = await h.route.fetch(new Request('http://localhost/api/local-codex-oauth'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'service-unavailable' });
  assert.deepEqual(await h.tool.execute(), { pluginVersion: PLUGIN_VERSION, phase: 'failed', failure: 'service-unavailable' });
}));

test('real Request construction reproduces streaming GET failure while the installed route is buffered', async () => using(async h => {
  // DSH 0.2.2-rc.1 http-bridge streaming branch supplies a body unconditionally.
  // Exercise the actual Request constructor, not a mock browser/React renderer.
  const stream = new ReadableStream({ start(controller) { controller.close(); } });
  assert.throws(() => new Request('http://dsh.internal/api/local-codex-oauth', { method: 'GET', body: stream, duplex: 'half' }), TypeError);
  assert.equal(h.route.requestBody, 'buffered');
  const request = new Request('http://dsh.internal/api/local-codex-oauth', { method: 'GET' });
  assert.equal(request.body, null);
  const response = await h.route.fetch(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.pluginVersion, PLUGIN_VERSION);
  assert.equal(data.flowAvailable, true);
  assert.equal(typeof data.csrf, 'string');
  assert.equal(h.began(), 0);
}));

test('page readiness receipt proves parsed status and CSRF POST without initiating authorization', async () => using(async h => {
  const before = await h.tool.execute();
  assert.equal(before.clientCheck, null);
  const status = await h.browser();
  const stale = await h.post({ action: 'client-ready', clientVersion: '0.1.0' }, status.csrf);
  assert.equal(stale.status, 400);
  assert.equal((await h.tool.execute()).clientCheck, null);
  const response = await h.post({ action: 'client-ready', clientVersion: PLUGIN_VERSION }, status.csrf);
  assert.deepEqual(await response.json(), { accepted: true });
  const safe = await h.tool.execute();
  assert.equal(safe.clientCheck.version, PLUGIN_VERSION);
  assert.equal(safe.clientCheck.transport, 'fetch');
  assert.equal(typeof safe.clientCheck.checkedAt, 'number');
  assert.deepEqual(Object.keys(safe.clientCheck).sort(), ['checkedAt', 'transport', 'version']);
  assert.equal(JSON.stringify(safe).includes(status.csrf), false);
  assert.equal(safe.active, false);
  assert.equal(h.began(), 0);
}));

test('client keeps authority actions on explicit clicks and clears callback input before sending', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  assert.ok(source.includes("onClick: () => request({ action: 'start', mode: 'browser' })"));
  assert.ok(source.includes("onClick: () => request({ action: 'start', mode: 'device_code' })"));
  assert.ok(source.includes("type: 'password'"));
  assert.ok(source.includes("setCallback('');\n                    if (!validCallback(value))"));
  assert.ok(source.includes("rel: 'noopener noreferrer', referrerPolicy: 'no-referrer'"));
  assert.ok(source.includes("document.removeEventListener('visibilitychange', visible)"));
  for (const text of ['localStorage', 'sessionStorage', 'console.', 'dangerouslySetInnerHTML', 'document.body', '@deepseek-ai/dsh-client-ui-primitives']) assert.equal(source.includes(text), false);
  const css = source.match(/const css = `([\s\S]*?)`;/)[1];
  assert.equal(/#[a-f\d]{3,8}\b/i.test(css), false);
  for (const token of css.matchAll(/var\((--[^,)]+)/g)) assert.ok(token[1].startsWith('--dsw-alias-'));
});
