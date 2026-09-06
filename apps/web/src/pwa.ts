/** Register the static-resource Service Worker for secure Web GUI origins. */
export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('web app: could not register the offline asset cache', error)
    })
  }, { once: true })
}
