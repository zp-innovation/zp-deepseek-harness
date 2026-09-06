/**
 * Model-facing MiniMax plan and credit monitoring tools.
 * @module @deepseek-ai/dsh-minimax-credit-monitor
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import {
  MiniMaxClient,
  MINIMAX_API_KEY_ENV,
  DEFAULT_TIMEOUT_MS,
} from './client.ts'
import type {
  MiniMaxAccount,
  MiniMaxBalanceResult,
  MiniMaxCreditMonitorError,
  MiniMaxPlan,
  MiniMaxPlanResult,
} from './types.ts'

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

function formatBalance(data: MiniMaxAccount): string {
  const lines: string[] = [
    ## MiniMax Account: ,
    '',
    | Balance Type | Amount | Currency |,
    |---|---|---|,
  ]
  for (const b of data.balances) {
    lines.push(|  |  |  |)
  }
  lines.push('')
  lines.push(**Total credits: **)
  if (data.currentPlan) {
    const p = data.currentPlan
    lines.push('')
    lines.push(### Current Plan: )
    lines.push(- Status: )
    lines.push(- Quota:  | Used:  | Remaining: )
    if (p.expiresAt !== null) {
      const expiry = new Date(p.expiresAt).toISOString()
      lines.push(- Expires: )
    }
    lines.push(- Billing cycle: )
  }
  return lines.join('\n')
}

function formatPlans(plans: readonly MiniMaxPlan[]): string {
  if (plans.length === 0) return 'No subscription plans found.'
  const lines: string[] = [
    '## MiniMax Subscription Plans',
    '',
    | Plan | Status | Quota | Used | Remaining | Billing |,
    |---|---|---|---|---|---|,
  ]
  for (const p of plans) {
    lines.push(
      |  |  |  |  |  |  |,
    )
  }
  return lines.join('\n')
}

function formatError(error: MiniMaxCreditMonitorError): string {
  const emoji: Record<string, string> = {
    missing_api_key: '🔑',
    unauthorized: '🔐',
    rate_limit_exceeded: '⏱️',
    api_request_failed: '🌐',
    invalid_response: '📦',
    network_error: '❌',
  }
  return ${emoji[error.code] ?? '⚠️'} **[]**
}

function renderBalanceResult(result: MiniMaxBalanceResult, maxChars = 4000): string {
  if (!result.ok) return formatError(result.error)
  return formatBalance(result.data).slice(0, maxChars)
}

function renderPlanResult(result: MiniMaxPlanResult, maxChars = 4000): string {
  if (!result.ok) return formatError(result.error)
  return formatPlans(result.plans).slice(0, maxChars)
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const BALANCE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: true },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountId: { type: 'string' },
        username: { type: 'string' },
        currentPlan: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                planId: { type: 'string' },
                name: { type: 'string' },
                active: { type: 'boolean' },
                quota: { type: 'number' },
                used: { type: 'number' },
                remaining: { type: 'number' },
                expiresAt: { oneOf: [{ type: 'null' }, { type: 'number' }] },
                billingCycle: { type: 'string' },
              },
            },
          ],
        },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
            },
          },
        },
        totalCredits: { type: 'number' },
      },
    },
  },
} as const

const BALANCE_ERROR_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: false },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          enum: ['missing_api_key', 'unauthorized', 'rate_limit_exceeded', 'api_request_failed', 'invalid_response', 'network_error'],
        },
        message: { type: 'string' },
      },
    },
  },
} as const

const BALANCE_SCHEMA = { oneOf: [BALANCE_OUTPUT_SCHEMA, BALANCE_ERROR_OUTPUT] } as const

const PLANS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: true },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          planId: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'boolean' },
          quota: { type: 'number' },
          used: { type: 'number' },
          remaining: { type: 'number' },
          expiresAt: { oneOf: [{ type: 'null' }, { type: 'number' }] },
          billingCycle: { type: 'string' },
        },
      },
    },
  },
} as const

const PLANS_ERROR_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: false },
    error: {
      type: 'object',
      additionalProperties: false,
      properties: {
        code: {
          type: 'string',
          enum: ['missing_api_key', 'unauthorized', 'rate_limit_exceeded', 'api_request_failed', 'invalid_response', 'network_error'],
        },
        message: { type: 'string' },
      },
    },
  },
} as const

const PLANS_SCHEMA = { oneOf: [PLANS_OUTPUT_SCHEMA, PLANS_ERROR_OUTPUT] } as const

const BALANCE_DESCRIPTION =
  'Query the current MiniMax account balance, including all balance types (gift balance, recharge balance, etc.) ' +
  'and the active subscription plan details. Returns the account ID, username, per-type balances, total credits, ' +
  'and the current plan with quota usage and expiration.'

const PLANS_DESCRIPTION =
  'List all available MiniMax subscription plans for the current account, including each plan\'s ' +
  'name, status (active/inactive), quota, used amount, remaining quota, billing cycle, and expiration time.'

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function presentCall<T extends { ok: boolean }>(label: string, kind: 'read' | 'other', detail?: string): GenericCallView {
  return {
    title: label,
    kind,
    detail,
  }
}

export function registerMiniMaxCreditTools(
  ctx: Context,
  apiKey: string,
  groupId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): () => void {
  const client = new MiniMaxClient(ctx, apiKey, groupId, timeoutMs)
  const disposers: Array<() => void> = []

  try {
    disposers.push(ctx.tools.register(defineTool({
      name: 'minimax_balance',
      description: BALANCE_DESCRIPTION,
      parameters: {},
      output: { schema: BALANCE_SCHEMA, render: renderBalanceResult },
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        const result: MiniMaxBalanceResult = await client.getAccount(exec.signal)
        return result
      },
      presentCall: () => presentCall('Query MiniMax balance', 'read'),
    })))

    disposers.push(ctx.tools.register(defineTool({
      name: 'minimax_plans',
      description: PLANS_DESCRIPTION,
      parameters: {},
      output: { schema: PLANS_SCHEMA, render: renderPlanResult },
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        const result: MiniMaxPlanResult = await client.getPlans(exec.signal)
        return result
      },
      presentCall: () => presentCall('List MiniMax plans', 'read'),
    })))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }

  let active = true
  return () => {
    if (!active) return
    active = false
    for (const dispose of disposers.reverse()) dispose()
  }
}
