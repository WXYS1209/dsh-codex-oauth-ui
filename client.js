window.__ModuleLoader__.load({
  id: 'dsh-codex-oauth-ui',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'local-codex-oauth';
    const dictionaries = {
      zh: {
        title: 'Codex 授权', subtitle: '使用 Harness 内置的 openai-codex 订阅授权，不读取或导入外部 CLI 凭据。',
        browser: '浏览器登录', device: '设备码登录', refresh: '刷新状态', cancel: '取消本次授权', busy: '正在更新…', loading: '正在读取授权状态…',
        privacy: '授权仅在您点击登录后发起，不会自动切换模型或修改供应商配置。验证码、回调链接与授权令牌不要发送到聊天。',
        saved: '已保存订阅授权，模型权限需调用确认。', noCredential: '尚未保存订阅授权。', existingKey: '当前记录不是订阅授权，请检查模型设置。',
        missingRoute: '请先在「模型」设置添加内置 openai-codex 供应商，再回到此处登录。', override: '此路由配置了 API Key 覆盖。请先在模型设置中移除该覆盖；本页不会自动修改配置。',
        endpoint: '此路由不是受支持的官方 Codex 端点，已禁止登录。请检查模型设置。', noFlow: '当前 Harness 未提供内置 Codex 授权流程，请检查版本或插件配置。',
        openOfficial: '打开 OpenAI 官方授权页', linkMissing: '正在准备官方授权页…', unsafeLink: '无法安全打开授权地址，请取消后重试。',
        deviceCode: '设备验证码', codeWarning: '只在 OpenAI 官方授权页输入此验证码。不要将验证码、回调地址或令牌粘贴到聊天。', expires: '本次授权有效至',
        manual: '无法自动返回？手动提交回调', manualHelp: '仅当官方页面已完成授权但无法返回时，粘贴完整的 http://localhost:1455/auth/callback 回调链接（含 code 与 state 参数），不能仅填写授权码。内容只发送到本机 Host，提交后立即清空。',
        callback: '完整的本机回调链接', submit: '提交回调', callbackHint: '粘贴完整回调链接（隐藏显示）',
        idle: '尚未开始', starting: '正在启动授权', pending: '等待您完成官方授权', succeeded: '授权已完成', cancelled: '授权已取消', expired: '授权已过期，请重新开始', failed: '授权未完成',
        serviceError: '授权服务暂不可用，请刷新状态后重试。', csrf: '页面授权校验已过期，请刷新状态后重试。', conflict: '授权状态已改变，请刷新状态后重试。', invalid: '请求无法处理，请刷新状态后重试。', timeout: '授权请求超时，请刷新状态确认结果。',
        otherLogin: '另一项授权正在进行，请先完成或取消该授权。', authFailed: '本次授权未成功，请取消后重试；不会显示供应商原始错误内容。', notCommitted: '授权流程结束，但订阅授权尚未保存，请重试。', unsupportedPrompt: '本次授权需要暂不支持的交互，请取消后换一种登录方式。',
        hidden: '页面隐藏时暂停状态查询；离开此页不会撤销已发起的授权。',
      },
      en: {
        title: 'Codex authorization', subtitle: 'Use the built-in openai-codex subscription flow. External CLI credentials are never read or imported.',
        browser: 'Sign in with browser', device: 'Sign in with device code', refresh: 'Refresh status', cancel: 'Cancel this attempt', busy: 'Updating…', loading: 'Reading authorization status…',
        privacy: 'Authorization starts only when you click sign in. This page never switches your model or changes provider configuration. Do not send codes, callback URLs or tokens to chat.',
        saved: 'Subscription authorization is saved. Model access still needs to be confirmed by an actual request.', noCredential: 'No subscription authorization is saved yet.', existingKey: 'The stored record is not a subscription grant. Check Models settings.',
        missingRoute: 'First add the built-in openai-codex provider in Models settings, then return here to sign in.', override: 'This route has an API key override. Remove it in Models settings before signing in. This page never changes it automatically.',
        endpoint: 'This route does not use a supported official Codex endpoint. Sign-in is blocked; check Models settings.', noFlow: 'The built-in Codex authorization flow is unavailable. Check your Harness version or plugin configuration.',
        openOfficial: 'Open official OpenAI authorization', linkMissing: 'Preparing the official authorization page…', unsafeLink: 'The authorization URL could not be opened safely. Cancel and try again.',
        deviceCode: 'Device code', codeWarning: 'Enter this code only on the official OpenAI authorization page. Never paste the code, callback URL or tokens into chat.', expires: 'This attempt expires',
        manual: 'Cannot return automatically? Submit a callback', manualHelp: 'Only after completing official authorization, paste the full http://localhost:1455/auth/callback URL including code and state if automatic return failed. A bare authorization code is not accepted. It is sent only to the local Host and cleared immediately after submission.',
        callback: 'Full local callback URL', submit: 'Submit callback', callbackHint: 'Paste full callback URL (hidden)',
        idle: 'Not started', starting: 'Starting authorization', pending: 'Waiting for you to finish official authorization', succeeded: 'Authorization completed', cancelled: 'Authorization cancelled', expired: 'Authorization expired; start again', failed: 'Authorization did not complete',
        serviceError: 'Authorization service is unavailable. Refresh status and try again.', csrf: 'The page authorization check expired. Refresh status and try again.', conflict: 'Authorization state changed. Refresh status and try again.', invalid: 'The request could not be processed. Refresh status and try again.', timeout: 'The authorization request timed out. Refresh status to confirm its outcome.',
        otherLogin: 'Another authorization is in progress. Complete or cancel it first.', authFailed: 'Authorization did not succeed. Cancel and try again; raw provider errors are never displayed.', notCommitted: 'The flow ended without saving a subscription grant. Try again.', unsupportedPrompt: 'This attempt needs an unsupported interaction. Cancel and try another sign-in method.',
        hidden: 'Status checks pause while the page is hidden. Leaving this page does not revoke an attempt already started.',
      },
    };
    const css = `
.co-page{box-sizing:border-box;max-width:780px;width:100%;padding:24px;font:inherit;font-size:14px;line-height:1.6;color:var(--dsw-alias-label-primary)}.co-page h2{font-size:20px;font-weight:600;margin:0 0 6px}.co-subtitle,.co-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}.co-card{margin:20px 0 0;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.co-status{font-weight:500;margin:0 0 10px}.co-block,.co-error{font-size:13px;line-height:1.7;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;margin:12px 0;overflow-wrap:anywhere}.co-error{color:var(--dsw-alias-state-error-primary)}.co-block{color:var(--dsw-alias-state-warn-primary)}.co-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.co-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:13px;text-decoration:none;cursor:pointer}.co-primary{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-border-l2)}.co-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}.co-button:disabled{opacity:.55;cursor:default}.co-button:focus-visible,.co-input:focus-visible,.co-manual summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}.co-code-label{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:18px}.co-code{display:block;font-family:monospace;font-size:26px;letter-spacing:3px;font-weight:600;color:var(--dsw-alias-label-primary);padding:12px 14px;margin-top:6px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);overflow-wrap:anywhere}.co-manual{margin-top:20px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:16px}.co-manual summary{cursor:pointer;font-size:13px}.co-label{display:block;font-size:13px;margin:14px 0 6px}.co-input{box-sizing:border-box;display:block;width:100%;padding:8px 10px;min-height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}.co-note{margin:12px 0 0}.co-page p{overflow-wrap:anywhere}@media(max-width:520px){.co-page{padding:16px}.co-card{padding:14px}.co-actions .co-button{flex:1 1 auto}}
`;
    function safeOfficialLink(value) {
      if (typeof value !== 'string' || value.length > 16384) return null;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'auth.openai.com' && !url.username && !url.password && !url.port && ['/oauth/authorize', '/codex/device'].includes(url.pathname) ? url.href : null;
      } catch { return null; }
    }
    function validCallback(value) {
      if (typeof value !== 'string' || value.length > 8192 || /[\r\n]/.test(value)) return false;
      try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' && url.hostname === 'localhost' && url.port === '1455' &&
          url.pathname === '/auth/callback' && !url.username && !url.password && !url.hash &&
          ['code', 'state'].every(key => url.searchParams.getAll(key).length === 1 && Boolean(url.searchParams.get(key)));
      } catch { return false; }
    }
    // Provider text is never displayed. Only local messages for known states/codes.
    function phaseKey(value, active) {
      if (['succeeded', 'success', 'completed', 'authorized'].includes(value)) return 'succeeded';
      if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
      if (value === 'expired') return 'expired';
      if (['failed', 'failure', 'error'].includes(value)) return 'failed';
      if (['starting', 'initializing'].includes(value)) return 'starting';
      return active ? 'pending' : 'idle';
    }
    function failureKey(value) {
      if (['csrf', 'csrf-invalid', 'invalid-csrf', 'csrf-expired', 'forbidden'].includes(value)) return 'csrf';
      if (value === 'flow-unavailable') return 'noFlow';
      if (value === 'route-missing') return 'missingRoute';
      if (value === 'api-key-override') return 'override';
      if (value === 'endpoint-override') return 'endpoint';
      if (value === 'busy') return 'otherLogin';
      if (value === 'auth-failed') return 'authFailed';
      if (value === 'not-committed') return 'notCommitted';
      if (value === 'unsupported-prompt') return 'unsupportedPrompt';
      if (value === 'unsafe-auth-link') return 'unsafeLink';
      if (['conflict', 'attempt-mismatch', 'attempt-not-found', 'prompt-mismatch', 'not-active', 'stale-attempt', 'stale-prompt'].includes(value)) return 'conflict';
      if (['timeout', 'expired'].includes(value)) return 'timeout';
      if (['invalid-request', 'invalid-response', 'invalid-mode', 'invalid-callback'].includes(value)) return 'invalid';
      return 'serviceError';
    }
    function validSnapshot(data) {
      return data && typeof data === 'object' && !Array.isArray(data) &&
        ['flowAvailable', 'routeConfigured', 'apiKeyOverride', 'endpointSupported', 'credentialConfigured', 'active'].every(key => typeof data[key] === 'boolean') &&
        typeof data.csrf === 'string' && data.csrf.length > 0 && data.csrf.length <= 4096 &&
        (data.attempt === null || (data.attempt && typeof data.attempt.id === 'string' && ['browser', 'device_code'].includes(data.attempt.mode)));
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries));
        const t = ctx.locale.bind(NS);
        const subscriptions = new Set();
        let pluginActive = true;
        ctx.effect(() => () => {
          pluginActive = false;
          for (const dispose of subscriptions) dispose();
          subscriptions.clear();
        });
        function Page() {
          React.useSyncExternalStore(callback => ctx.locale.subscribe(callback), () => ctx.locale.getSnapshot());
          const [state, setState] = React.useState({ data: null, busy: false, posting: false, error: null });
          const [callback, setCallback] = React.useState('');
          const serviceRef = React.useRef(null);
          React.useEffect(() => {
            let live = true, pending = false, timer, controller, current = null, clientVerified = false;
            const update = value => { if (live && pluginActive) setState(previous => ({ ...previous, ...value })); };
            const clearTimer = () => { window.clearTimeout(timer); timer = undefined; };
            const schedule = () => {
              clearTimer();
              if (live && pluginActive && document.visibilityState === 'visible') timer = window.setTimeout(() => request(), current?.active ? 1000 : 15000);
            };
            const request = async payload => {
              if (!live || !pluginActive || pending || (!payload && document.visibilityState !== 'visible')) return;
              if (payload && !current?.csrf) { update({ error: 'csrf' }); return; }
              clearTimer();
              pending = true;
              controller = new AbortController();
              const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
              update({ busy: true, posting: Boolean(payload), error: null });
              try {
                const url = new URL('api/local-codex-oauth', document.baseURI);
                const response = await fetch(url, {
                  method: payload ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
                  headers: payload ? { 'Content-Type': 'application/json', 'X-Codex-OAuth-CSRF': current.csrf } : { Accept: 'application/json' },
                  ...(payload ? { body: JSON.stringify(payload) } : {}),
                });
                const data = await response.json();
                if (!response.ok) {
                  update({ error: failureKey(data?.error) });
                  return;
                }
                if (!validSnapshot(data)) throw new Error('local-shape');
                current = data;
                update({ data, error: null });
                if (!payload && !clientVerified) {
                  try {
                    const receipt = await fetch(url, {
                      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal,
                      headers: { 'Content-Type': 'application/json', 'X-Codex-OAuth-CSRF': data.csrf },
                      body: JSON.stringify({ action: 'client-ready', clientVersion: '0.1.1' }),
                    });
                    clientVerified = receipt.ok && (await receipt.json())?.accepted === true;
                  } catch { /* Diagnostic receipt never starts or changes authorization. */ }
                }
              } catch {
                if (live && pluginActive && !controller.signal.aborted) update({ error: signal.aborted ? 'timeout' : 'serviceError' });
              } finally {
                pending = false;
                update({ busy: false, posting: false });
                schedule();
              }
            };
            const visible = () => {
              clearTimer();
              if (document.visibilityState === 'visible') request();
            };
            const dispose = () => {
              if (!live) return;
              live = false;
              clearTimer();
              controller?.abort();
              document.removeEventListener('visibilitychange', visible);
              if (serviceRef.current?.request === request) serviceRef.current = null;
            };
            serviceRef.current = { request };
            subscriptions.add(dispose);
            document.addEventListener('visibilitychange', visible);
            request();
            return () => { dispose(); subscriptions.delete(dispose); };
          }, []);
          const data = state.data;
          const attempt = data?.active ? data.attempt : null;
          const prompt = attempt?.pending?.kind === 'callback' && typeof attempt.pending.id === 'string' ? attempt.pending : null;
          React.useEffect(() => { setCallback(''); }, [attempt?.id, prompt?.id]);
          const blocked = !data || !data.flowAvailable || !data.routeConfigured || data.apiKeyOverride || !data.endpointSupported || data.otherLoginInFlight === true;
          const canStart = !blocked && !state.busy && !data.active;
          const canAct = !state.busy && Boolean(data?.csrf);
          const authUrl = safeOfficialLink(attempt?.authUrl);
          const code = attempt?.mode === 'device_code' && typeof attempt.deviceCode === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(attempt.deviceCode) ? attempt.deviceCode : null;
          const request = payload => serviceRef.current?.request(payload);
          const expires = Number.isFinite(attempt?.expiresAt) && attempt.expiresAt > 0 ? new Date(attempt.expiresAt).toLocaleString(ctx.locale.getLocale().active) : null;
          const messages = data ? [
            !data.routeConfigured ? 'missingRoute' : null,
            data.apiKeyOverride ? 'override' : null,
            !data.endpointSupported ? 'endpoint' : null,
            !data.flowAvailable ? 'noFlow' : null,
            data.otherLoginInFlight === true ? 'otherLogin' : null,
          ].filter(Boolean) : [];
          return h('section', { className: 'co-page', 'aria-label': t('title') }, h('style', null, css),
            h('header', null, h('h2', null, t('title')), h('p', { className: 'co-subtitle' }, t('subtitle'))),
            h('p', { className: 'co-note' }, t('privacy')),
            h('div', { className: 'co-card', 'aria-busy': state.busy },
              h('p', { className: 'co-status', role: 'status', 'aria-live': 'polite' }, data ? t(phaseKey(data.phase, data.active)) : t('loading')),
              data ? h('p', { className: 'co-note' }, t(data.credentialConfigured ? data.credentialKind === 'grant' ? 'saved' : 'existingKey' : 'noCredential')) : null,
              ...messages.map(key => h('p', { key, className: 'co-block' }, t(key))),
              state.error ? h('p', { className: 'co-error', role: 'alert' }, t(state.error)) : null,
              data?.failure ? h('p', { className: 'co-error', role: 'status' }, t(failureKey(data.failure))) : null,
              h('div', { className: 'co-actions' },
                h('button', { type: 'button', className: 'co-button co-primary', disabled: !canStart, onClick: () => request({ action: 'start', mode: 'browser' }) }, t('browser')),
                h('button', { type: 'button', className: 'co-button', disabled: !canStart, onClick: () => request({ action: 'start', mode: 'device_code' }) }, t('device')),
                h('button', { type: 'button', className: 'co-button', disabled: state.busy, onClick: () => request() }, t(state.busy ? 'busy' : 'refresh'))),
              attempt ? h('div', null,
                h('div', { className: 'co-actions' }, authUrl ? h('a', { href: authUrl, className: 'co-button co-primary', target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer' }, t('openOfficial')) : h('p', { className: 'co-note' }, t(attempt.authUrl ? 'unsafeLink' : 'linkMissing')),
                  h('button', { type: 'button', className: 'co-button', disabled: !canAct, onClick: () => request({ action: 'cancel', attemptId: attempt.id }) }, t('cancel'))),
                code ? h('div', null, h('div', { className: 'co-code-label' }, t('deviceCode')), h('code', { className: 'co-code', 'aria-label': t('deviceCode') }, code)) : null,
                h('p', { className: 'co-note' }, t('codeWarning')),
                expires ? h('p', { className: 'co-note' }, `${t('expires')} ${expires}`) : null,
                prompt ? h('details', { className: 'co-manual', key: `${attempt.id}:${prompt.id}` },
                  h('summary', null, t('manual')),
                  h('p', { className: 'co-note' }, t('manualHelp')),
                  h('form', { autoComplete: 'off', onSubmit: event => {
                    event.preventDefault();
                    if (!canAct || !callback.trim()) return;
                    const value = callback.trim();
                    setCallback('');
                    if (!validCallback(value)) { setState(previous => ({ ...previous, error: 'invalid' })); return; }
                    request({ action: 'respond', attemptId: attempt.id, promptId: prompt.id, value });
                  } }, h('label', { className: 'co-label', htmlFor: 'co-callback-input' }, t('callback')),
                    h('input', { id: 'co-callback-input', className: 'co-input', type: 'password', value: callback, onChange: event => setCallback(event.target.value), autoComplete: 'off', autoCapitalize: 'none', spellCheck: false, maxLength: 8192, placeholder: t('callbackHint'), disabled: state.posting || !data?.csrf }),
                    h('div', { className: 'co-actions' }, h('button', { type: 'submit', className: 'co-button', disabled: !canAct || !callback.trim() }, t('submit'))))) : null) : null),
            h('p', { className: 'co-note' }, t('hidden')));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'local-codex-oauth', order: 11, label: () => t('title') }, Page));
      },
    };
  },
});
