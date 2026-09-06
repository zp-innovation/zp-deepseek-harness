/** Minimal sql.js declarations used by the Host account store. */
declare module 'sql.js' {
  export type BindParams = Array<string | number | null>

  export interface Statement {
    bind(values?: BindParams): boolean
    step(): boolean
    get(): unknown[]
    free(): boolean
  }

  export interface SqlJsStatic {
    Database: typeof Database
  }
  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }
  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null)
    run(sql: string, params?: BindParams): Database
    exec(sql: string): QueryExecResult[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
  }
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
