/* global console, process */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  buildWordImageArtifacts,
  CREAM_BACKGROUND,
  REPOSITORY_ROOT,
  validateWordSourceAssets,
  WEBP_QUALITY,
  WORD_ASSETS,
} from "./optimize-word-images.mjs";

const WORD_DIRECTORY = "public/assets/illustrations/words";
const CATALOG_PATH = "src/features/learning/content/wordAssetCatalog.ts";
const KANA_DIRECTORY = "public/assets/illustrations/kana";
const SIZE_CAP = 160_000;
const REUSE_FILES = [
  "kana-ka-umbrella.webp", "kana-na-eggplant.webp", "kana-a-duck.webp", "kana-i-dog.webp", "kana-u-rabbit.webp", "kana-e-pencil.webp", "kana-ki-giraffe.webp", "kana-ku-car.webp", "kana-ko-koala.webp", "kana-sa-fish.webp", "kana-shi-zebra.webp", "kana-su-watermelon.webp", "kana-ta-drum.webp", "kana-tsu-blocks.webp", "kana-chi-butterfly.webp",
];

/** 画像の四隅が暖色クリームで、濃藍の輪郭が8px内側にあることを検査する。 */
async function verifyPixels(path, key, check) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width; let minY = info.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * info.channels;
    const [red, green, blue] = [data[offset], data[offset + 1], data[offset + 2]];
    if (red < 80 && green < 125 && blue < 165 && green > red && blue > red) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  check(maxX >= 0 && minX >= 8 && minY >= 8 && maxX <= 503 && maxY <= 503, `${key}: 濃藍輪郭の安全余白が8px未満`);
  for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) {
    const offset = (y * info.width + x) * info.channels;
    check(Math.max(...[0, 1, 2].map((channel) => Math.abs(data[offset + channel] - [CREAM_BACKGROUND.r, CREAM_BACKGROUND.g, CREAM_BACKGROUND.b][channel]))) <= 18, `${key}: 四隅が暖色クリームではない`);
  }
}

/** 指定rootの物理契約と隔離再生成決定性を検査する。 */
export async function verifyWordImages({ repositoryRoot = REPOSITORY_ROOT, checkDeterminism = true, log = true } = {}) {
  const failures = []; const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    await validateWordSourceAssets();
    check(WEBP_QUALITY === 82, `WebP qualityが82ではない: ${WEBP_QUALITY}`);
    const directory = join(repositoryRoot, WORD_DIRECTORY);
    const actual = (await readdir(directory)).filter((file) => file.endsWith(".webp")).sort();
    const expected = WORD_ASSETS.map(({ fileName }) => fileName).sort();
    check(JSON.stringify(actual) === JSON.stringify(expected), `word WebP集合がmanifestと不一致 (${actual.length}件)`);
    for (const asset of WORD_ASSETS) {
      const path = join(directory, asset.fileName);
      const [metadata, fileStat] = await Promise.all([sharp(path).metadata(), stat(path)]);
      check(metadata.format === "webp" && metadata.width === 512 && metadata.height === 512 && metadata.hasAlpha !== true, `${asset.key}: WebP metadataが不正`);
      check(fileStat.size <= SIZE_CAP, `${asset.key}: 容量上限超過`);
      await verifyPixels(path, asset.key, check);
    }
    for (const fileName of REUSE_FILES) await stat(join(repositoryRoot, KANA_DIRECTORY, fileName));
    const catalog = await readFile(join(repositoryRoot, CATALOG_PATH), "utf8");
    check((catalog.match(/"kind": "reuse"/g) ?? []).length === 15 && (catalog.match(/"kind": "word"/g) ?? []).length === 45, "catalogの60件reuse/word内訳が不正");
    if (checkDeterminism) {
      const staging = await mkdtemp(join(tmpdir(), "hiragana-word-image-verification-"));
      try {
        await buildWordImageArtifacts({ artifactRoot: staging, contactSheetPath: join(staging, "contact.png") });
        const paths = [...WORD_ASSETS.map(({ fileName }) => join(WORD_DIRECTORY, fileName)), CATALOG_PATH];
        for (const relative of paths) check(createHash("sha256").update(await readFile(join(repositoryRoot, relative))).digest("hex") === createHash("sha256").update(await readFile(join(staging, relative))).digest("hex"), `${relative}: 隔離再生成SHA-256が不一致`);
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
  } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  const result = { ok: failures.length === 0, failures: [...failures] };
  if (log) console[result.ok ? "log" : "error"](result.ok ? `Verified ${WORD_ASSETS.length} word WebP assets; determinism ${checkDeterminism ? "46/46" : "skipped"}.` : `Word image verification failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyWordImages();
  if (!result.ok) process.exitCode = 1;
}
