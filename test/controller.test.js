import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { NativeCodexAuth, RECORD_KEY, officialAuthUrl, validateManualCallback } from '../controller.js';

const STATE = 'mock_state_1234567890123456';
const AUTH = `https://auth.openai.com/oauth/authorize?response_type=code&code_challenge_method=S256&redirect_uri=${encodeURIComponent('http://localhost:1455/auth/callback')}&state=${STATE}&code_challenge=${'a'.repeat(43)}`;
const CALLBACK = `http://localhost:1455/auth/callback?state=${STATE}&code=MOCK_CODE`;
const turn = () => new Promise(resolve => setImmediate(resolve));
const code = expected => cause => cause?.code === expected && cause.message === expected;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness(options = {}) {
  const calls = [];
  const sessions = [];
  let record = options.record ?? { configured: false };
  const services = {
    llm: { async listConfigurableProviders() {
      calls.push(['providers']);
      return options.noRoute ? [] : [{ provider: 'openai-codex', settingsNs: 'mock-pi', settingsPath: options.path ?? ['providers', 'openai-codex'] }];
    } },
    settings: { async describe(request) {
      calls.push(['settings.describe', request]);
      return [{ ns: 'mock-pi', value: { providers: { 'openai-codex': options.profile ?? {} } } }];
    } },
    credentials: { async describeRecord(key) { calls.push(['credentials.describeRecord', key]); return record; } },
    authorization: {
      describe(key) { calls.push(['authorization.describe', key]); return options.noFlow ? undefined : { methods: [{ id: 'oauth' }], inFlight: options.otherLogin ?? false }; },
      begin(request) {
        calls.push(['authorization.begin', request.key, request.method]);
        const completion = deferred();
        const session = { request, completion };
        sessions.push(session);
        if (!options.ignoreAbort) request.signal.addEventListener('abort', () => completion.resolve({ status: 'cancelled' }), { once: true });
        return completion.promise;
      },
    },
  };
  for (const [service, methods] of [[services.credentials, ['get', 'set', 'delete', 'read', 'resolve', 'getRecord', 'setRecord']], [services.settings, ['get', 'set', 'patch', 'update']]]) {
    for (const method of methods) service[method] = () => { calls.push(['FORBIDDEN', method]); throw new Error('Mock disallows secret reads and configuration writes'); };
  }
  const auth = new NativeCodexAuth(services, { timeoutMs: 600_000, ...options.controller });
  return { auth, calls, sessions, setRecord(value) { record = value; }, async close() {
    // A deliberately non-cooperative mock must still settle during teardown.
    for (const session of sessions) session.completion.resolve({ status: 'cancelled' });
    await auth.dispose();
    assert.equal(calls.some(call => call[0] === 'FORBIDDEN'), false);
  } };
}

async function using(options, run) {
  const h = harness(options);
  try { await run(h); } finally { await h.close(); }
}
async function beginCallback(h) {
  const status = await h.auth.start('browser');
  const session = h.sessions.at(-1);
  session.request.interaction.notify({ url: AUTH });
  const promptController = new AbortController();
  const answer = session.request.interaction.prompt({ kind: 'text', signal: promptController.signal });
  // Attach a rejection handler immediately, even when the test later awaits it.
  answer.catch(() => {});
  return { status, session, promptController, answer, browser: await h.auth.browserStatus() };
}

test('official authorization URL allowlist and PKCE validation', () => {
  assert.equal(officialAuthUrl(AUTH), new URL(AUTH).href);
  assert.equal(officialAuthUrl('https://auth.openai.com/codex/device'), 'https://auth.openai.com/codex/device');
  for (const bad of [
    AUTH.replace('auth.openai.com', 'auth.openai.com.evil.invalid'),
    AUTH.replace('https:', 'http:'), AUTH.replace('/oauth/authorize', '/other'),
    AUTH.replace('S256', 'plain'), AUTH.replace('response_type=code', 'response_type=token'),
    AUTH.replace('localhost', '127.0.0.1'), AUTH.replace(STATE, 'short'),
    AUTH.replace('a'.repeat(43), 'short'), `${AUTH}#fragment`,
    AUTH.replace('https://', 'https://user:password@'), undefined, {}, 'x'.repeat(16385),
  ]) assert.equal(officialAuthUrl(bad), undefined);
});

