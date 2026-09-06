# Agent Note: Web 静态 PWA 缓存

Status: implemented

[English](2026-09-06-web-static-pwa-cache.md) | 中文

## 问题

Web 应用已提供 manifest 与图标，但未注册 Service Worker，因此浏览器无法保留静态资源以支持快速重复加载或离线回退。早期的单一用途 SW 把所有缓存决策都写死在 `sw.js` 里，没有给后续安装的插件留出接入点。

## 决策

`apps/web` 在页面 load 之后，且浏览器支持 Service Worker 且页面处于 HTTPS、loopback 或 RFC 1918 私有 LAN 时注册 `/sw.js`。Worker 预缓存 manifest 与 favicon，在激活阶段清理旧版本 `dsh-web-static-*` 与 `dsh-web-routes-*` 缓存，并 claim 已开页面。Worker 把插件注册的路由表持久化到独立的 `dsh-web-routes-*` 缓存，每次激活都从那里 rehydrate，因此页面里的路由表才是启动期的真实来源，能跨 SW 重启保留。

SW 暴露一套小型 message 协议，让在 Worker 首次激活之后才安装的插件也能注册 fetch 策略，不需要发布新的 worker：

- `register-route`：安装或替换一条 `{ id, pattern, strategy, cacheName, maxEntries? }` 记录。`id` 由插件拥有并保持稳定；用同一 id 再次注册会覆盖前一条；`unregister-route` 用于删除。
- `unregister-route`：移除已注册的条目。
- `list-routes`：调试用的查询接口。
- `clear-cache`：从设置 UI 删除 worker 的某个缓存。

页面侧 API 位于 `@deepseek-ai/dsh-client-web/pwa`：`registerServiceWorkerRoute(config)` 返回一个 disposer，`unregisterServiceWorkerRoute(id)` 移除一条，`listServiceWorkerRoutes()` 返回内存中的路由表，`clearServiceWorkerCache(name)` 触发 worker 删除缓存。Web 入口在启动期调用 `registerPwa()` 一次；SW 的 `controllerchange` 事件会触发后续每次导航重新发送内存中的路由表，因此即便有插件在激活之后才注册，也会在下一次页面加载时生效。

支持 5 种策略，全部单响应以保持 worker 体积小：`cache-first`、`network-first`、`stale-while-revalidate`、`network-only`、`cache-only`。pattern 是 glob 风格，已经剥掉 origin；`*` 匹配一个 URL 段。敏感路径（根页面、`/login`、`/api/`）永远不进 worker：SW 直接放行，保证鉴权、动态 HTML 与 Host API 响应始终走网络。刷新失败时若已有缓存静态响应则继续可用。

视口宽度 < 680px 时，Web 布局不预留 sidebar 轨道。导航和详情以可关闭的 overlay drawer 渲染，对话在用户打开面板前占满整个视口宽度。

移动端对话列用可用视口宽度覆盖桌面端的 680px 最小阅读宽度，并去掉对话宽度拖把手柄。历史记录保留在可见列内，不再被裁出可见范围。

视口声明 `interactive-widget=resizes-content`，让支持的移动浏览器在虚拟键盘弹起时调整内容区。移动 composer 使用至少 16px 编辑字号，防止部分浏览器在小字号可编辑内容上触发焦点驱动的页面缩放。

## 验证

构建后的 Web 应用测试校验 `sw.js` 包含预缓存条目、默认静态路由排除项、插件扩展 message API、五种策略以及键盘视口策略。插件扩展 API 测试覆盖 route 原语以及 `isSecurePwaContext` 对 RFC 1918 LAN 主机名的接受。布局测试校验零宽移动导航轨道、drawer 打开与关闭、零宽详情轨道。TypeScript 程序与生产 Vite 构建均成功完成。

## 备选方案

**缓存根文档和登录页。** 它们携带鉴权状态与动态 HTML，缓存响应可能呈现陈旧的访问状态。

**缓存 API 响应。** Host API 结果包含当前会话与账户数据，Service Worker 对它们没有领域相关的 freshness 与授权模型。

**在所有 HTTP origin 注册。** Service Worker 在正常部署下要求 secure context；允许 loopback 与 RFC 1918 origin 能覆盖开发场景，又不会把 worker 暴露给公网。

**每个插件单独发布一份 SW。** 那需要协调 scope、激活、缓存命名空间；message 协议用单个 SW 文件把复杂度集中到一处。

## 后果

静态资源从最新可用缓存加载，同时后台请求刷新。LAN 在 HTTP 下不启用 Service Worker 缓存，直到部署切到 HTTPS、loopback 或 RFC 1918。插件可以为自己的路由接入离线行为而无需协调 worker 文件；worker 持久化的路由表意味着注册新路由的插件更新会在下一次导航生效，不必等 worker 自身更新。