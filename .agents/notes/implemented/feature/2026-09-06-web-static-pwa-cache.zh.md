# Agent Note: Web 静态 PWA 缓存

Status: implemented

[English](2026-09-06-web-static-pwa-cache.md) | 中文

## 问题

Web 应用已提供 manifest 与图标，但未注册 Service Worker，因此浏览器无法保留静态资源以支持快速重复加载或离线回退。

## 决策

`apps/web` 仅在浏览器支持 Service Worker 且页面使用 HTTPS 或 `localhost` 时，于页面加载后注册 `/sw.js`。worker 预缓存 manifest 与 favicon，在激活时清理旧的 `dsh-web-static-*` 缓存，并接管已打开页面。

同源 GET 请求采用 stale-while-revalidate 缓存。worker 不会拦截根页面、`/login` 或 `/api/` 请求，因此认证、动态 HTML 与 Host API 响应始终走网络路径。刷新失败时，若已有缓存的静态响应，仍可使用该响应。

视口宽度小于 680px 时，Web 布局不保留侧栏轨道。导航与详情以可关闭的覆盖式抽屉呈现，用户打开面板前，对话区域占满整个视口宽度。

移动端对话列以可用视口宽度替代桌面端最小 680px 阅读宽度，并移除消息宽度拖拽控件。持久化的历史记录保留在可见列中，不会被裁剪到视口之外。

viewport 请求 `interactive-widget=resizes-content`，使支持该特性的移动浏览器在虚拟键盘打开时压缩内容区域。移动端编辑区字体至少为 16px，避免会对较小可编辑文字执行该行为的浏览器在聚焦时放大页面。

## 验证

已构建的 Web 应用测试验证 `sw.js` 包含预缓存条目、动态路由排除规则、stale-while-revalidate 回退与键盘 viewport 策略。布局测试验证移动端零宽度导航轨道、抽屉打开与关闭，以及零宽度详情轨道。TypeScript 程序与生产 Vite 构建均成功完成。

## 曾考虑的替代方案

**缓存根文档和登录页面。** 它们的认证状态与 HTML 是动态的，缓存响应可能呈现过期访问状态。

**缓存 API 响应。** Host API 结果可能包含当前会话与账号数据，Service Worker 不具备领域特定的刷新或授权模型。

**在所有 HTTP 源注册。** 正常部署中的 Service Worker 需要安全上下文；允许本地开发源是浏览器提供的例外。

## 后果

静态资源可以从最新可用缓存加载，同时后台请求会刷新它们。局域网明文 HTTP 访问会在部署使用 HTTPS 前继续不启用 Service Worker 缓存。