test('manual callback requires exact localhost route, nonempty code and matching unique state', () => {
  assert.equal(validateManualCallback(CALLBACK, AUTH), new URL(CALLBACK).href);
  for (const bad of [
    'MOCK_CODE', `MOCK_CODE#${STATE}`, CALLBACK.replace('localhost', '127.0.0.1'),
    CALLBACK.replace('1455', '1456'), CALLBACK.replace('/auth/callback', '/callback'),
    CALLBACK.replace('http:', 'https:'), CALLBACK.replace(STATE, 'wrong_state'),
    CALLBACK.replace('&code=MOCK_CODE', ''), CALLBACK.replace('MOCK_CODE', ''),
    `${CALLBACK}&state=${STATE}`, `${CALLBACK}&code=SECOND`, `${CALLBACK}#fragment`,
    `${CALLBACK}\n`, CALLBACK.replace('http://', 'http://user:pass@'),
    CALLBACK.replace('MOCK_CODE', 'x'.repeat(4097)),
  ]) assert.throws(() => validateManualCallback(bad, AUTH), code('invalid-callback'));
});

test('readiness and safeStatus are metadata-only and omit all interaction secrets', async () => using({}, async h => {
  const ready = await h.auth.readiness();
  assert.deepEqual(ready, { flowAvailable: true, routeConfigured: true, apiKeyOverride: false, endpointSupported: true, credentialConfigured: false, credentialKind: null, otherLoginInFlight: false });
  const { answer } = await beginCallback(h);
  const safe = await h.auth.safeStatus();
  assert.equal(safe.phase, 'waiting');
  assert.equal(safe.active, true);
  assert.deepEqual(Object.keys(safe).sort(), ['active', 'apiKeyOverride', 'credentialConfigured', 'credentialKind', 'endpointSupported', 'failure', 'flowAvailable', 'otherLoginInFlight', 'phase', 'pluginVersion', 'routeConfigured'].sort());
  const text = JSON.stringify(safe);
  for (const secret of [h.auth.csrf, STATE, AUTH, 'MOCK_CODE', 'csrf', 'authUrl', 'deviceCode', 'pending', 'prompt', 'token']) assert.equal(text.includes(secret), false);
  assert.ok(h.calls.filter(call => call[0] === 'settings.describe').every(call => call[1].redactSecrets === true));
  assert.ok(h.calls.filter(call => call[0] === 'credentials.describeRecord').every(call => call[1] === RECORD_KEY));
  await h.auth.cancel(h.auth.attempt.id);
  await assert.rejects(answer, code('cancelled'));
}));

test('start fixes credential key and oauth method; only known browser/device selector is answered', async () => {
  for (const mode of ['browser', 'device_code']) await using({}, async h => {
    const status = await h.auth.start(mode);
    const session = h.sessions[0];
    assert.equal(session.request.key, RECORD_KEY);
    assert.equal(session.request.method, 'oauth');
    assert.equal(await session.request.interaction.prompt({ kind: 'select', options: [{ id: 'device_code' }, { id: 'browser' }] }), mode);
    for (const prompt of [{ kind: 'select', options: [{ id: 'browser' }] }, { kind: 'select', options: [{ id: 'browser' }, { id: 'unknown' }] }, { kind: 'confirm' }]) await assert.rejects(session.request.interaction.prompt(prompt), code('unsupported-prompt'));
    assert.equal(h.auth.csrfMatches(status.csrf), true);
    for (const bad of [undefined, '', 'x'.repeat(43), '!', {}]) assert.equal(h.auth.csrfMatches(bad), false);
    await assert.rejects(h.auth.start(mode), code('busy'));
  });
});

test('readiness gates prevent any authorization request', async () => {
  for (const [options, expected] of [
    [{ noRoute: true }, 'route-missing'], [{ noFlow: true }, 'flow-unavailable'],
    [{ path: ['other', 'openai-codex'] }, 'route-missing'],
    [{ profile: { apiKeyEnv: 'MOCK_KEY_NAME' } }, 'api-key-override'],
    [{ profile: { baseURL: 'https://proxy.invalid/backend-api' } }, 'endpoint-override'],
    [{ otherLogin: true }, 'busy'],
  ]) await using(options, async h => {
    await assert.rejects(h.auth.start('browser'), code(expected));
    assert.equal(h.sessions.length, 0);
  });
  await using({}, async h => { await assert.rejects(h.auth.start('other'), code('invalid-request')); });
});

