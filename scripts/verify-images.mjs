/* global console, process */

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

import {
  CREAM_BACKGROUND,
  KANA_ASSETS,
  KANA_OUTPUT_SIZE,
  WEBP_QUALITY,
  WORLD_ASSETS,
} from "./optimize-images.mjs";

const SOURCE_DIRECTORY = resolve("assets-source/illustration-sheets");
const KANA_OUTPUT_DIRECTORY = resolve("public/assets/illustrations/kana");
const WORLD_OUTPUT_DIRECTORY = resolve("public/assets/illustrations/world");
const KANA_SIZE_CAP_BYTES = 160_000;
const WORLD_SIZE_CAP_BYTES = 500_000;
const REQUIRED_NAVY_MARGIN = 8;
const SOURCE_EDGE_WIDTH = 3;

const WHITE_PROTECTION_SAMPLES = Object.freeze([
  { key: "kana-u-rabbit", sourcePoint: { x: 950, y: 250 } },
  { key: "kana-o-rice-ball", sourcePoint: { x: 190, y: 700 } },
  { key: "kana-yu-snowman", sourcePoint: { x: 220, y: 680 } },
]);

const failures = [];

/** 条件違反を蓄積し、可能な限り全対象を一度に報告する。 */
function check(condition, message) {
  if (!condition) failures.push(message);
}

/** 濃藍輪郭として扱うpixelかを判定する。 */
function isNavyPixel(red, green, blue) {
  return red < 80 && green < 125 && blue < 165 && green > red && blue > red;
}

/** 二つのsource矩形が正の面積で交差するかを返す。 */
function rectanglesOverlap(first, second) {
  return first.left < second.left + second.width
    && first.left + first.width > second.left
    && first.top < second.top + second.height
    && first.top + first.height > second.top;
}

/** sourceRectの外周へ濃藍輪郭が接触していないことを検査する。 */
async function verifySourceRectMargin(asset) {
  const { data, info } = await sharp(join(SOURCE_DIRECTORY, asset.sheet))
    .extract(asset.sourceRect)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let edgeNavyPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const isEdge = x < SOURCE_EDGE_WIDTH || x >= info.width - SOURCE_EDGE_WIDTH
        || y < SOURCE_EDGE_WIDTH || y >= info.height - SOURCE_EDGE_WIDTH;
      if (!isEdge) continue;
      const offset = (y * info.width + x) * info.channels;
      if (isNavyPixel(data[offset], data[offset + 1], data[offset + 2])) edgeNavyPixels += 1;
    }
  }

  check(edgeNavyPixels === 0, `${asset.key}: sourceRect外周へ濃藍輪郭が${edgeNavyPixels}px接触`);
}

/** 出力内の濃藍輪郭bboxが4辺から最低8px離れていることを検査する。 */
async function verifyOutputNavyMargin(path, key) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (!isNavyPixel(data[offset], data[offset + 1], data[offset + 2])) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  check(maxX >= 0, `${key}: 濃藍輪郭pixelが見つからない`);
  if (maxX < 0) return;
  check(
    minX >= REQUIRED_NAVY_MARGIN
      && minY >= REQUIRED_NAVY_MARGIN
      && maxX <= info.width - REQUIRED_NAVY_MARGIN - 1
      && maxY <= info.height - REQUIRED_NAVY_MARGIN - 1,
    `${key}: 濃藍bbox (${minX},${minY})-(${maxX},${maxY}) が${REQUIRED_NAVY_MARGIN}px安全余白外`,
  );
}

/** contain paddingの4隅がstyle-reference由来の暖色クリームであることを検査する。 */
async function verifyCreamCorners(path, key) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const corners = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];
  const expected = [CREAM_BACKGROUND.r, CREAM_BACKGROUND.g, CREAM_BACKGROUND.b];

  for (const [x, y] of corners) {
    const offset = (y * info.width + x) * info.channels;
    const actual = [data[offset], data[offset + 1], data[offset + 2]];
    const maximumDifference = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
    check(maximumDifference <= 18,
      `${key}: corner (${x},${y}) が暖色クリームではない (${actual.join(",")})`);
  }
}

