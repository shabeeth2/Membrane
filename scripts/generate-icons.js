const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_PATH = path.resolve(__dirname, '..', 'extension', 'assets', 'logo.svg');
const ASSETS_DIR = path.resolve(__dirname, '..', 'extension', 'assets');

const SCALE = 4;

const sizes = [
  { name: 'icon-16.png', size: 16 },
  { name: 'icon-48.png', size: 48 },
  { name: 'icon-128.png', size: 128 },
  { name: 'logo.png', size: 32 },
];

async function generate() {
  const svg = fs.readFileSync(SVG_PATH, 'utf-8');

  for (const { name, size } of sizes) {
    const outPath = path.join(ASSETS_DIR, name);
    const renderSize = size * SCALE;
    await sharp(Buffer.from(svg), { density: 300 })
      .resize(renderSize, renderSize, { fit: 'contain', kernel: 'lanczos3' })
      .resize(size, size, { fit: 'contain', kernel: 'lanczos3' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outPath);
    console.log(`Generated ${name} (${size}x${size}, rendered at ${renderSize}x${renderSize})`);
  }

  console.log('Done.');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
