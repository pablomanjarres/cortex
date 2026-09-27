const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');

const GEORGIA_BOLD_ITALIC = '/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf';
if (fs.existsSync(GEORGIA_BOLD_ITALIC)) {
  registerFont(GEORGIA_BOLD_ITALIC, { family: 'GeorgiaBI', style: 'italic', weight: 'bold' });
  console.log('Registered Georgia Bold Italic font');
}
const FONT_FAMILY = fs.existsSync(GEORGIA_BOLD_ITALIC) ? 'GeorgiaBI' : 'Georgia';

fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(ICONSET_DIR, { recursive: true });

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function generateAppIcon(size) {
  const fontSize = Math.round(size * 0.72);
  const skew = -0.18;
  const tmp = createCanvas(size * 2, size * 2);
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.clearRect(0, 0, tmp.width, tmp.height);
  tmpCtx.font = `italic bold ${fontSize}px "${FONT_FAMILY}"`;
  tmpCtx.fillStyle = '#FFFFFF';
  tmpCtx.textAlign = 'center';
  tmpCtx.textBaseline = 'middle';
  tmpCtx.save();
  tmpCtx.translate(tmp.width / 2, tmp.height / 2);
  tmpCtx.transform(1, 0, skew, 1, 0, 0);
  tmpCtx.fillText('C', 0, 0);
  tmpCtx.restore();

  const imgData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
  const pixels = imgData.data;
  let minX = tmp.width, maxX = 0, minY = tmp.height, maxY = 0;
  for (let y = 0; y < tmp.height; y++) {
    for (let x = 0; x < tmp.width; x++) {
      const alpha = pixels[(y * tmp.width + x) * 4 + 3];
      if (alpha > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const glyphW = maxX - minX;
  const glyphH = maxY - minY;
  const glyphCenterX = minX + glyphW / 2;
  const glyphCenterY = minY + glyphH / 2;
  const offsetX = glyphCenterX - tmp.width / 2;
  const offsetY = glyphCenterY - tmp.height / 2;

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const radius = Math.round(size * 0.175);
  ctx.fillStyle = '#000000';
  roundedRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  ctx.font = `italic bold ${fontSize}px "${FONT_FAMILY}"`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(size / 2 - offsetX, size / 2 - offsetY);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.fillText('C', 0, 0);
  ctx.restore();

  return canvas;
}

function generateTrayIcon(size) {
  const canvas = generateAppIcon(size);
  const ctx = canvas.getContext('2d');
  const pixels = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i + 3] = pixels.data[i];
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function savePNG(canvas, filePath) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
  console.log(`  Created: ${path.relative(path.join(__dirname, '..'), filePath)} (${canvas.width}x${canvas.height})`);
}

const appSizes = [1024, 512, 256, 128, 64, 32, 16];
console.log('Generating app icons...');
for (const size of appSizes) {
  const canvas = generateAppIcon(size);
  savePNG(canvas, path.join(BUILD_DIR, `icon_${size}.png`));
}

console.log('\nGenerating tray icons...');
savePNG(generateTrayIcon(22), path.join(BUILD_DIR, 'trayTemplate.png'));
savePNG(generateTrayIcon(44), path.join(BUILD_DIR, 'trayTemplate@2x.png'));

console.log('\nGenerating iconset...');
const iconsetMapping = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

for (const { name, size } of iconsetMapping) {
  const canvas = generateAppIcon(size);
  savePNG(canvas, path.join(ICONSET_DIR, name));
}

console.log('\nDone! All icons generated.');
