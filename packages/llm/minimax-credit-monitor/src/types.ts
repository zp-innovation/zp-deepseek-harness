/**
 * Shared types for the MiniMax credit monitor plugin.
 * @module @deepseek-ai/dsh-minimax-credit-monitor
 */

/** MiniMax account balance information. */
export interface MiniMaxBalance {
  /** Display name of the balance type (e.g., "赠送余额", "充值余额"). */
  readonly label: string
  /** Remaining balance amount. */
  readonly amount: number
  /** Currency unit (e.g., ""CNY"", ""USD""). */
  readonly currency: string
}

/** MiniMax subscription plan information. */
export interface MiniMaxPlan {
  /** Plan identifier. */
  readonly planId: string
  /** Human-readable plan name. */
  readonly name: string
  /** Whether the plan is currently active. */
  readonly active: boolean
  /** Total included credits/token quota. */
  readonly quota: number
  /** Used quota so far. */
  readonly used: number
  /** Remaining quota. */
  readonly remaining: number
  /** Plan expiration timestamp (ms since epoch), or null if no expiry. */
  readonly expiresAt: number | null
  /** Billing cycle (e.g., ""monthly"", ""yearly"", ""one-time""). */
  readonly billingCycle: string
}

/** MiniMax account-level information. */
export interface MiniMaxAccount {
  /** MiniMax user account ID. */
  readonly accountId: string
  /** Account email or username. */
  readonly username: string
  /** Current subscription plan. */
  readonly currentPlan: MiniMaxPlan | null
  /** All available balance types. */
  readonly balances: readonly MiniMaxBalance[]
  /** Total remaining credits (computed from all balances). */
  readonly totalCredits: number
}

/** API error codes returned by the MiniMax credit monitor. */
export type MiniMaxCreditMonitorErrorCode =
  | 'missing_api_key'
  | 'api_request_failed'
  | 'invalid_response'
  | 'network_error'
  | 'unauthorized'
  | 'rate_limit_exceeded'

/** Structured error returned by MiniMax credit monitor tools. */
export interface MiniMaxCreditMonitorError {
  readonly code: MiniMaxCreditMonitorErrorCode
  readonly message: string
}

/** Union of successful and error results for balance queries. */
export type MiniMaxBalanceResult =
  | { ok: true; data: MiniMaxAccount }
  | { ok: false; error: MiniMaxCreditMonitorError }

/** Union of successful and error results for plan queries. */
export type MiniMaxPlanResult =
  | { ok: true; plans: readonly MiniMaxPlan[] }
  | { ok: false; error: MiniMaxCreditMonitorError }

/** Raw wire format for MiniMax account response (v1/account). */
export interface MiniMaxAccountWire {
  readonly account_id?: string
  readonly username?: string
  readonly email?: string
  readonly balance?: Array<{
    readonly label?: string
    readonly amount?: number | string
    readonly currency?: string
  }>
  readonly plan?: {
    readonly plan_id?: string
    readonly name?: string
    readonly status?: string
    readonly quota?: number | string
    readonly used?: number | string
    readonly expire_time?: number | string
    readonly billing_cycle?: string
  }
}

/** Raw wire format for MiniMax plans list response (v1/plans). */
export interface MiniMaxPlansWire {
  readonly plans?: Array<{
    readonly plan_id?: string
    readonly name?: string
    readonly status?: string
    readonly quota?: number | string
    readonly used?: number | string
    readonly expire_time?: number | string
    readonly billing_cycle?: string
  }>
}
