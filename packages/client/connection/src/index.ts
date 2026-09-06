/** Host HTTP bridge for browser-client RPC. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-credentials'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
// Activates the webServer Context merge used below.
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PATH } from './api-path.ts'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.ts'
import { assertTrustedAuthority, isTrustedApiRequest } from './api-request-trust.ts'
import { BrowserAuth, requestAuthority } from './browser-auth.ts'
import { UserStore } from './user-store.ts'
import { HostConnectionService } from './rpc-host.ts'

export type {
  ConnectionFetchMethod,
  ConnectionFetchHandler,
  ConnectionFetchRoute,
  ConnectionIndexRequest,
  ConnectionIndexResponse,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcFailure,
  ConnectionRpcHandler,
  ConnectionRequestRejection,
  ConnectionRpcResult,
  ConnectionRequestBodyMode,
  ConnectionTrustRequest,
  ClientRequest,
  HostConnectionHandle,
  HostConnectionFetch,
  HostConnectionRpc,
  RpcMessage,
  ServerResponse,
} from './rpc.ts'
export { RpcId, transportError } from './rpc.ts'
export {
  clientRequestSchema,
  rpcErrorSchema,
  rpcIdSchema,
  rpcMessageSchema,
  rpcResultSchema,
  serverResponseSchema,
} from './rpc-schema.ts'
export { HostConnectionService } from './rpc-host.ts'

export { API_PATH } from './api-path.ts'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024
const DEFAULT_LOGIN_BODY_BYTES = 8 * 1024
const DEFAULT_BOOTSTRAP_USERNAME = 'admin'
const DEFAULT_BOOTSTRAP_PASSWORD = 'admin123'

class LoginRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function readLoginForm(
  req: AsyncIterable<Uint8Array> & { headers: Record<string, string | string[] | undefined> },
  maxBytes: number,
): Promise<URLSearchParams> {
  const rawContentType = req.headers['content-type']
  const contentType = typeof rawContentType === 'string'
    ? rawContentType.split(';', 1)[0]?.trim().toLowerCase()
    : undefined
  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new LoginRequestError(415, '请求格式必须是表单编码')
  }
  const declaredLength = Number(req.headers['content-length'] ?? Number.NaN)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new LoginRequestError(413, '登录请求过大')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maxBytes) throw new LoginRequestError(413, '登录请求过大')
    chunks.push(buffer)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function assertImageBodyCapacity(ctx: Context, maxRequestBodyBytes: number): void {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection. */
export const inject = ['webServer', 'credentials']

/** Plugin config: the deployment's non-loopback serving authorities. */
export interface ConnectionConfig {
  /**
   * Authorities this deployment serves beyond loopback: exact `host:port`, or
   * port-less `host` matching any port. The /api trust fence refuses any
   * request whose Host is neither loopback nor listed here, so a
   * non-loopback (`0.0.0.0`) deployment must declare the names it is reached
   * by; the Web runtime derives LAN IP literals from an active all-interface
   * bind. An entry that is not a bare, canonical authority fails plugin load.
   */
  trustedHosts?: string[]
  /** Absolute browser-session lifetime in days. Default: 30. */
  cookieMaxAgeDays?: number
  /** Maximum buffered JSON body for every `/api` request. Default: 300 MiB. */
  maxRequestBodyBytes?: number
  /** SQLite user database path. Default: `$DSH_HOME/users.db`. */
  userDatabasePath?: string
  /** Username created only when the user database has no accounts. Default: `admin`. */
  bootstrapUsername?: string
  /** Password created only when the user database has no accounts. Default: `admin123`. */
  bootstrapPassword?: string
  /** Maximum URL-encoded login request body. Default: 8 KiB. */
  maxLoginBodyBytes?: number
}

export const Config: z<ConnectionConfig> = z.object({
  trustedHosts: z.array(String).default([]),
  cookieMaxAgeDays: z.natural().min(1).default(30),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
  userDatabasePath: z.string().min(1).default(dshHomePath('users.db')),
  bootstrapUsername: z.string().min(1).default(DEFAULT_BOOTSTRAP_USERNAME),
  bootstrapPassword: z.string().min(1).default(DEFAULT_BOOTSTRAP_PASSWORD),
  maxLoginBodyBytes: z.natural().min(1).default(DEFAULT_LOGIN_BODY_BYTES),
})

/**
 * Mounts the API gateway under the browser transport prefix. Every request on
 * the prefix passes the Host/Origin browser-trust fence and persistent browser
 * authentication before dispatch.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export async function apply(ctx: Context, config?: ConnectionConfig): Promise<void> {
  // The Loader resolves schema defaults; hand-built test contexts may pass none.
  const trustedHosts = config?.trustedHosts ?? []
  const cookieMaxAgeDays = config?.cookieMaxAgeDays ?? 30
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  const userDatabasePath = config?.userDatabasePath ?? dshHomePath('users.db')
  const bootstrapUsername = config?.bootstrapUsername ?? DEFAULT_BOOTSTRAP_USERNAME
  const bootstrapPassword = config?.bootstrapPassword ?? DEFAULT_BOOTSTRAP_PASSWORD
  const maxLoginBodyBytes = config?.maxLoginBodyBytes ?? DEFAULT_LOGIN_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  const browserAuth = await BrowserAuth.create(ctx.root, ctx.credentials, cookieMaxAgeDays, true)
  const connection = new HostConnectionService(ctx, trustedHosts, browserAuth)
  const fetchHandler = connection.createSharedFetchHandler(API_PATH)
  const route: WebRoute = {
    kind: 'prefix',
    path: API_PATH,
    handler: async (req, res) => {
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined) {
        res.writeHead(rejection)
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      await bridge(req, res, fetchHandler, maxRequestBodyBytes)
    },
  }
  ctx.effect(() => ctx.webServer.register(route), 'client-connection: /api route')

  const userStore = new UserStore(userDatabasePath)
  if ((await userStore.listUsers()).length === 0) {
    await userStore.createUser(bootstrapUsername, bootstrapPassword)
  }
  ctx.effect(() => () => userStore.close(), 'client-connection: close user database')

  const loginRoute: WebRoute = {
    kind: 'exact',
    path: '/login',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      if (!isTrustedApiRequest(req, trustedHosts)) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '请求来源不受信任' }))
        return
      }
      let form: URLSearchParams
      try {
        form = await readLoginForm(req, maxLoginBodyBytes)
      } catch (error) {
        if (!(error instanceof LoginRequestError)) throw error
        res.writeHead(error.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
        return
      }
      const username = form.get('username') ?? ''
      const password = form.get('password') ?? ''

      if (!username || !password) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '用户名和密码不能为空' }))
        return
      }

      if (!(await userStore.verify(username, password))) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '用户名或密码错误' }))
        return
      }

      const authority = requestAuthority(req.headers)
      if (!authority) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '无法确定服务地址' }))
        return
      }

      const setCookie = browserAuth.createSessionCookie(authority)
      res.writeHead(303, {
        'location': '/',
        'cache-control': 'no-store',
        'set-cookie': setCookie,
      })
      res.end()
    },
  }
  ctx.effect(() => ctx.webServer.register(loginRoute), 'client-connection: /login route')

  ctx.inject(['attachments'], (attachmentCtx) => {
    assertImageBodyCapacity(attachmentCtx, maxRequestBodyBytes)
  })
}
