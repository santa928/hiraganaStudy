/* global console, process */

import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = join(REPOSITORY_ROOT, "public/assets/illustrations/world/voice-bird.webp");
const OUTPUT_DIRECTORY = join(REPOSITORY_ROOT, "public/icons");

/** 小鳥の基準絵を円形へ切り抜き、庭の紙質を残す。 */
async function circularBird(size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  return sharp(SOURCE_PATH)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** 文字を使わず、ことりと芽を中心へ置いた512px master iconを生成する。 */
async function createMasterIcon({ maskable }) {
  const birdSize = maskable ? 320 : 390;
  const birdLeft = Math.round((512 - birdSize) / 2);
  const birdTop = maskable ? 58 : 26;
  const sproutTransform = maskable ? ' transform="translate(92 105) scale(.7)"' : "";
  const sprout = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <g${sproutTransform}>
      <path d="M358 426 C357 397 358 376 365 354" fill="none" stroke="#23335f" stroke-width="12" stroke-linecap="round"/>
      <path d="M364 377 C329 372 314 349 320 326 C351 326 372 341 373 367 Z" fill="#77bd68" stroke="#23335f" stroke-width="9" stroke-linejoin="round"/>
      <path d="M366 356 C375 324 398 311 424 316 C423 345 406 365 373 371 Z" fill="#a8db85" stroke="#23335f" stroke-width="9" stroke-linejoin="round"/>
    </g>
  </svg>`);
  const paper = Buffer.from(`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#dff3ff"/>
    <circle cx="256" cy="${maskable ? 256 : 248}" r="${maskable ? 196 : 232}" fill="#fff4d7" stroke="#23335f" stroke-width="${maskable ? 10 : 12}"/>
  </svg>`);
  return sharp({ create: { width: 512, height: 512, channels: 4, background: "#dff3ff" } })
    .composite([
      { input: paper },
      { input: await circularBird(birdSize), left: birdLeft, top: birdTop },
      { input: sprout },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

/** 通常192/512とmaskable 512を、同じsourceから決定的に書き出す。 */
export async function generatePwaIcons({ outputDirectory = OUTPUT_DIRECTORY } = {}) {
  await mkdir(outputDirectory, { recursive: true });
  const regularMaster = await createMasterIcon({ maskable: false });
  const maskableMaster = await createMasterIcon({ maskable: true });
  await Promise.all([
    sharp(regularMaster).resize(192, 192).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(join(outputDirectory, "icon-192.png")),
    sharp(regularMaster).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(join(outputDirectory, "icon-512.png")),
    sharp(maskableMaster).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(join(outputDirectory, "icon-maskable-512.png")),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generatePwaIcons();
  console.log("Generated 192px, 512px, and maskable 512px PWA icons.");
}
