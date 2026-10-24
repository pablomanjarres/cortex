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
//
// Captures predate this module and wrote their dev-mode fallback under
// `cortex-capture-img-<id>` as a full data URL. Reads still honour that key and
// deletes clear it; new writes only use `cortex-media-<id>`.

const LS_PREFIX = 'cortex-media-'
const LEGACY_LS_PREFIX = 'cortex-capture-img-'

function toRawBase64(dataUrlOrRaw: string): string {
  const i = dataUrlOrRaw.indexOf('base64,')
  return i >= 0 ? dataUrlOrRaw.slice(i + 'base64,'.length) : dataUrlOrRaw
}

/** The mime label of a data URL, or null for raw base64. */
export function dataUrlMime(value: string): string | null {
  return /^data:([^;,]+)[;,]/.exec(value)?.[1] ?? null
}

/** Real mime of common image/PDF bytes from their magic number, or null. */
export function sniffMime(rawBase64: string): string | null {
  let head: string
  try { head = atob(rawBase64.slice(0, 16)) } catch { return null }
  const at = (i: number) => head.charCodeAt(i)
  if (at(0) === 0x89 && head.slice(1, 4) === 'PNG') return 'image/png'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (head.startsWith('GIF8')) return 'image/gif'
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp'
  if (head.startsWith('%PDF')) return 'application/pdf'
  return null
}

function readLocal(id: string): string | null {
  try {
    return localStorage.getItem(`${LS_PREFIX}${id}`) ?? localStorage.getItem(`${LEGACY_LS_PREFIX}${id}`)
  } catch { return null }
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
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0
  if (Math.floor(raw.length * 3 / 4) - padding > maxUploadBytes()) return false
  if (window.electronAPI?.media) {
    try { return await window.electronAPI.media.save(id, raw) } catch { return false }
  }
  try {
    const res = await fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, base64: raw }),
    })
    if (res.ok) return true
  } catch { /* fall through */ }
  try { localStorage.setItem(`${LS_PREFIX}${id}`, raw); return true } catch { return false }
}

/**
 * Load a file back as a data URL with the correct mime.
 * Pass the mime you stored in the file record (e.g. `application/pdf`). Without
 * one, the bytes' own signature wins over the backend's extension-based label,
 * so a JPEG saved under a `.png` id still comes back as `image/jpeg`.
 */
export async function loadFile(id: string, mime?: string): Promise<string | null> {
  let stored: string | null = null

  if (window.electronAPI?.media) {
    try { stored = await window.electronAPI.media.load(id) } catch { /* fall through */ }
  } else {
    try {
      const res = await fetch(`/api/media?id=${encodeURIComponent(id)}`)
      if (res.ok) {
        const d = await res.json()
        if (typeof d === 'string' && d) stored = d
      }
    } catch { /* fall through */ }
  }
  stored ||= readLocal(id)
  if (!stored) return null

  const raw = toRawBase64(stored)
  if (!raw) return null
  const type = mime || sniffMime(raw) || dataUrlMime(stored) || 'application/octet-stream'
  return `data:${type};base64,${raw}`
}

export async function deleteFile(id: string): Promise<void> {
  if (window.electronAPI?.media) {
    await window.electronAPI.media.delete(id)
  } else {
    try {
      await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch { /* fall through */ }
  }
  try {
    localStorage.removeItem(`${LS_PREFIX}${id}`)
    localStorage.removeItem(`${LEGACY_LS_PREFIX}${id}`)
  } catch { /* storage unavailable */ }
}

/** Trigger a browser download of a data URL under its original filename. */
export function downloadDataUrl(src: string, name: string): void {
  const a = document.createElement('a')
  a.href = src
  a.download = name
  a.click()
}

// Size caps: 50 MB per file through the Electron IPC media backend, 15 MB
// through the HTTP fallback (the server body cap is 25 MB incl. base64 overhead).
export const ELECTRON_UPLOAD_BYTES = 50 * 1024 * 1024
export const HTTP_UPLOAD_BYTES = 15 * 1024 * 1024

export const maxUploadBytes = () =>
  typeof window !== 'undefined' && window.electronAPI?.media ? ELECTRON_UPLOAD_BYTES : HTTP_UPLOAD_BYTES

/** A user-facing reason the file can't be uploaded, or null when it fits. */
export function uploadLimitError(file: { name: string; size: number }, cap = maxUploadBytes()): string | null {
  return file.size > cap ? `“${file.name}” is over ${formatBytes(cap)} — skipped` : null
}

/** Pull a URL + title out of a drag payload (dragging a link / article). */
export function readDraggedLink(dt: Pick<DataTransfer, 'getData'>): { url: string; title: string } | null {
  const uriList = dt.getData('text/uri-list')
  const plain = dt.getData('text/plain')
  const html = dt.getData('text/html')
  const url = (uriList.split('\n').find(l => l && !l.startsWith('#')) || plain || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  let title = ''
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    title = (doc.querySelector('a')?.textContent || doc.body.textContent || '').trim()
  }
  if (!title) { try { title = new URL(url).hostname.replace(/^www\./, '') } catch { title = url } }
  return { url, title: title.slice(0, 200) }
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

/**
 * A new media id that satisfies the backend's /^[A-Za-z0-9._-]{1,200}$/ contract:
 * `<prefix>-<stamp>-<index>.<ext>`, with the extension reduced to [a-z0-9]
 * (matches the MCP tool's scheme) and the prefix trimmed to fit.
 */
export function mediaIdFor(prefix: string, index: number, name: string, mime: string, stamp = Date.now()): string {
  const ext = extFor(name, mime).replace(/[^a-z0-9]/g, '').slice(0, 16) || 'bin'
  const suffix = `-${stamp}-${index}.${ext}`
  const base = prefix.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 200 - suffix.length)
  return `${base}${suffix}`
}
