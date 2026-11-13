import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const RECORD_KEY = 'llm-pi-ai/openai-codex';
export const PLUGIN_VERSION = '0.1.2';
const error = code => Object.assign(new Error(code), { code });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function atPath(value, path) {
  for (const key of path) {
    if (!own(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

// Never forward arbitrary provider messages, error bodies or links to a browser.
export function officialAuthUrl(value) {
  if (typeof value !== 'string' || value.length > 16384) return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://auth.openai.com' || url.username || url.password || url.hash) return undefined;
    if (url.pathname === '/codex/device') return url.href;
    if (url.pathname !== '/oauth/authorize' || url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256') return undefined;
    if (url.searchParams.get('redirect_uri') !== 'http://localhost:1455/auth/callback') return undefined;
    if (!/^[a-zA-Z0-9_-]{16,256}$/.test(url.searchParams.get('state') ?? '')) return undefined;
    if (!/^[a-zA-Z0-9_-]{43,256}$/.test(url.searchParams.get('code_challenge') ?? '')) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function validateManualCallback(value, authorizationUrl) {
  if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value)) throw error('invalid-callback');
  try {
    const expected = new URL(authorizationUrl).searchParams.get('state');
    const url = new URL(value.trim());
    if (url.origin !== 'http://localhost:1455' || url.pathname !== '/auth/callback' || url.username || url.password || url.hash) throw error('invalid-callback');
    if (!expected || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== expected) throw error('invalid-callback');
    if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code') || url.searchParams.get('code').length > 4096) throw error('invalid-callback');
    return url.href;
  } catch { throw error('invalid-callback'); }
}

function failureCode(value) {
  const codes = { NO_FLOW: 'flow-unavailable', UNKNOWN_METHOD: 'flow-unavailable', ALREADY_IN_FLIGHT: 'busy', NOT_COMMITTED: 'not-committed', 'unsupported-prompt': 'unsupported-prompt', 'unsafe-auth-link': 'unsafe-auth-link' };
  return own(codes, value?.code) ? codes[value.code] : 'auth-failed';
}

export class NativeCodexAuth {
  constructor(services, { timeoutMs = 600_000, now = Date.now } = {}) {
    this.services = services;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.csrf = randomBytes(32).toString('base64url');
    this.attempt = null;
    this.disposed = false;
  }
  csrfMatches(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(this.csrf));
  }
  async readiness() {
    const { llm, settings, credentials, authorization } = this.services;
    const directory = await llm.listConfigurableProviders();
    const entry = directory.find(item => item.provider === 'openai-codex');
    const documents = await settings.describe({ redactSecrets: true });
    const doc = entry && documents.find(item => String(item.ns) === entry.settingsNs);
    const profile = doc && atPath(doc.value, entry.settingsPath ?? []);
    // Only the existing pi-ai configuration surface is supported, never another
    // plugin's same-named provider. Do not register or mutate a route here.
    const native = entry?.settingsPath?.[0] === 'providers';
    const routeConfigured = Boolean(native && object(profile));
    const flow = authorization.describe(RECORD_KEY);
    const record = await credentials.describeRecord(RECORD_KEY);
    let endpointSupported = true;
    if (typeof profile?.baseURL === 'string' && profile.baseURL.trim()) {
      try {
        const url = new URL(profile.baseURL);
        endpointSupported = url.origin === 'https://chatgpt.com' && !url.username && !url.password && /^\/backend-api\/?$/.test(url.pathname) && !url.search && !url.hash;
      } catch { endpointSupported = false; }
    }
    return {
      flowAvailable: Boolean(flow?.methods.some(method => method.id === 'oauth')),
      routeConfigured,
      apiKeyOverride: Boolean(profile?.apiKeyEnv),
      endpointSupported,
      credentialConfigured: Boolean(record.configured),
      credentialKind: record.configured ? record.kind : null,
      otherLoginInFlight: Boolean(flow?.inFlight && !this.attempt?.active),
    };
  }
  async safeStatus() {
    const ready = await this.readiness();
    const attempt = this.attempt;
    return {
      pluginVersion: PLUGIN_VERSION, ...ready,
      phase: attempt?.phase ?? 'idle',
      failure: attempt?.failure ?? null,
      active: Boolean(attempt?.active),
    };
  }
  async browserStatus() {
    const status = await this.safeStatus();
    const attempt = this.attempt;
    return {
      ...status, csrf: this.csrf,
      attempt: attempt?.active ? {
        id: attempt.id, mode: attempt.mode, expiresAt: attempt.expiresAt,
        ...(attempt.authUrl ? { authUrl: attempt.authUrl } : {}),
        ...(attempt.deviceCode ? { deviceCode: attempt.deviceCode } : {}),
        ...(attempt.pending ? { pending: { id: attempt.pending.id, kind: 'callback' } } : {}),
      } : null,
    };
  }
  async start(mode) {
    if (this.disposed) throw error('disposed');
    if (!['browser', 'device_code'].includes(mode)) throw error('invalid-request');
    if (this.attempt?.active) throw error('busy');
    const ready = await this.readiness();
    if (this.disposed) throw error('disposed');
    if (this.attempt?.active || ready.otherLoginInFlight) throw error('busy');
    if (!ready.flowAvailable) throw error('flow-unavailable');
    if (!ready.routeConfigured) throw error('route-missing');
    if (ready.apiKeyOverride) throw error('api-key-override');
    if (!ready.endpointSupported) throw error('endpoint-override');
    const attempt = {
      id: randomUUID(), mode, controller: new AbortController(), active: true,
      phase: 'starting', failure: null, authUrl: null, deviceCode: null,
      pending: null, expiresAt: this.now() + this.timeoutMs, timedOut: false,
    };
    this.attempt = attempt;
    attempt.timer = setTimeout(() => {
      attempt.timedOut = true;
      attempt.controller.abort();
    }, this.timeoutMs);
    // All rejections are consumed here and reduced to fixed public codes.
    attempt.task = this.run(attempt);
    return this.browserStatus();
  }
  isCurrent(attempt) {
    return !this.disposed && this.attempt === attempt && attempt.active && !attempt.controller.signal.aborted;
  }
  async run(attempt) {
    try {
      const outcome = await this.services.authorization.begin({
        key: RECORD_KEY, method: 'oauth', signal: attempt.controller.signal,
        interaction: {
          notify: notice => {
            if (!this.isCurrent(attempt)) return;
            if (notice.url !== undefined) {
              const link = officialAuthUrl(notice.url);
              if (!link) throw error('unsafe-auth-link');
              attempt.authUrl = link;
              attempt.phase = 'waiting';
              if (notice.code !== undefined) {
                if (attempt.mode !== 'device_code' || !/^[A-Za-z0-9-]{4,64}$/.test(notice.code)) throw error('unsafe-auth-link');
                attempt.deviceCode = notice.code;
              }
            }
          },
          prompt: prompt => this.prompt(attempt, prompt),
        },
      });
      if (attempt.controller.signal.aborted || this.disposed) {
        attempt.phase = attempt.timedOut ? 'failed' : 'cancelled';
        attempt.failure = attempt.timedOut ? 'timeout' : null;
      } else if (outcome?.status === 'authorized') attempt.phase = 'authorized';
      else attempt.phase = 'cancelled';
    } catch (cause) {
      if (attempt.controller.signal.aborted || this.disposed) {
        attempt.phase = attempt.timedOut ? 'failed' : 'cancelled';
        attempt.failure = attempt.timedOut ? 'timeout' : null;
      } else {
        attempt.phase = 'failed';
        attempt.failure = failureCode(cause);
      }
    } finally {
      clearTimeout(attempt.timer);
      attempt.pending?.reject(error('cancelled'));
      attempt.pending = null;
      attempt.authUrl = null;
      attempt.deviceCode = null;
      attempt.active = false;
    }
  }
  prompt(attempt, prompt) {
    if (!this.isCurrent(attempt) || prompt.signal?.aborted) return Promise.reject(error('cancelled'));
    if (prompt.kind === 'select') {
      // This is the known native browser/device selector. The preceding user
      // button already selected the method; never answer other authority prompts.
      const ids = prompt.options?.map(option => option.id);
      if (!Array.isArray(ids) || ids.length !== 2 || !ids.includes('browser') || !ids.includes('device_code')) return Promise.reject(error('unsupported-prompt'));
      return Promise.resolve(attempt.mode);
    }
    if (prompt.kind !== 'text' || attempt.mode !== 'browser' || !attempt.authUrl || attempt.pending) return Promise.reject(error('unsupported-prompt'));
    return new Promise((resolve, reject) => {
      const pending = { id: randomUUID() };
      const cleanup = () => {
        attempt.controller.signal.removeEventListener('abort', abort);
        prompt.signal?.removeEventListener('abort', abort);
        if (attempt.pending === pending) attempt.pending = null;
      };
      const abort = () => { cleanup(); reject(error('cancelled')); };
      pending.resolve = value => { cleanup(); resolve(value); };
      pending.reject = cause => { cleanup(); reject(cause); };
      attempt.pending = pending;
      attempt.controller.signal.addEventListener('abort', abort, { once: true });
      prompt.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  async respond({ attemptId, promptId, value }) {
    const attempt = this.attempt;
    if (!attempt?.active || attempt.id !== attemptId || attempt.pending?.id !== promptId) throw error('stale-prompt');
    if (!this.isCurrent(attempt)) throw error('stale-prompt');
    const checked = validateManualCallback(value, attempt.authUrl);
    attempt.pending.resolve(checked);
    return this.browserStatus();
  }
  async cancel(attemptId) {
    const attempt = this.attempt;
    if (!attempt?.active || attempt.id !== attemptId) throw error('stale-attempt');
    attempt.phase = 'cancelled';
    // Abort only this plugin's attempt. Never cancel another window/plugin's
    // authorization or delete a previously committed credential.
    attempt.controller.abort();
    return this.browserStatus();
  }
  async dispose() {
    this.disposed = true;
    const attempt = this.attempt;
    if (attempt?.active) {
      attempt.controller.abort();
      await attempt.task;
    }
  }
}