test('explicit reauthorization is allowed and a failure preserves the saved grant', async () => using({ record: { configured: true, kind: 'oauth' } }, async h => {
  await h.auth.start('browser');
  assert.equal(h.sessions.length, 1);
  h.sessions[0].completion.reject(new Error('MOCK_REAUTH_FAILURE'));
  await h.auth.attempt.task;
  const status = await h.auth.safeStatus();
  assert.equal(status.failure, 'auth-failed');
  assert.equal(status.credentialConfigured, true);
  assert.equal(status.credentialKind, 'oauth');
}));

test('manual response rejects stale identities and bad state without consuming the prompt', async () => using({}, async h => {
  const { answer, browser, session } = await beginCallback(h);
  await assert.rejects(session.request.interaction.prompt({ kind: 'text' }), code('unsupported-prompt'));
  const request = { attemptId: browser.attempt.id, promptId: browser.attempt.pending.id, value: CALLBACK };
  await assert.rejects(h.auth.respond({ ...request, attemptId: 'old' }), code('stale-prompt'));
  await assert.rejects(h.auth.respond({ ...request, promptId: 'old' }), code('stale-prompt'));
  await assert.rejects(h.auth.respond({ ...request, value: CALLBACK.replace(STATE, 'wrong') }), code('invalid-callback'));
  assert.equal((await h.auth.browserStatus()).attempt.pending.id, request.promptId);
  await h.auth.respond(request);
  assert.equal(await answer, new URL(CALLBACK).href);
  await assert.rejects(h.auth.respond(request), code('stale-prompt'));
  session.completion.resolve({ status: 'authorized' });
  await h.auth.attempt.task;
  const completed = await h.auth.browserStatus();
  assert.equal(completed.phase, 'authorized');
  assert.equal(completed.attempt, null);
  assert.equal(h.auth.attempt.authUrl, null);
  assert.equal(h.auth.attempt.pending, null);
  await assert.rejects(h.auth.cancel(request.attemptId), code('stale-attempt'));
}));

test('prompt signal abort removes pending callback and rejects its answer', async () => using({}, async h => {
  const { answer, promptController, browser, session } = await beginCallback(h);
  assert.equal(getEventListeners(promptController.signal, 'abort').length, 1);
  assert.equal(getEventListeners(session.request.signal, 'abort').length, 2);
  promptController.abort();
  await assert.rejects(answer, code('cancelled'));
  assert.equal(h.auth.attempt.pending, null);
  assert.equal(getEventListeners(promptController.signal, 'abort').length, 0);
  assert.equal(getEventListeners(session.request.signal, 'abort').length, 1);
  await assert.rejects(h.auth.respond({ attemptId: browser.attempt.id, promptId: browser.attempt.pending.id, value: CALLBACK }), code('stale-prompt'));
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(session.request.interaction.prompt({ kind: 'text', signal: aborted.signal }), code('cancelled'));
}));

test('cancel aborts only owned attempt, preserves credentials and isolates next attempt', async () => using({}, async h => {
  const first = await beginCallback(h);
  h.setRecord({ configured: true, kind: 'oauth' });
  await assert.rejects(h.auth.cancel('different-window'), code('stale-attempt'));
  assert.equal(first.session.request.signal.aborted, false);
  await h.auth.cancel(first.browser.attempt.id);
  await assert.rejects(first.answer, code('cancelled'));
  await h.auth.attempt.task;
  assert.equal((await h.auth.safeStatus()).credentialConfigured, true);
  h.setRecord({ configured: false });
  const next = await h.auth.start('device_code');
  assert.notEqual(next.attempt.id, first.browser.attempt.id);
  first.session.request.interaction.notify({ url: AUTH });
  assert.equal(h.auth.attempt.authUrl, null);
  await assert.rejects(first.session.request.interaction.prompt({ kind: 'select', options: [{ id: 'browser' }, { id: 'device_code' }] }), code('cancelled'));
}));

test('device code is browser-only transient data and is erased on success', async () => using({}, async h => {
  await h.auth.start('device_code');
  h.sessions[0].request.interaction.notify({ url: 'https://auth.openai.com/codex/device', code: 'MOCK-1234' });
  assert.equal((await h.auth.browserStatus()).attempt.deviceCode, 'MOCK-1234');
  assert.equal(JSON.stringify(await h.auth.safeStatus()).includes('MOCK-1234'), false);
  h.sessions[0].completion.resolve({ status: 'authorized' });
  await h.auth.attempt.task;
  assert.equal(h.auth.attempt.deviceCode, null);
  assert.equal(h.auth.attempt.authUrl, null);
  assert.equal((await h.auth.browserStatus()).attempt, null);
}));

