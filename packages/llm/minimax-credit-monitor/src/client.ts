/**
 * MiniMax API client for querying account balance and subscription plans.
 * @module @deepseek-ai/dsh-minimax-credit-monitor
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  MiniMaxAccount,
  MiniMaxAccountWire,
  MiniMaxBalance,
  MiniMaxBalanceResult,
  MiniMaxCreditMonitorError,
  MiniMaxPlan,
  MiniMaxPlanResult,
  MiniMaxPlansWire,
} from './types.ts'

/** MiniMax API base URL. */
export const MINIMAX_API_BASE = 'https://api.minimax.chat'

/** MiniMax API version prefix. */
export const MINIMAX_API_VERSION = '/v1'

/** Default request timeout (ms). */
export const DEFAULT_TIMEOUT_MS = 15_000

/** Environment variable name for the MiniMax API key. */
export const MINIMAX_API_KEY_ENV = 'MINIMAX_API_KEY'

function newError(code: MiniMaxCreditMonitorError['code'], message: string): MiniMaxCreditMonitorError {
  return { code, message }
}

function toNumber(value: number | string | undefined): number {
  if (value === undefined) return 0
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseBalance(raw: NonNullable<MiniMaxAccountWire['balance']>[number]): MiniMaxBalance {
  return {
    label: String(raw.label ?? 'Unknown'),
    amount: toNumber(raw.amount),
    currency: String(raw.currency ?? 'CNY'),
  }
}

function parsePlan(raw: {
  readonly plan_id?: string
  readonly name?: string
  readonly status?: string
  readonly quota?: number | string
  readonly used?: number | string
  readonly expire_time?: number | string
  readonly billing_cycle?: string
}): MiniMaxPlan {
  const quota = toNumber(raw.quota)
  const used = toNumber(raw.used)
  return {
    planId: String(raw.plan_id ?? ''),
    name: String(raw.name ?? 'Unknown Plan'),
    active: String(raw.status ?? '').toLowerCase() === 'active',
    quota,
    used,
    remaining: Math.max(0, quota - used),
    expiresAt: raw.expire_time !== undefined ? toNumber(raw.expire_time) * 1000 : null,
    billingCycle: String(raw.billing_cycle ?? 'unknown'),
  }
}

function parseAccount(wire: MiniMaxAccountWire): MiniMaxAccount {
  const balances: MiniMaxBalance[] = (wire.balance ?? []).map(parseBalance)
  const totalCredits = balances.reduce((sum, b) => sum + b.amount, 0)
  const plan = wire.plan ? parsePlan(wire.plan) : null
  return {
    accountId: String(wire.account_id ?? ''),
    username: String(wire.email ?? wire.username ?? ''),
    currentPlan: plan,
    balances,
    totalCredits,
  }
}

/**
 * The MiniMax API client. Reads the API key from MINIMAX_API_KEY env or
 * a configured value, and queries the MiniMax account/plans endpoints over
 * ctx.web.
 */
export class MiniMaxClient {
  constructor(
    private readonly ctx: Context,
    private readonly apiKey: string,
    private readonly groupId: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private async request<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = ${MINIMAX_API_BASE}
    const headers: Record<string, string> = {
      'Authorization': Bearer ,
      'Content-Type': 'application/json',
    }
    if (this.groupId) {
      headers['GroupId'] = this.groupId
    }

    const response = await this.ctx.web.fetch(
      { url },
      signal,
    )

    if (response.statusCode === 401 || response.statusCode === 403) {
      throw { code: 'unauthorized' as const, message: MiniMax API unauthorized (HTTP ) }
    }
    if (response.statusCode === 429) {
      throw { code: 'rate_limit_exceeded' as const, message: 'MiniMax API rate limit exceeded' }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw { code: 'api_request_failed' as const, message: MiniMax API request failed (HTTP ) }
    }

    const body = response.body
    if (body.kind !== 'text') {
      throw { code: 'invalid_response' as const, message: MiniMax API returned non-text response (kind: ) }
    }

    try {
      return JSON.parse(body.content) as T
    } catch {
      throw { code: 'invalid_response' as const, message: 'MiniMax API returned malformed JSON' }
    }
  }

  /**
   * Fetch the current MiniMax account information including balances.
   * @param signal - optional cancellation signal.
   * @returns the parsed account data or a structured error.
   */
  async getAccount(signal?: AbortSignal): Promise<MiniMaxBalanceResult> {
    try {
      const wire = await this.request<MiniMaxAccountWire>('/account', signal)
      if (!wire || typeof wire !== 'object') {
        return { ok: false, error: newError('invalid_response', 'MiniMax account response is not an object') }
      }
      return { ok: true, data: parseAccount(wire) }
    } catch (raw: unknown) {
      const err = raw as { code?: string; message?: string }
      if (err.code === 'unauthorized' || err.code === 'api_request_failed' || err.code === 'invalid_response' || err.code === 'rate_limit_exceeded') {
        return { ok: false, error: newError(err.code, err.message ?? 'Unknown error') }
      }
      return { ok: false, error: newError('network_error', String(raw)) }
    }
  }

  /**
   * Fetch the available MiniMax subscription plans.
   * @param signal - optional cancellation signal.
   * @returns the parsed plans list or a structured error.
   */
  async getPlans(signal?: AbortSignal): Promise<MiniMaxPlanResult> {
    try {
      const wire = await this.request<MiniMaxPlansWire>('/plans', signal)
      if (!wire || typeof wire !== 'object') {
        return { ok: false, error: newError('invalid_response', 'MiniMax plans response is not an object') }
      }
      const plans: MiniMaxPlan[] = (wire.plans ?? []).map(raw => parsePlan(raw as Parameters<typeof parsePlan>[0]))
      return { ok: true, plans }
    } catch (raw: unknown) {
      const err = raw as { code?: string; message?: string }
      if (err.code === 'unauthorized' || err.code === 'api_request_failed' || err.code === 'invalid_response' || err.code === 'rate_limit_exceeded') {
        return { ok: false, error: newError(err.code, err.message ?? 'Unknown error') }
      }
      return { ok: false, error: newError('network_error', String(raw)) }
    }
  }
}
