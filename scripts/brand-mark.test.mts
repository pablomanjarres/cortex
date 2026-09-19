import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createCanvas, loadImage } from 'canvas'

const root = new URL('../', import.meta.url)

function pixelsFor(image: Awaited<ReturnType<typeof loadImage>>, size: number) {
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, size, size)
  return context.getImageData(0, 0, size, size).data
}

function colorCounts(pixels: Uint8ClampedArray) {
  let visible = 0
  let lavender = 0
  let lime = 0
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [red, green, blue, alpha] = pixels.slice(offset, offset + 4)
    if (alpha < 128) continue
    visible++
    if (blue > red + 25 && blue > green + 25) lavender++
    if (green > blue + 25 && green > red + 20) lime++
  }
  return { visible, lavender, lime }
}

test('the shared Cortex mark stays legible at sidebar and favicon sizes', async () => {
  const mark = await loadImage(await readFile(new URL('public/cortex-mark.svg', root)))

  for (const size of [16, 40]) {
    const pixels = pixelsFor(mark, size)
    const { visible, lavender, lime } = colorCounts(pixels)
    assert.ok(visible > size * size * 0.08, `${size}px mark must not disappear`)
    assert.ok(lavender > 0, `${size}px mark needs its lavender outline`)
    assert.ok(lime > 0, `${size}px mark needs its lime signal`)
    assert.equal(pixels[3], 0, `${size}px mark must compose on light and dark surfaces`)
  }
})

test('generated Mac and PWA icons carry the same lilac and lime brand', async () => {
  for (const asset of ['build/icon_64.png', 'public/icons/icon-192.png']) {
    const icon = await loadImage(await readFile(new URL(asset, root)))
    const { lavender, lime } = colorCounts(pixelsFor(icon, 64))
    assert.ok(lavender > 20, `${asset} lost the lavender mark`)
    assert.ok(lime > 2, `${asset} lost the lime signal`)
  }
})
