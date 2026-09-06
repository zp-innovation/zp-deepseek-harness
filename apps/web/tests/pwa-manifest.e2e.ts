import { glob, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')
  expect(index).toContain('interactive-widget=resizes-content')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'DeepSeek Harness',
    short_name: 'DSH',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships a favicon that switches to a light mark under dark color scheme', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The light fill must live inside the dark-scheme media query, so the icon
  // stays black in light mode and only turns white under a dark scheme.
  expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*path\s*{[^}]*fill:\s*#fff/i)
  expect(favicon).toContain('fill="#000"')
})

it('registers a Service Worker that caches static resources without caching login or API requests', async () => {
  const files: string[] = []
  for await (const file of glob(join(DIST_ROOT, 'assets', 'index-*.js'))) files.push(file)
  const entryFile = files[0]
  if (entryFile === undefined) throw new Error('missing built Web entry asset')

  const entry = await readFile(entryFile, 'utf8')
  const worker = await readFile(join(DIST_ROOT, 'sw.js'), 'utf8')

  expect(entry).toContain('serviceWorker.register("/sw.js",{scope:"/"})')
  expect(worker).toContain("const CACHE_NAME = 'dsh-web-static-v1'")
  expect(worker).toContain("const PRECACHE = ['/manifest.webmanifest', '/favicon.svg']")
  expect(worker).toContain("url.pathname === '/login'")
  expect(worker).toContain("url.pathname.startsWith('/api/')")
  expect(worker).toContain('return cached ?? refresh')
})
