/**
 * Generate unified social media icons: dark circle (#334155) + white symbol
 * Uses sharp SVG rendering — no external dependencies needed.
 * Usage: node scripts/generate-social-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'platforms');
const SIZE = 128; // render at 128px, will be displayed at 32px in email
const BG = '#334155';

const icons = {
  'social-portaly': `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="64" cy="64" r="64" fill="${BG}"/>
      <text x="64" y="82" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="white">P</text>
    </svg>`,

  'social-threads': `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="64" cy="64" r="64" fill="${BG}"/>
      <text x="64" y="84" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="76" font-weight="400" fill="white">@</text>
    </svg>`,

  'social-instagram': `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="64" cy="64" r="64" fill="${BG}"/>
      <g transform="translate(32,32)" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="4" width="56" height="56" rx="14"/>
        <circle cx="32" cy="32" r="14"/>
        <circle cx="48" cy="16" r="2.5" fill="white" stroke="none"/>
      </g>
    </svg>`,

  'social-facebook': `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="64" cy="64" r="64" fill="${BG}"/>
      <text x="64" y="88" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="78" font-weight="700" fill="white">f</text>
    </svg>`,

  'social-youtube': `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <circle cx="64" cy="64" r="64" fill="${BG}"/>
      <g transform="translate(28,34)">
        <rect x="0" y="0" width="72" height="60" rx="12" fill="white" opacity="0"/>
        <path d="M70.4 11.2C69.6 8 67.2 5.6 64 4.8 58.4 3.2 36 3.2 36 3.2S13.6 3.2 8 4.8C4.8 5.6 2.4 8 1.6 11.2 0 16.8 0 28.8 0 28.8S0 40.8 1.6 46.4C2.4 49.6 4.8 52 8 52.8 13.6 54.4 36 54.4 36 54.4S58.4 54.4 64 52.8C67.2 52 69.6 49.6 70.4 46.4 72 40.8 72 28.8 72 28.8S72 16.8 70.4 11.2Z" fill="white"/>
        <path d="M28.8 40L47.2 28.8 28.8 17.6Z" fill="${BG}"/>
      </g>
    </svg>`,
};

async function main() {
  for (const [name, svg] of Object.entries(icons)) {
    const outPath = path.join(outDir, `${name}.png`);
    await sharp(Buffer.from(svg.trim()))
      .resize(SIZE, SIZE)
      .png()
      .toFile(outPath);
    console.log(`✓ ${outPath}`);
  }
  console.log('\nDone! Generated 5 social icons.');
}

main().catch(console.error);
