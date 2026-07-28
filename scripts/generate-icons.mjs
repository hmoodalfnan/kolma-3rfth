/**
 * Renders the PWA icon set from the two SVG sources.
 * Run after editing public/icon.svg or public/favicon.svg:
 *
 *   npm run icons
 */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const icon = readFileSync(path.join(PUBLIC, 'icon.svg'));
const favicon = readFileSync(path.join(PUBLIC, 'favicon.svg'));

const jobs = [
  [icon, 192, 'icon-192.png'],
  [icon, 512, 'icon-512.png'],
  // iOS ignores the web manifest and reads apple-touch-icon instead. It also
  // composites onto white, so the artwork has to be full-bleed already.
  [icon, 180, 'apple-touch-icon.png'],
  [favicon, 32, 'favicon-32.png'],
];

for (const [svg, size, name] of jobs) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, name));
  console.log(`${name}  ${size}x${size}`);
}
