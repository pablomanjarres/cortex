const { createCanvas, loadImage } = require('canvas');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const ICONSET = path.join(BUILD, 'icon.iconset');
const WEB = path.join(ROOT, 'public', 'icons');
const VIOLET = '#624AB5';
const mark = fs.readFileSync(path.join(ROOT, 'public', 'brand', 'mark.svg'), 'utf8');
const [markWidth, markHeight] = mark.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
const markBody = mark.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
const wordmark = fs.readFileSync(path.join(ROOT, 'public', 'brand', 'wordmark.svg'), 'utf8');
const wordmarkBody = wordmark.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
// Rasterize the vector above its largest output size before any downsampling.
const renderMark = mark.replace(/width="[^"]*"/, 'width="1024"').replace(/height="[^"]*"/, `height="${1024 * markHeight / markWidth}"`);

function roundedRect(ctx, x, y, size, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + size, y, x + size, y + size, radius);
  ctx.arcTo(x + size, y + size, x, y + size, radius);
  ctx.arcTo(x, y + size, x, y, radius);
  ctx.arcTo(x, y, x + size, y, radius);
  ctx.closePath();
}

function drawMark(ctx, image, size, widthRatio) {
  const width = size * widthRatio;
  const height = width * markHeight / markWidth;
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
}

function appIcon(size, image, { native = false, maskable = false, apple = false } = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = VIOLET;
  if (maskable || apple) {
    ctx.fillRect(0, 0, size, size);
  } else {
    const inset = native ? size * .1 : 0;
    const tile = size - inset * 2;
    roundedRect(ctx, inset, inset, tile, tile * .2);
    ctx.fill();
  }
  // The maskable mark fits inside the central 80%-diameter safe zone.
  drawMark(ctx, image, size, maskable ? .54 : native ? .528 : .66);
  return canvas;
}

function save(canvas, file) {
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
}

async function generate() {
  for (const dir of [BUILD, ICONSET, WEB]) fs.mkdirSync(dir, { recursive: true });
  const white = await loadImage(Buffer.from(renderMark.replaceAll('currentColor', '#FFFFFF')));
  const black = await loadImage(Buffer.from(renderMark.replaceAll('currentColor', '#000000')));
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    save(appIcon(size, white, { native: true }), path.join(BUILD, `icon_${size}.png`));
  }
  for (const size of [22, 44]) {
    const canvas = createCanvas(size, size);
    drawMark(canvas.getContext('2d'), black, size, .8);
    save(canvas, path.join(BUILD, size === 22 ? 'trayTemplate.png' : 'trayTemplate@2x.png'));
  }
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const suffix = scale === 2 ? '@2x' : '';
      fs.copyFileSync(path.join(BUILD, `icon_${size * scale}.png`), path.join(ICONSET, `icon_${size}x${size}${suffix}.png`));
    }
  }
  for (const size of [192, 512]) save(appIcon(size, white), path.join(WEB, `icon-${size}.png`));
  save(appIcon(180, white, { apple: true }), path.join(WEB, 'apple-touch-icon.png'));
  save(appIcon(512, white, { maskable: true }), path.join(WEB, 'icon-maskable-512.png'));
  const width = 64 * .66;
  const height = width * markHeight / markWidth;
  const x = (64 - width) / 2;
  const y = (64 - height) / 2;
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12.8" fill="${VIOLET}"/><g transform="translate(${x} ${y}) scale(${width / markWidth})">${markBody.replaceAll('currentColor', '#FFFFFF')}</g></svg>\n`;
  fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), favicon);
  const symbol = `<g transform="scale(${320 / markHeight})" fill="${VIOLET}">${markBody.replaceAll('currentColor', VIOLET)}</g>`;
  const lettering = `<g transform="translate(421 25.5)" fill="#000000">${wordmarkBody.replaceAll('currentColor', '#000000')}</g>`;
  const logo = background => `<svg xmlns="http://www.w3.org/2000/svg" width="1590" height="320" viewBox="0 0 1590 320">${background ? '<rect width="1590" height="320" fill="#FAF8F3"/>' : ''}${symbol}${lettering}</svg>\n`;
  fs.writeFileSync(path.join(ROOT, 'public', 'brand', 'logo.svg'), logo(false));
  fs.writeFileSync(path.join(ROOT, '.github', 'logo.svg'), logo(true));
  if (process.platform === 'darwin') {
    execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', path.join(BUILD, 'icon.icns')]);
  }
  console.log('Generated Cortex icons from public/brand/mark.svg.');
}

generate().catch(error => { console.error(error); process.exitCode = 1; });