/** source座標をcontain後の出力座標へ写像する。 */
function mapSourcePointToOutput(sourceRect, sourcePoint) {
  const scale = Math.min(
    KANA_OUTPUT_SIZE / sourceRect.width,
    KANA_OUTPUT_SIZE / sourceRect.height,
  );
  const resizedWidth = Math.round(sourceRect.width * scale);
  const resizedHeight = Math.round(sourceRect.height * scale);
  return {
    x: Math.round((KANA_OUTPUT_SIZE - resizedWidth) / 2 + (sourcePoint.x - sourceRect.left) * scale),
    y: Math.round((KANA_OUTPUT_SIZE - resizedHeight) / 2 + (sourcePoint.y - sourceRect.top) * scale),
  };
}

/** 白い題材の内部pixelが背景化されずsourceから保持されていることを検査する。 */
async function verifyWhiteProtection(sample) {
  const asset = KANA_ASSETS.find(({ key }) => key === sample.key);
  check(Boolean(asset), `${sample.key}: 白保護sampleに対応するmanifestがない`);
  if (!asset) return;

  const sourcePath = join(SOURCE_DIRECTORY, asset.sheet);
  const outputPath = join(KANA_OUTPUT_DIRECTORY, asset.fileName);
  const sourcePixel = await sharp(sourcePath)
    .extract({ left: sample.sourcePoint.x, top: sample.sourcePoint.y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const outputPoint = mapSourcePointToOutput(asset.sourceRect, sample.sourcePoint);
  const outputPixel = await sharp(outputPath)
    .extract({ left: outputPoint.x, top: outputPoint.y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const channelDifference = [0, 1, 2]
    .reduce((sum, channel) => sum + Math.abs(sourcePixel[channel] - outputPixel[channel]), 0) / 3;

  check(outputPixel[0] >= 225 && outputPixel[1] >= 215 && outputPixel[2] >= 205,
    `${sample.key}: 白い題材sampleが明色ではない (${[...outputPixel].join(",")})`);
  check(channelDifference <= 24,
    `${sample.key}: 白い題材sampleのsource差が大きい (${channelDifference.toFixed(1)})`);
}

/** source sheet寸法、順序、固定cell、sourceRectの安全性を検査する。 */
async function verifySourcesAndManifest() {
  check(WEBP_QUALITY === 82, `WebP qualityが82ではない: ${WEBP_QUALITY}`);
  check(KANA_ASSETS.length === 46, `kana manifestが46件ではない: ${KANA_ASSETS.length}`);
  check(new Set(KANA_ASSETS.map(({ key }) => key)).size === 46, "kana manifestのkeyが重複");
  check(WORLD_ASSETS.length >= 3, `world manifestが3件未満: ${WORLD_ASSETS.length}`);

  for (let sheetNumber = 1; sheetNumber <= 6; sheetNumber += 1) {
    const sheet = `sheet-${String(sheetNumber).padStart(2, "0")}.png`;
    const metadata = await sharp(join(SOURCE_DIRECTORY, sheet)).metadata();
    check(metadata.width === 1536 && metadata.height === 1024,
      `${sheet}: source寸法が1536x1024ではない (${metadata.width}x${metadata.height})`);
  }
  const styleMetadata = await sharp(join(SOURCE_DIRECTORY, "style-reference.png")).metadata();
  check(styleMetadata.width === 1024 && styleMetadata.height === 1536,
    `style-reference.png: source寸法が1024x1536ではない (${styleMetadata.width}x${styleMetadata.height})`);

  for (const [index, asset] of KANA_ASSETS.entries()) {
    const expectedSheet = `sheet-${String(Math.floor(index / 8) + 1).padStart(2, "0")}.png`;
    const indexInSheet = index % 8;
    check(asset.sheet === expectedSheet, `${asset.key}: 固定sheet順が不正 (${asset.sheet})`);
    check(asset.cell.column === indexInSheet % 4 && asset.cell.row === Math.floor(indexInSheet / 4),
      `${asset.key}: 固定4x2 cell順が不正`);
    check(asset.sourceRect.left >= 0 && asset.sourceRect.top >= 0
      && asset.sourceRect.left + asset.sourceRect.width <= 1536
      && asset.sourceRect.top + asset.sourceRect.height <= 1024,
    `${asset.key}: sourceRectがsheet外`);
    const cellCenter = {
      x: asset.cell.column * 384 + 192,
      y: asset.cell.row * 512 + 256,
    };
    check(cellCenter.x >= asset.sourceRect.left
      && cellCenter.x < asset.sourceRect.left + asset.sourceRect.width
      && cellCenter.y >= asset.sourceRect.top
      && cellCenter.y < asset.sourceRect.top + asset.sourceRect.height,
    `${asset.key}: sourceRectが名目cell中心を含まない`);
    await verifySourceRectMargin(asset);
  }

  for (const [index, asset] of KANA_ASSETS.entries()) {
    for (const other of KANA_ASSETS.slice(index + 1)) {
      if (asset.sheet === other.sheet) {
        check(!rectanglesOverlap(asset.sourceRect, other.sourceRect),
          `${asset.key} と ${other.key}: sourceRectが重複`);
      }
    }
  }
}

/** 完成WebPのfile集合、metadata、容量、輪郭余白を検査する。 */
async function verifyOutputs() {
  const kanaFiles = (await readdir(KANA_OUTPUT_DIRECTORY)).filter((file) => file.endsWith(".webp")).sort();
  const worldFiles = (await readdir(WORLD_OUTPUT_DIRECTORY)).filter((file) => file.endsWith(".webp")).sort();
  check(JSON.stringify(kanaFiles) === JSON.stringify(KANA_ASSETS.map(({ fileName }) => fileName).sort()),
    `kana WebP集合がmanifestと不一致 (${kanaFiles.length}件)`);
  check(JSON.stringify(worldFiles) === JSON.stringify(WORLD_ASSETS.map(({ fileName }) => fileName).sort()),
    `world WebP集合がmanifestと不一致 (${worldFiles.length}件)`);

  for (const asset of KANA_ASSETS) {
    const path = join(KANA_OUTPUT_DIRECTORY, asset.fileName);
    const [metadata, fileStat] = await Promise.all([sharp(path).metadata(), stat(path)]);
    check(metadata.format === "webp", `${asset.key}: formatがWebPではない (${metadata.format})`);
    check(metadata.width === 512 && metadata.height === 512,
      `${asset.key}: 寸法が512x512ではない (${metadata.width}x${metadata.height})`);
    check(metadata.hasAlpha !== true, `${asset.key}: 透明channelを持つ`);
    check(fileStat.size <= KANA_SIZE_CAP_BYTES,
      `${asset.key}: ${fileStat.size} bytesで上限${KANA_SIZE_CAP_BYTES}超過`);
    await verifyOutputNavyMargin(path, asset.key);
    await verifyCreamCorners(path, asset.key);
  }

  for (const asset of WORLD_ASSETS) {
    const path = join(WORLD_OUTPUT_DIRECTORY, asset.fileName);
    const [metadata, fileStat] = await Promise.all([sharp(path).metadata(), stat(path)]);
    check(metadata.format === "webp", `${asset.key}: formatがWebPではない (${metadata.format})`);
    check(metadata.width === asset.width && metadata.height === asset.height,
      `${asset.key}: 寸法不正 (${metadata.width}x${metadata.height})`);
    check(metadata.hasAlpha !== true, `${asset.key}: 透明channelを持つ`);
    check(fileStat.size <= WORLD_SIZE_CAP_BYTES,
      `${asset.key}: ${fileStat.size} bytesで上限${WORLD_SIZE_CAP_BYTES}超過`);
  }

  for (const sample of WHITE_PROTECTION_SAMPLES) await verifyWhiteProtection(sample);
}

/** 全画像の再現可能な物理契約を検査し、違反時は対象を列挙してexit 1にする。 */
export async function verifyImages() {
  sharp.cache(false);
  await verifySourcesAndManifest();
  await verifyOutputs();

  if (failures.length > 0) {
    console.error(`Image verification failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Verified ${KANA_ASSETS.length} kana WebP and ${WORLD_ASSETS.length} world WebP assets.`);
  console.log(`Kana cap: ${KANA_SIZE_CAP_BYTES} bytes; world cap: ${WORLD_SIZE_CAP_BYTES} bytes; navy margin: ${REQUIRED_NAVY_MARGIN}px.`);
}

await verifyImages();
