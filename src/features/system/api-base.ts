// Packaged Electron pages use file://; web clients use the same-origin API.
export const API_BASE = (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ? 'http://127.0.0.1:3456'
  : ''
