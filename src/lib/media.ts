// Generic binary-file store (images, PDFs, any attachment).
//
// Reuses the same three backends as the data store:
//   1. Electron IPC (window.electronAPI.media) — files under data/media/
//   2. HTTP API (/api/media) — browser / iPhone via the web server
//   3. localStorage — dev-mode fallback
//
// The existing media backend was written for images only: on save it strips a
// `data:image/...;base64,` prefix, and on load it always labels the bytes as an
// image mime. To support *any* file type (PDFs especially) without touching the
// backend, we normalize on the client:
//   • save  — hand it the RAW base64 (no data-URL prefix). The image-prefix
//             strip then becomes a harmless no-op and the bytes round-trip intact.
//   • load  — take whatever bytes come back, discard the (possibly wrong) mime
//             label, and re-wrap with the real mime we know from the file record.

function toRawBase64(dataUrlOrRaw: string): string {
  const i = dataUrlOrRaw.indexOf('base64,')
  return i >= 0 ? dataUrlOrRaw.slice(i + 'base64,'.length) : dataUrlOrRaw
}

/** Read a File/Blob as a base64 data URL. */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Persist a file. Accepts a data URL or raw base64; always stores raw bytes. */
export async function saveFile(id: string, dataUrlOrRaw: string): Promise<boolean> {
  const raw = toRawBase64(dataUrlOrRaw)
  if (window.electronAPI?.media) {
    return window.electronAPI.media.save(id, raw)
  }
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, base64: raw }),
    })
    if (res.ok) return true
  } catch { /* fall through */ }
  try { localStorage.setItem(`cortex-media-${id}`, raw); return true } catch { return false }
}

/**
 * Load a file back as a data URL with the correct mime.
 * Pass the mime you stored in the file record (e.g. `application/pdf`).
 */
export async function loadFile(id: string, mime: string): Promise<string | null> {
  let raw: string | null = null

  if (window.electronAPI?.media) {
    const d = await window.electronAPI.media.load(id)
    raw = d ? toRawBase64(d) : null
  } else {
    try {
      const res = await fetch(`/api/media?id=${encodeURIComponent(id)}`)
      if (res.ok) {
        const d = await res.json()
        if (d) raw = toRawBase64(d)
      }
    } catch { /* fall through */ }
    if (raw == null) {
      const ls = localStorage.getItem(`cortex-media-${id}`)
      if (ls) raw = toRawBase64(ls)
    }
  }

  return raw ? `data:${mime};base64,${raw}` : null
}

export async function deleteFile(id: string): Promise<void> {
  if (window.electronAPI?.media) {
    await window.electronAPI.media.delete(id)
    return
  }
  try {
    await fetch('/api/media/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  } catch { /* fall through */ }
  localStorage.removeItem(`cortex-media-${id}`)
}

/** Human-readable file size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

/** Best-effort file extension from a filename or mime type. */
export function extFor(name: string, mime: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (fromName) return fromName
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return mime.slice(6)
  return 'bin'
}
