/** Type declarations for bcryptjs */
declare module 'bcryptjs' {
  export interface Bcrypt {
    hashSync(s: string, saltRounds: number): string
    compareSync(s: string, hash: string): boolean
    genSaltSync(rounds?: number): string
  }
  const bcrypt: Bcrypt
  export default bcrypt
}
