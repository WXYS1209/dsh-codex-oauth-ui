# Codex 订阅授权 / Native Codex OAuth UI

为 DeepSeek Harness 内置 `openai-codex` 补充用户授权页面。当前版本为 0.1.2，声明兼容 DSH `>=0.2.2-rc.2 <0.3.0`。

## 安装

从 npm 安装：

```sh
dsh plugin --profile desktop add dsh-codex-oauth-ui@0.1.2
```

也可以从本地 checkout 安装；安装或替换后重启 DSH Desktop，以加载新的 Host/Client 模块：

```sh
dsh plugin --profile desktop add /path/to/dsh-codex-oauth-ui
```

## 入口与操作

设置 → Codex 授权。先在模型设置中添加内置 `openai-codex`，不要填入 OpenAI API Key 或 Admin Key。

1. 用户点击浏览器登录或设备码登录。插件不会在启动、加载页面或模型工具调用时自动登录。
2. 点击页面中的官方登录链接，亲自在 OpenAI 页面登录具有 Codex 权限的 ChatGPT 账户。
3. 浏览器模式使用原生回调端口 localhost:1455。若端口被占用，可改用设备码，或在授权页内的高级回调表单粘贴完整回调 URL。不要将 URL、验证码或令牌发送到聊天。
4. 授权成功由 Harness 原生服务保存到其 credentials 记录 `llm-pi-ai/openai-codex`，后续续期由内置适配器负责。
5. 返回模型选择器，手动选用 Codex 模型。保存授权不等于当前账户拥有全部模型；实际调用需要用户另行验证并消耗对应额度。

## 边界

- 不注册/替换模型供应商或 OAuth flow，只调用当前 `authorization.begin` 已注册的 oauth 方法。
- 不改变默认模型、模型列表、供应商配置或其他插件；不读取 `.codex` 登录缓存、浏览器 Cookie、平台 API Key 或 Admin Key。
- 不读取原始 credentials 记录或令牌。状态仅通过 `credentials.describeRecord` 获取存在性和类型。
- 浏览器与设备码方法由用户按钮选择，Host 仅自动回答对应的原生方法选择问题。未知/secret 提示失败关闭。
- 手工回调必须是完整 `http://localhost:1455/auth/callback` URL，带匹配 state 和单一 code；不接受只有授权码的输入。PKCE 和最终回调验证由原生 OAuth 流程执行。
- 授权链接只允许精确 OpenAI HTTPS 主机和已知路径，浏览器端再次验证。不渲染或记录原生错误体和任意通知消息。
- 用户操作走 Harness 认证 Fetch 路由，并额外要求 JSON 和本次运行的 CSRF nonce。授权 URL、验证码、待答问题只交给认证页面，不出现在模型工具中。
- `codex_login_status` 是只读诊断工具，不接受 action，不启动/回答/取消 OAuth，也不返回链接、验证码、账号标识、令牌或 CSRF nonce。
- 用户取消、10 分钟超时及插件卸载会中止本插件发起的尝试。取消或重授权失败不会删除此前已保存的授权。没有退出登录/删除凭据功能。
- 若原生路由有 `apiKeyEnv` 覆盖或自定义端点，页面给出阻塞提示而不擅自修改；请明确选择原生订阅认证后再登录。
- 这是原生 legacy Codex OAuth UI，不是 OpenAI 官方客户端；模型权限、网络与平台兼容性仍由实际服务决定。

## 0.1.2 兼容性更新

- DSH 0.2.2-rc.2 是当前目标版本；之前的精确限制 `0.2.2-rc.1` 导致 DSH 把插件判为不兼容。
- 将兼容范围收敛为 `>=0.2.2-rc.2 <0.3.0`。本次没有改动授权流程、凭据访问或 Host/Client API。
- DSH 0.2.2-rc.1 的升级指南中，唯一可能涉及插件包管理的是 `BundleInfo.updatable` 更名；本插件不调用该接口，因此无需代码迁移。
- 2026/11/13 本地验证：`npm run check` 通过，`npm test` 的 28 项测试全部通过；`npm pack --dry-run --json` 确认发行清单包含运行模块、patch、双语元数据、图标、README 和许可证。
- 自动化测试使用服务 mock，不执行真实 OAuth。未重新验证 GUI 实际布局、图标渲染或真实账户登录。

## 上一版本验证记录（0.1.1，2026/11/10）

- 0.1.1 曾安装至当时的 Desktop profile，`application: applied`，无 warnings；状态页、认证 CSRF POST 回执和 `local-codex-oauth` live Slot 曾确认正常。
- 修复了当时 DSH 0.2.2-rc.1 上的状态路由 GET 桥接错误；原生 OAuth、凭据或 RPC 未改变。
- 当时 27 项纯 mock 生命周期、CSRF、回调校验、GET 桥接和权限边界测试通过；未执行真实账户登录或模型调用。

## 开发与验证

无运行时依赖或安装脚本。0.1.2 仅声明兼容 `>=0.2.2-rc.2 <0.3.0`，不通过版本豁免绕过兼容检查。

```sh
npm run check
npm test
npm pack --dry-run
```

自动化测试仅使用服务 mock，不执行真实 OAuth。真实授权必须由用户在已安装界面中点击并完成。使用原创图标和中英文显示元数据。

## 发布

npm 是安装来源；包带有 DSH 兼容范围、GitHub 仓库地址和公开发布配置。发布前必须通过 `prepublishOnly` 的语法检查与完整测试：

```sh
npm publish --access public
```

要将包加入 DSH Discover，需要另行维护或加入 DSH Plugin Market 索引；单独发布到 npm 不会自动上架到索引。
