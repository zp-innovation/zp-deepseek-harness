/** Durable SQLite user accounts for browser authentication. */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

const SALT_ROUNDS = 10

function hasRow(db: SqlJsDatabase, username: string): boolean {
  const statement = db.prepare('SELECT 1 FROM users WHERE username = ? LIMIT 1')
  try {
    statement.bind([username])
    return statement.step()
  } finally {
    statement.free()
  }
}

/** One account row returned without its password hash. */
export interface User {
  username: string
  createdAt: number
}

/** One sql.js database persisted as a SQLite file after each mutation. */
export class UserStore {
  private readonly database: Promise<SqlJsDatabase>

  /**
   * Open or create one user database.
   * @param path - SQLite file owned by this store.
   */
  constructor(private readonly path: string) {
    this.database = this.open()
  }

  private async open(): Promise<SqlJsDatabase> {
    const SQL = await initSqlJs()
    const db = existsSync(this.path)
      ? new SQL.Database(readFileSync(this.path))
      : new SQL.Database()
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        passwordHash TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `)
    if (!existsSync(this.path)) this.save(db)
    return db
  }

  private save(db: SqlJsDatabase): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, Buffer.from(db.export()))
  }

  /** Create an account unless its username already exists. */
  async createUser(username: string, password: string): Promise<boolean> {
    const db = await this.database
    if (hasRow(db, username)) return false
    db.run(
      'INSERT INTO users (username, passwordHash, createdAt) VALUES (?, ?, ?)',
      [username, bcrypt.hashSync(password, SALT_ROUNDS), Date.now()],
    )
    this.save(db)
    return true
  }

  /** Verify one username and password without exposing the stored hash. */
  async verify(username: string, password: string): Promise<boolean> {
    const db = await this.database
    const statement = db.prepare('SELECT passwordHash FROM users WHERE username = ? LIMIT 1')
    try {
      statement.bind([username])
      if (!statement.step()) return false
      const row = statement.get()
      return typeof row[0] === 'string' && bcrypt.compareSync(password, row[0])
    } finally {
      statement.free()
    }
  }

  /** Report whether one username is present. */
  async hasUser(username: string): Promise<boolean> {
    return hasRow(await this.database, username)
  }

  /** List accounts in creation order without password hashes. */
  async listUsers(): Promise<User[]> {
    const db = await this.database
    const statement = db.prepare('SELECT username, createdAt FROM users ORDER BY createdAt ASC')
    const users: User[] = []
    try {
      while (statement.step()) {
        const row = statement.get()
        users.push({ username: String(row[0]), createdAt: Number(row[1]) })
      }
      return users
    } finally {
      statement.free()
    }
  }

  /** Delete one account when present. */
  async deleteUser(username: string): Promise<boolean> {
    const db = await this.database
    if (!hasRow(db, username)) return false
    db.run('DELETE FROM users WHERE username = ?', [username])
    this.save(db)
    return true
  }

  /** Replace one existing account's password. */
  async setPassword(username: string, password: string): Promise<boolean> {
    const db = await this.database
    if (!hasRow(db, username)) return false
    db.run('UPDATE users SET passwordHash = ? WHERE username = ?', [
      bcrypt.hashSync(password, SALT_ROUNDS),
      username,
    ])
    this.save(db)
    return true
  }

  /** Release this store's in-memory SQLite database. */
  async close(): Promise<void> {
    const db = await this.database
    db.close()
  }
}