test('provider failures are fixed public codes, never raw errors or token text', async () => {
  for (const [upstream, expected] of [['NO_FLOW', 'flow-unavailable'], ['UNKNOWN_METHOD', 'flow-unavailable'], ['NOT_COMMITTED', 'not-committed'], ['unrecognized', 'auth-failed'], ['constructor', 'auth-failed'], ['__proto__', 'auth-failed'], ['toString', 'auth-failed']]) await using({}, async h => {
    await h.auth.start('browser');
    h.sessions[0].completion.reject(Object.assign(new Error('RAW_TOKEN_secret https://evil.invalid'), { code: upstream }));
    await h.auth.attempt.task;
    const status = await h.auth.safeStatus();
    assert.equal(status.failure, expected);
    assert.equal(JSON.stringify(status).includes('RAW_TOKEN'), false);
    assert.equal(JSON.stringify(status).includes('evil.invalid'), false);
  });
});

test('dispose aborts callback, clears transient state and prevents later starts', async () => using({}, async h => {
  const { answer, session } = await beginCallback(h);
  await h.auth.dispose();
  await assert.rejects(answer, code('cancelled'));
  assert.equal(session.request.signal.aborted, true);
  assert.equal(h.auth.attempt.active, false);
  assert.equal(h.auth.attempt.pending, null);
  assert.equal(h.auth.attempt.authUrl, null);
  await assert.rejects(h.auth.start('browser'), code('disposed'));
}));

test('late authorized result cannot overwrite cancellation or erase a committed grant', async () => using({ ignoreAbort: true }, async h => {
  const status = await h.auth.start('browser');
  await h.auth.cancel(status.attempt.id);
  h.setRecord({ configured: true, kind: 'oauth' });
  h.sessions[0].completion.resolve({ status: 'authorized' });
  await h.auth.attempt.task;
  const finished = await h.auth.safeStatus();
  assert.equal(finished.phase, 'cancelled');
  assert.equal(finished.credentialConfigured, true);
}));

test('dispose stays cancelled when a non-cooperative flow later reports authorized', async () => using({ ignoreAbort: true }, async h => {
  await h.auth.start('browser');
  const disposed = h.auth.dispose();
  assert.equal(h.sessions[0].request.signal.aborted, true);
  h.sessions[0].completion.resolve({ status: 'authorized' });
  await disposed;
  assert.equal((await h.auth.safeStatus()).phase, 'cancelled');
  assert.equal((await h.auth.browserStatus()).attempt, null);
}));

test('unsafe provider notices cannot publish arbitrary links or codes', async () => {
  for (const [mode, notice] of [
    ['browser', { url: 'https://evil.invalid/authorize', code: 'MOCK-SECRET' }],
    ['browser', { url: AUTH, code: 'NOT-A-BROWSER-CODE' }],
    ['device_code', { url: 'https://auth.openai.com/codex/device', code: 'bad code with spaces' }],
  ]) await using({}, async h => {
    await h.auth.start(mode);
    const session = h.sessions[0];
    let failure;
    try { session.request.interaction.notify(notice); } catch (cause) { failure = cause; }
    assert.ok(code('unsafe-auth-link')(failure));
    // Model the authorization service consuming its failed callback and rejecting begin.
    session.completion.reject(failure);
    await h.auth.attempt.task;
    assert.equal((await h.auth.safeStatus()).failure, 'unsafe-auth-link');
    assert.equal((await h.auth.browserStatus()).attempt, null);
  });
});

test('attempt timeout aborts pending prompt and invalidates its identifiers', async () => using({ controller: { timeoutMs: 0 } }, async h => {
  const { answer, browser } = await beginCallback(h);
  await h.auth.attempt.task;
  await assert.rejects(answer, code('cancelled'));
  const status = await h.auth.safeStatus();
  assert.equal(status.active, false);
  assert.equal(status.phase, 'failed');
  assert.equal(status.failure, 'timeout');
  await assert.rejects(h.auth.respond({ attemptId: browser.attempt.id, promptId: browser.attempt.pending.id, value: CALLBACK }), code('stale-prompt'));
}));

// Let promise settlement microtasks finish without timers, polling, or external I/O.
test('concurrent start calls create exactly one isolated authorization', async () => using({}, async h => {
  const results = await Promise.allSettled([h.auth.start('browser'), h.auth.start('device_code')]);
  await turn();
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(h.sessions.length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'busy');
}));
