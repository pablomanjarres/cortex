// In Electron prod, the renderer is loaded from file:// — relative /api URLs
// don't resolve to the local web server, so fall back to localhost:3456.
// In browser/PWA over Tailscale, same-origin relative paths work directly.
export const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''
