/** Browser entry for the Web client. */
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import { registerPwa } from './pwa.ts'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
registerPwa()
void new AppWebEntry(el).run()
