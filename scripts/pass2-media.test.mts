import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import {
  dataUrlMime, deleteFile, ELECTRON_UPLOAD_BYTES, HTTP_UPLOAD_BYTES, loadFile, maxUploadBytes, mediaIdFor,
  readDraggedLink, saveFile, sniffMime, uploadLimitError,
} from '../src/lib/media.ts'
import { stepIndex, swipeStep } from '../src/lib/media-navigation.ts'
import { acceptsDrag } from '../src/lib/use-file-drop-zone.ts'

const JPEG = '/9j/4AAQSkZJRgABAQ=='
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7hoAAAAASUVORK5CYII='
const PDF = btoa('%PDF-1.7\n%âãÏÓ')
const KEY_RE = /^[A-Za-z0-9._-]{1,200}$/

type Call = { url: string; body?: unknown }
const ls = new Map<string, string>()
let calls: Call[] = []
let httpLoad: unknown = null
let httpOk = true

const g = globalThis as unknown as Record<string, unknown>
g.localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => { ls.set(k, v) },
  removeItem: (k: string) => { ls.delete(k) },
}
g.fetch = async (url: string, init?: { body?: string }) => {
  calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined })
  if (!httpOk) throw new Error('offline')
  return { ok: true, json: async () => httpLoad }
}

function useHttp() { g.window = {} }
function useElectron(stored: Record<string, string> = {}) {
  const ipc: Call[] = []
  g.window = {
    electronAPI: {
      media: {
        save: async (id: string, base64: string) => { ipc.push({ url: `save:${id}`, body: base64 }); return true },
        load: async (id: string) => { ipc.push({ url: `load:${id}` }); return stored[id] ?? null },
        delete: async (id: string) => { ipc.push({ url: `delete:${id}` }); return true },
      },
    },
  }
  return ipc
}

beforeEach(() => { ls.clear(); calls = []; httpLoad = null; httpOk = true; useHttp() })

test('oversize encoded images are rejected before HTTP, IPC or fallback storage writes', async () => {
  const tooLarge = 'A'.repeat(Math.ceil((HTTP_UPLOAD_BYTES + 1) / 3) * 4)
  assert.equal(await saveFile('large.png', `data:image/png;base64,${tooLarge}`), false)
  assert.equal(calls.length, 0)
  assert.equal(ls.size, 0)
  const ipc = useElectron()
  const overElectronCap = 'A'.repeat(Math.ceil((ELECTRON_UPLOAD_BYTES + 1) / 3) * 4)
  assert.equal(await saveFile('large.png', overElectronCap), false)
  assert.equal(ipc.length, 0)
})

test('legacy capture fallback stored as raw base64 loads with the sniffed image mime', async () => {
  ls.set('cortex-capture-img-cap-1-0.png', JPEG)
  assert.equal(await loadFile('cap-1-0.png'), `data:image/jpeg;base64,${JPEG}`)
})

test('legacy capture fallback stored as a data URL keeps its bytes and real mime', async () => {
  ls.set('cortex-capture-img-cap-2-0.png', `data:image/jpeg;base64,${JPEG}`)
  assert.equal(await loadFile('cap-2-0.png'), `data:image/jpeg;base64,${JPEG}`)
  ls.set('cortex-capture-img-cap-3-0.png', 'data:image/svg+xml;base64,PHN2Zy8+')
  assert.equal(await loadFile('cap-3-0.png'), 'data:image/svg+xml;base64,PHN2Zy8+')
})

test('the shared key wins over the legacy key', async () => {
  ls.set('cortex-media-a.png', PNG)
  ls.set('cortex-capture-img-a.png', JPEG)
  assert.equal(await loadFile('a.png'), `data:image/png;base64,${PNG}`)
})

test('HTTP load relabels a JPEG the backend tagged as png, but a record mime always wins', async () => {
  httpLoad = `data:image/png;base64,${JPEG}`
  assert.equal(await loadFile('cap-4-0.png'), `data:image/jpeg;base64,${JPEG}`)
  httpLoad = `data:image/png;base64,${PDF}`
  assert.equal(await loadFile('crs-1-0.pdf', 'application/pdf'), `data:application/pdf;base64,${PDF}`)
  assert.equal(calls[0].url, '/api/media?id=cap-4-0.png')
})

test('HTTP load falls back to localStorage when the server has no bytes or returns junk', async () => {
  ls.set('cortex-media-b.pdf', PDF)
  httpLoad = []
  assert.equal(await loadFile('b.pdf'), `data:application/pdf;base64,${PDF}`)
  httpOk = false
  assert.equal(await loadFile('missing.png'), null)
})

test('HTTP save posts raw bytes; offline saves land under the shared key only', async () => {
  assert.equal(await saveFile('c.jpeg', `data:image/jpeg;base64,${JPEG}`), true)
  assert.deepEqual(calls[0], { url: '/api/media', body: { id: 'c.jpeg', base64: JPEG } })
  httpOk = false
  assert.equal(await saveFile('d.jpeg', `data:image/jpeg;base64,${JPEG}`), true)
  assert.equal(ls.get('cortex-media-d.jpeg'), JPEG)
  assert.equal(ls.has('cortex-capture-img-d.jpeg'), false)
})

test('HTTP delete posts the id and clears both fallback keys', async () => {
  ls.set('cortex-media-e.png', PNG)
  ls.set('cortex-capture-img-e.png', PNG)
  await deleteFile('e.png')
  assert.deepEqual(calls[0], { url: '/api/media/delete', body: { id: 'e.png' } })
  assert.equal(ls.size, 0)
})

