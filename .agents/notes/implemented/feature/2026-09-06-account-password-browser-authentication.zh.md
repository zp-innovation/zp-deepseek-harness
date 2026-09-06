# Agent Note: 账号密码浏览器认证

Status: implemented

[English](2026-09-06-account-password-browser-authentication.md) | 中文

## 问题

进程启动 URL 只有在操作者能取得新终端输出时才能认证浏览器。从另一台机器访问 Web Host 的用户需要稳定的交互式凭据，且不应获得进程启动令牌。该凭据不能授权不受信任的 Host 或跨站请求，密码存储必须跨进程重启生效且不得保留明文。

## 决策

`dsh-client-connection` 为未认证的 index 请求呈现账号登录表单，并且仅在既有 Host、Origin 与 Fetch-Metadata 检查通过后接受 `POST /login`。该路由接受有大小上限的 `application/x-www-form-urlencoded` 请求体，验证用户名与密码，再签发与启动令牌交换相同的、绑定 authority 的浏览器 cookie。启动令牌路径继续用于本地引导与恢复。

Host 把账号存储在 `userDatabasePath` 指向的 sql.js SQLite 数据库中，默认路径为 `$DSH_HOME/users.db`。密码采用 bcrypt 哈希。SQL 语句以参数绑定账号值，每次成功变更都在返回前导出数据库，文件系统或 SQLite 失败会拒绝启动或请求，而不会报告成功。Cordis fiber 释放时关闭该存储。

空数据库会创建配置的 `bootstrapUsername` 与 `bootstrapPassword`；随附默认值为 `admin` 和 `admin123`。引导设置不会替换现有账号。可经网络访问的部署会在首次启动前修改引导密码。

[浏览器启动令牌决策](../architecture/2026-08-24-browser-token-authentication.zh.md)继续持有 cookie 签名、authority 绑定、全 API 强制认证、令牌轮换与撤销规则。本决策只增加凭据取得路径，不削弱这些规则。没有 active Agent Note 被归档，因为两项决策都保有独立的安全理由。

## 验证

用户存储套件会创建账号、拒绝重复账号、验证并修改密码、重新打开 SQLite 文件，再删除账号。Host 路由套件通过 Connection 插件启动隔离数据库，并验证默认 URL 编码登录返回 HttpOnly cookie。浏览器认证覆盖继续固定签名 cookie 校验与启动令牌交换。

## 曾考虑的替代方案

**继续仅提供启动令牌认证。** 这要求每个新的远程浏览器都能访问终端输出，无法满足稳定账号登录要求。

**把密码哈希存入凭据 YAML 提供方。** 凭据记录用于保存插件拥有的秘密，但不提供账号唯一性、排序或未来账号管理查询。专用 SQLite 文件使账号数据模型与 cookie 签名材料分离。

**把经过转义的用户名插入 SQL。** 账号操作扩展时容易破坏正确转义。参数绑定使值不会进入 SQL 语法。

**忽略数据库导出失败并继续使用内存状态。** 成功响应会声称下个进程无法观察到的持久性。持久化失败会继续呈现给调用方。

## 后果

用户无需启动 URL 即可认证，两条入口路径汇合到同一套浏览器 cookie authority 模型。SQLite 文件与签名密钥仍是 Harness home 下相互分离的持久资产。

默认引导密码不适合可经网络访问的部署。配置必须在首次启动前修改，因为引导值不会变更现有账号。sql.js 在每次账号变更后导出完整数据库，因此该实现适合小型账号集合，不适合高写入吞吐或多进程写入。
