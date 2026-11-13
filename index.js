import { NativeCodexAuth, PLUGIN_VERSION } from './controller.js';

export const name = 'native-codex-oauth-ui';
export const inject = ['authorization', 'credentials', 'settings', 'llm', 'connection', 'tools'];
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const PUBLIC_ERRORS = new Set(['invalid-request', 'forbidden', 'disposed', 'busy', 'flow-unavailable', 'route-missing', 'api-key-override', 'endpoint-override', 'invalid-callback', 'stale-prompt', 'stale-attempt']);
const fail = code => { throw Object.assign(new Error(code), { code }); };

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) fail('invalid-request');
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const result = await new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('invalid-request')); };
        if (signal.aborted) { reject(new Error('invalid-request')); return; }
        signal.addEventListener('abort', abort, { once: true });
        reader.read().then(value => { signal.removeEventListener('abort', abort); resolve(value); }, () => { signal.removeEventListener('abort', abort); reject(new Error('invalid-request')); });
      });
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 16384) fail('invalid-request');
      chunks.push(result.value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-request');
    return value;
  } catch { fail('invalid-request'); }
  finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
    try { reader.releaseLock(); } catch {}
  }
}

export function apply(ctx) {
  const auth = new NativeCodexAuth({ authorization: ctx.authorization, credentials: ctx.credentials, settings: ctx.settings, llm: ctx.llm });
  let clientCheck = null;
  ctx.effect(() => () => auth.dispose());
  // The carrier applies the shared authenticated Host/Origin boundary. Mutations
  // also require a per-runtime CSRF nonce and JSON, never a tool-call entry point.
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/local-codex-oauth', methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') return Response.json(await auth.browserStatus(), { headers: HEADERS });
        if (request.method !== 'POST') return new Response(null, { status: 405, headers: HEADERS });
        if (!auth.csrfMatches(request.headers.get('X-Codex-OAuth-CSRF')) || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) fail('forbidden');
        const body = await readBody(request);
        let result;
        switch (body.action) {
          case 'client-ready':
            if (body.clientVersion !== PLUGIN_VERSION) fail('invalid-request');
            clientCheck = { version: PLUGIN_VERSION, transport: 'fetch', checkedAt: Date.now() };
            result = { accepted: true };
            break;
          case 'start': result = await auth.start(body.mode); break;
          case 'cancel': result = await auth.cancel(body.attemptId); break;
          case 'respond': result = await auth.respond(body); break;
          default: fail('invalid-request');
        }
        return Response.json(result, { headers: HEADERS });
      } catch (cause) {
        const code = PUBLIC_ERRORS.has(cause?.code) ? cause.code : 'service-unavailable';
        const status = code === 'forbidden' ? 403 : ['busy', 'stale-attempt', 'stale-prompt'].includes(code) ? 409 : code === 'service-unavailable' ? 503 : 400;
        return Response.json({ error: code }, { status, headers: HEADERS });
      }
    },
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'codex_login_status',
    description: 'Read native openai-codex OAuth readiness and saved-credential presence. Does not start login, return authorization links/codes/tokens, or verify model access.',
    deferLoading: true,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute() {
      try { return { ...await auth.safeStatus(), clientCheck }; }
      catch { return { pluginVersion: PLUGIN_VERSION, phase: 'failed', failure: 'service-unavailable' }; }
    },
  }));
}
