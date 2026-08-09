/* global console, process */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  buildImageArtifacts,
  CREAM_BACKGROUND,
  KANA_ASSETS,
  KANA_OUTPUT_SIZE,
  REPOSITORY_ROOT,
  validateSourceAssets,
  WEBP_QUALITY,
  WORLD_ASSETS,
} from "./optimize-images.mjs";

const SOURCE_DIRECTORY_RELATIVE = "assets-source/illustration-sheets";
const KANA_OUTPUT_DIRECTORY_RELATIVE = "public/assets/illustrations/kana";
const WORLD_OUTPUT_DIRECTORY_RELATIVE = "public/assets/illustrations/world";
const ASSET_CATALOG_PATH_RELATIVE = "src/features/learning/content/assetCatalog.ts";
const KANA_SIZE_CAP_BYTES = 160_000;
const WORLD_SIZE_CAP_BYTES = 500_000;
const REQUIRED_NAVY_MARGIN = 8;
const SOURCE_EDGE_WIDTH = 3;

const WHITE_PROTECTION_SAMPLES = Object.freeze([
  { key: "kana-u-rabbit", sourcePoint: { x: 950, y: 250 } },
  { key: "kana-o-rice-ball", sourcePoint: { x: 190, y: 700 } },
  { key: "kana-yu-snowman", sourcePoint: { x: 220, y: 680 } },
]);

/** 濃藍輪郭として扱うpixelかを判定する。 */
function isNavyPixel(red, green, blue) {
  return red < 80 && green < 125 && blue < 165 && green > red && blue > red;
}

