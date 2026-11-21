#!/usr/bin/env node
// Writes public/favicon.ico from public/favicon.svg: one 32x32 PNG inside an ICO container (what every browser
// reads since 2010). Rendered by the Chrome of this machine (test/browser/chrome.mjs); run it again when the svg changes.
//
//   node scripts/favicon-ico.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../test/browser/chrome.mjs';

const svg = fileURLToPath(new URL('../public/favicon.svg', import.meta.url));
const out = fileURLToPath(new URL('../public/favicon.ico', import.meta.url));
const p = await launch({ width: 32, height: 32 });
await p.viewport(32, 32);
await p.goto(pathToFileURL(svg).href);
const shot = await p.send('Page.captureScreenshot', { format: 'png' });
await p.close();
const png = Buffer.from(shot.result.data, 'base64');

const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); // reserved
head.writeUInt16LE(1, 2); // type: icon
head.writeUInt16LE(1, 4); // one image
head[6] = 32; // width
head[7] = 32; // height
head.writeUInt16LE(1, 12); // colour planes
head.writeUInt16LE(32, 14); // bits per pixel
head.writeUInt32LE(png.length, 14 + 4); // size of the image
head.writeUInt32LE(22, 18); // offset of the image
writeFileSync(out, Buffer.concat([head, png]));
console.log(`${out}: ${22 + png.length} bytes`);
