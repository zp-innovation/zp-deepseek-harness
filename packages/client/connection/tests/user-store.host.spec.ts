/** SQLite account persistence and password verification. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserStore } from '../src/user-store.ts'

const roots: string[] = []

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-users-'))
  roots.push(root)
  return join(root, 'users.db')
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('UserStore', () => {
  it('creates, verifies, updates, and persists an account', async () => {
    const path = databasePath()
    const first = new UserStore(path)
    expect(await first.createUser('admin', 'first-password')).toBe(true)
    expect(await first.createUser('admin', 'other-password')).toBe(false)
    expect(await first.verify('admin', 'first-password')).toBe(true)
    expect(await first.verify('admin', 'wrong-password')).toBe(false)
    expect(await first.setPassword('missing', 'password')).toBe(false)
    expect(await first.setPassword('admin', 'second-password')).toBe(true)
    await first.close()

    const reopened = new UserStore(path)
    expect(await reopened.verify('admin', 'first-password')).toBe(false)
    expect(await reopened.verify('admin', 'second-password')).toBe(true)
    expect(await reopened.listUsers()).toEqual([
      { username: 'admin', createdAt: expect.any(Number) as number },
    ])
    expect(await reopened.deleteUser('missing')).toBe(false)
    expect(await reopened.deleteUser('admin')).toBe(true)
    expect(await reopened.hasUser('admin')).toBe(false)
    await reopened.close()
  })
})