/** sourceRectの外周へ濃藍輪郭が接触していないことを検査する。 */
async function verifySourceRectMargin(asset, sourceDirectory, check) {
  const { data, info } = await sharp(join(sourceDirectory, asset.sheet))
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
async function verifyOutputNavyMargin(path, key, check) {
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
async function verifyCreamCorners(path, key, check) {
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
async function verifyWhiteProtection(sample, sourceDirectory, kanaOutputDirectory, check) {
  const asset = KANA_ASSETS.find(({ key }) => key === sample.key);
  check(Boolean(asset), `${sample.key}: 白保護sampleに対応するmanifestがない`);
  if (!asset) return;

  const sourcePixel = await sharp(join(sourceDirectory, asset.sheet))
    .extract({ left: sample.sourcePoint.x, top: sample.sourcePoint.y, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const outputPoint = mapSourcePointToOutput(asset.sourceRect, sample.sourcePoint);
  const outputPixel = await sharp(join(kanaOutputDirectory, asset.fileName))
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

/** 完成WebPのfile集合、metadata、容量、輪郭余白を検査する。 */
async function verifyOutputs(repositoryRoot, check) {
  const kanaOutputDirectory = join(repositoryRoot, KANA_OUTPUT_DIRECTORY_RELATIVE);
  const worldOutputDirectory = join(repositoryRoot, WORLD_OUTPUT_DIRECTORY_RELATIVE);
  const kanaFiles = (await readdir(kanaOutputDirectory)).filter((file) => file.endsWith(".webp")).sort();
  const worldFiles = (await readdir(worldOutputDirectory)).filter((file) => file.endsWith(".webp")).sort();
  check(JSON.stringify(kanaFiles) === JSON.stringify(KANA_ASSETS.map(({ fileName }) => fileName).sort()),
    `kana WebP集合がmanifestと不一致 (${kanaFiles.length}件)`);
  check(JSON.stringify(worldFiles) === JSON.stringify(WORLD_ASSETS.map(({ fileName }) => fileName).sort()),
    `world WebP集合がmanifestと不一致 (${worldFiles.length}件)`);

  for (const asset of KANA_ASSETS) {
    const path = join(kanaOutputDirectory, asset.fileName);
    const [metadata, fileStat] = await Promise.all([sharp(path).metadata(), stat(path)]);
    check(metadata.format === "webp", `${asset.key}: formatがWebPではない (${metadata.format})`);
    check(metadata.width === 512 && metadata.height === 512,
      `${asset.key}: 寸法が512x512ではない (${metadata.width}x${metadata.height})`);
    check(metadata.hasAlpha !== true, `${asset.key}: 透明channelを持つ`);
    check(fileStat.size <= KANA_SIZE_CAP_BYTES,
      `${asset.key}: ${fileStat.size} bytesで上限${KANA_SIZE_CAP_BYTES}超過`);
    await verifyOutputNavyMargin(path, asset.key, check);
    await verifyCreamCorners(path, asset.key, check);
  }

  for (const asset of WORLD_ASSETS) {
    const path = join(worldOutputDirectory, asset.fileName);
    const [metadata, fileStat] = await Promise.all([sharp(path).metadata(), stat(path)]);
    check(metadata.format === "webp", `${asset.key}: formatがWebPではない (${metadata.format})`);
    check(metadata.width === asset.width && metadata.height === asset.height,
      `${asset.key}: 寸法不正 (${metadata.width}x${metadata.height})`);
    check(metadata.hasAlpha !== true, `${asset.key}: 透明channelを持つ`);
    check(fileStat.size <= WORLD_SIZE_CAP_BYTES,
      `${asset.key}: ${fileStat.size} bytesで上限${WORLD_SIZE_CAP_BYTES}超過`);
  }

  const sourceDirectory = join(repositoryRoot, SOURCE_DIRECTORY_RELATIVE);
  for (const sample of WHITE_PROTECTION_SAMPLES) {
    await verifyWhiteProtection(sample, sourceDirectory, kanaOutputDirectory, check);
  }
}

/** fileのSHA-256を返す。 */
async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** actual成果物と隔離再生成50成果物がbyte単位で一致することを検証する。 */
async function verifyDeterministicRegeneration(repositoryRoot, check) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "hiragana-image-verification-"));
  const relativePaths = [
    ...KANA_ASSETS.map(({ fileName }) => join(KANA_OUTPUT_DIRECTORY_RELATIVE, fileName)),
    ...WORLD_ASSETS.map(({ fileName }) => join(WORLD_OUTPUT_DIRECTORY_RELATIVE, fileName)),
    ASSET_CATALOG_PATH_RELATIVE,
  ].sort();
  check(relativePaths.length === 50, `決定性比較対象が50件ではない: ${relativePaths.length}`);

  try {
    await buildImageArtifacts({
      artifactRoot: temporaryDirectory,
      contactSheetPath: join(temporaryDirectory, "contact.png"),
    });
    for (const relativePath of relativePaths) {
      const [actualHash, regeneratedHash] = await Promise.all([
        sha256(join(repositoryRoot, relativePath)),
        sha256(join(temporaryDirectory, relativePath)),
      ]);
      check(actualHash === regeneratedHash,
        `${relativePath}: 隔離再生成SHA-256が既存成果物と不一致`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** 指定repo rootの物理契約と任意の隔離再生成決定性を検査し、再入可能な結果を返す。 */
export async function verifyImages({
  repositoryRoot = REPOSITORY_ROOT,
  checkDeterminism = true,
  log = true,
} = {}) {
  sharp.cache(false);
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  try {
    await validateSourceAssets();
    check(WEBP_QUALITY === 82, `WebP qualityが82ではない: ${WEBP_QUALITY}`);
    const sourceDirectory = join(REPOSITORY_ROOT, SOURCE_DIRECTORY_RELATIVE);
    for (const asset of KANA_ASSETS) await verifySourceRectMargin(asset, sourceDirectory, check);
    await verifyOutputs(repositoryRoot, check);
    if (checkDeterminism) await verifyDeterministicRegeneration(repositoryRoot, check);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const result = { ok: failures.length === 0, failures: [...failures] };
  if (log) {
    if (!result.ok) {
      console.error(`Image verification failed (${failures.length}):`);
      for (const failure of failures) console.error(`- ${failure}`);
    } else {
      console.log(`Verified ${KANA_ASSETS.length} kana WebP and ${WORLD_ASSETS.length} world WebP assets.`);
      console.log(`Kana cap: ${KANA_SIZE_CAP_BYTES} bytes; world cap: ${WORLD_SIZE_CAP_BYTES} bytes; navy margin: ${REQUIRED_NAVY_MARGIN}px.`);
      if (checkDeterminism) console.log("Determinism: 50/50 SHA-256 matches from isolated regeneration.");
    }
  }
  return result;
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await verifyImages();
  if (!result.ok) process.exitCode = 1;
}