test('Electron routes save/load/delete through IPC with raw bytes and a legacy read fallback', async () => {
  const ipc = useElectron({ 'f.png': `data:image/png;base64,${JPEG}` })
  assert.equal(await saveFile('g.png', `data:image/png;base64,${PNG}`), true)
  assert.deepEqual(ipc[0], { url: 'save:g.png', body: PNG })
  assert.equal(await loadFile('f.png'), `data:image/jpeg;base64,${JPEG}`)
  ls.set('cortex-capture-img-h.png', `data:image/jpeg;base64,${JPEG}`)
  assert.equal(await loadFile('h.png'), `data:image/jpeg;base64,${JPEG}`)
  await deleteFile('h.png')
  assert.equal(ipc.at(-1)?.url, 'delete:h.png')
  assert.equal(ls.size, 0)
  assert.equal(calls.length, 0, 'Electron never touches HTTP')
})

test('mime helpers read data URL labels and byte signatures', () => {
  assert.equal(dataUrlMime(`data:image/webp;base64,${PNG}`), 'image/webp')
  assert.equal(dataUrlMime(PNG), null)
  assert.equal(sniffMime(PNG), 'image/png')
  assert.equal(sniffMime(JPEG), 'image/jpeg')
  assert.equal(sniffMime(PDF), 'application/pdf')
  assert.equal(sniffMime(btoa('GIF89a')), 'image/gif')
  assert.equal(sniffMime(btoa('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp')
  assert.equal(sniffMime(btoa('plain text')), null)
  assert.equal(sniffMime('%%%'), null)
})

test('media ids satisfy the backend key contract', () => {
  assert.equal(mediaIdFor('crs-1', 0, 'Lecture 1.PDF', 'application/pdf', 42), 'crs-1-42-0.pdf')
  assert.equal(mediaIdFor('mat-x', 2, 'notes.tar.gz', '', 42), 'mat-x-42-2.gz')
  assert.equal(mediaIdFor('mat-x', 0, 'weird.p d$f', '', 42), 'mat-x-42-0.pdf')
  assert.equal(mediaIdFor('cap-1', 1, '', 'image/svg+xml', 42), 'cap-1-42-1.svgxml')
  assert.equal(mediaIdFor('cap-1', 0, 'no-extension', '', 42), 'cap-1-42-0.bin')
  assert.equal(mediaIdFor('cap-1', 0, '', 'image/jpeg', 42), 'cap-1-42-0.jpeg')
  assert.equal(mediaIdFor('cap-1', 0, 'x.!!!', '', 42), 'cap-1-42-0.bin')
  const long = mediaIdFor('a/b '.repeat(80), 3, `x.${'y'.repeat(40)}`, '', Date.now())
  assert.ok(long.length <= 200, `${long.length}`)
  assert.match(long, KEY_RE)
  assert.match(long, /\.y{16}$/)
})

test('upload caps are 15 MB over HTTP and 50 MB through Electron', () => {
  assert.equal(maxUploadBytes(), HTTP_UPLOAD_BYTES)
  assert.equal(uploadLimitError({ name: 'ok.pdf', size: HTTP_UPLOAD_BYTES }), null)
  assert.equal(uploadLimitError({ name: 'big.pdf', size: HTTP_UPLOAD_BYTES + 1 }), '“big.pdf” is over 15 MB — skipped')
  useElectron()
  assert.equal(maxUploadBytes(), ELECTRON_UPLOAD_BYTES)
  assert.equal(uploadLimitError({ name: 'big.pdf', size: HTTP_UPLOAD_BYTES + 1 }), null)
  assert.equal(uploadLimitError({ name: 'huge.pdf', size: ELECTRON_UPLOAD_BYTES + 1 }), '“huge.pdf” is over 50 MB — skipped')
})

const payload = (data: Record<string, string>) => ({ getData: (type: string) => data[type] ?? '' })

test('dragged links come from uri-list (skipping comments) or plain text and need http(s)', () => {
  assert.deepEqual(readDraggedLink(payload({ 'text/uri-list': '# comment\nhttps://www.example.com/a\n' })),
    { url: 'https://www.example.com/a', title: 'example.com' })
  assert.deepEqual(readDraggedLink(payload({ 'text/plain': ' http://docs.test/x ' })), { url: 'http://docs.test/x', title: 'docs.test' })
  assert.equal(readDraggedLink(payload({ 'text/plain': 'javascript:alert(1)' })), null)
  assert.equal(readDraggedLink(payload({})), null)
})

test('drop zones accept files, links and text only', () => {
  assert.equal(acceptsDrag(['Files']), true)
  assert.equal(acceptsDrag(['text/uri-list']), true)
  assert.equal(acceptsDrag(['text/plain']), true)
  assert.equal(acceptsDrag(['text/html', 'application/x-moz-file']), false)
})

test('gallery steps wrap both ways and swipes need 40px of horizontal travel', () => {
  assert.equal(stepIndex(0, -1, 3), 2)
  assert.equal(stepIndex(2, 1, 3), 0)
  assert.equal(stepIndex(1, 1, 3), 2)
  assert.equal(stepIndex(0, 1, 0), 0)
  const start = { x: 100, y: 100 }
  assert.equal(swipeStep(start, { x: 50, y: 110 }), 1)
  assert.equal(swipeStep(start, { x: 150, y: 90 }), -1)
  assert.equal(swipeStep(start, { x: 140, y: 100 }), 0)
  assert.equal(swipeStep(start, { x: 40, y: 200 }), 0)
  assert.equal(swipeStep(null, { x: 0, y: 0 }), 0)
})
