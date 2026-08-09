/* global Buffer, console, process */

import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const WEBP_QUALITY = 82;
export const CREAM_BACKGROUND = Object.freeze({ r: 253, g: 240, b: 207, alpha: 1 });
export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = "assets-source/word-illustration-sheets";
const OUTPUT_DIRECTORY = "public/assets/illustrations/words";
const CATALOG_PATH = "src/features/learning/content/wordAssetCatalog.ts";
const KANA_DIRECTORY = "public/assets/illustrations/kana";
const DEFAULT_CONTACT = "/private/tmp/hiragana-word-contact-sheet.png";

const WORD_STAGES = Object.freeze([
  ["いえ", "かお", "かき", "かさ", "くし", "こま", "さる", "しか", "すし", "たこ", "つき", "なす"],
  ["あひる", "いぬ", "うさぎ", "えんぴつ", "きりん", "くるま", "こあら", "さかな", "しまうま", "すいか", "たいこ", "つみき"],
  ["かがみ", "いちご", "ごりら", "ぞう", "ざりがに", "だるま", "でんしゃ", "どうぶつ", "ばなな", "ぶた", "ぱんだ", "ぴあの"],
  ["きって", "こっぷ", "らっぱ", "きっぷ", "せっけん", "はっぱ", "しっぽ", "べっど", "ろけっと", "ぽけっと", "ざっし", "がっき"],
  ["きゃべつ", "きゅうり", "きょうりゅう", "しゃしん", "しゅりけん", "しょうぼうしゃ", "ちゃわん", "ちゅうりっぷ", "ちょうちょ", "にんぎょう", "りゅっく", "ぎゅうにゅう"],
]);
const WORDS = Object.freeze(WORD_STAGES.flatMap((stage, stageIndex) => stage.map((text, index) => [`w${stageIndex + 1}-${String(index + 1).padStart(2, "0")}`, text])));
const WORD_ALT_OVERRIDES = Object.freeze({
  "かき": "くだものの かき",
  "たこ": "うみの たこ",
  "どうぶつ": "どうぶつの なかまたち",
  "がっき": "みぢかな がっき",
});
const REUSE_SOURCE_KEYS = Object.freeze({ "w1-04": "kana-ka-umbrella", "w1-12": "kana-na-eggplant", "w2-01": "kana-a-duck", "w2-02": "kana-i-dog", "w2-03": "kana-u-rabbit", "w2-04": "kana-e-pencil", "w2-05": "kana-ki-giraffe", "w2-06": "kana-ku-car", "w2-07": "kana-ko-koala", "w2-08": "kana-sa-fish", "w2-09": "kana-shi-zebra", "w2-10": "kana-su-watermelon", "w2-11": "kana-ta-drum", "w2-12": "kana-tsu-blocks", "w5-09": "kana-chi-butterfly" });
const WORD_SHEETS = Object.freeze([
  ["w1-01", "w1-02", "w1-03", "w1-05", "w1-06", "w1-07", "w1-08", "w1-09"], ["w1-10", "w1-11", "w3-01", "w3-02", "w3-03", "w3-04", "w3-05", "w3-06"], ["w3-07", "w3-08", "w3-09", "w3-10", "w3-11", "w3-12", "w4-01", "w4-02"], ["w4-03", "w4-04", "w4-05", "w4-06", "w4-07", "w4-08", "w4-09", "w4-10"], ["w4-11", "w4-12", "w5-01", "w5-02", "w5-03", "w5-04", "w5-05", "w5-06"], ["w5-07", "w5-08", "w5-10", "w5-11", "w5-12"],
]);

/** 4x2 sheetの名目cellを返す。 */
function cellRect(index) {
  return {
    left: (index % 4) * 384,
    top: Math.floor(index / 4) * 512,
    width: 384,
    height: 512,
  };
}
/** 45件の新規word画像を固定順で返す。 */
function createWordAssets() {
  return WORD_SHEETS.flatMap((keys, sheetIndex) => keys.map((key, index) => {
    const [, text] = WORDS.find(([id]) => id === key);
    return {
      key,
      text,
      alt: text,
      fileName: `${key}.webp`,
      width: 512,
      height: 512,
      sheet: `word-sheet-${String(sheetIndex + 1).padStart(2, "0")}.png`,
      sourceRect: cellRect(index),
    };
  }));
}
export const WORD_ASSETS = Object.freeze(createWordAssets());

/** source矩形をcontainし、背景付きWebPへ変換する。 */
async function writeContainedWebp(source, output, sourceRect) {
  await sharp(source, { failOn: "error" })
    .extract(sourceRect)
    .resize(512, 512, { fit: "contain", background: CREAM_BACKGROUND })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(output);
}
/** 全source/manifest/cropを出力前に検査する。 */
export async function validateWordSourceAssets() {
  const failures = [];
  if (WORDS.length !== 60) failures.push(`word manifest全体が60件ではない: ${WORDS.length}`);
  if (WORD_ASSETS.length !== 45) failures.push(`word manifestが45件ではない: ${WORD_ASSETS.length}`);
  if (Object.keys(REUSE_SOURCE_KEYS).length !== 15) failures.push("reuseが15件ではない");
  if (new Set(WORD_ASSETS.map(({ key }) => key)).size !== 45) failures.push("word keyが重複している");
  if (new Set(WORD_ASSETS.map(({ fileName }) => fileName)).size !== 45) failures.push("word fileNameが重複している");
  for (let number = 1; number <= 6; number += 1) {
    const sheet = `word-sheet-${String(number).padStart(2, "0")}.png`;
    try {
      const metadata = await sharp(join(REPOSITORY_ROOT, SOURCE_DIRECTORY, sheet), { failOn: "error" }).metadata();
      if (metadata.width !== 1536 || metadata.height !== 1024) failures.push(`${sheet}: source寸法が1536x1024ではない`);
      const expected = WORD_SHEETS[number - 1];
      const actual = WORD_ASSETS.filter((asset) => asset.sheet === sheet).map(({ key }) => key);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${sheet}: 固定順が不正`);
    } catch (error) {
      failures.push(`${sheet}: sourceを読めない (${error.message})`);
    }
  }
  for (const { key, sourceRect } of WORD_ASSETS) {
    if (![sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height].every(Number.isInteger)
      || sourceRect.width <= 0 || sourceRect.height <= 0) failures.push(`${key}: sourceRectが正の整数ではない`);
    if (sourceRect.left < 0 || sourceRect.top < 0 || sourceRect.left + sourceRect.width > 1536 || sourceRect.top + sourceRect.height > 1024) failures.push(`${key}: sourceRectがsheet外`);
  }
  if (failures.length) throw new Error(`Word image source preflight failed (${failures.length}):\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
}

/** runtimeの60件統一catalog sourceを決定的に返す。 */
function renderCatalog() {
  const generated = new Map(WORD_ASSETS.map((asset) => [asset.key, asset]));
  const manifest = WORDS.map(([key, text]) => {
    const alt = WORD_ALT_OVERRIDES[text] ?? text;
    if (REUSE_SOURCE_KEYS[key]) {
      return { key, text, alt, kind: "reuse", sourceKey: REUSE_SOURCE_KEYS[key], width: 512, height: 512 };
    }
    return { key, text, alt, kind: "word", fileName: generated.get(key).fileName, width: 512, height: 512 };
  });
  return `import { getIllustration, resolveAssetPath, type IllustrationAsset } from "./assetCatalog";

/** 単語カードが使う画像の固定metadata。 */
export const WORD_ASSET_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;
export type WordIllustrationKey = (typeof WORD_ASSET_MANIFEST)[number]["key"];
/** 単語キーを既存kana再利用を含めた同一APIで解決する。 */
export function getWordIllustration(key: string): IllustrationAsset {
  const asset = WORD_ASSET_MANIFEST.find((entry) => entry.key === key);
  if (!asset) throw new Error(\`Unknown word illustration: \${key}\`);
  if (asset.kind === "reuse") return getIllustration(asset.sourceKey);
  return { src: resolveAssetPath(\`assets/illustrations/words/\${asset.fileName}\`), width: asset.width, height: asset.height, alt: asset.alt };
}
`;
}

const GLYPHS = Object.freeze({ "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"], w: ["10001", "10001", "10101", "10101", "10101", "10101", "01010"], 0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], 1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"], 2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], 3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"], 4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], 5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"], 6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], 7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"], 8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], 9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"] });
/** fontconfig非依存のASCII IDラベルを描く。 */
function label(text) {
  const pixels = [];
  for (const [index, character] of [...text].entries()) {
    for (const [row, line] of GLYPHS[character].entries()) {
      for (const [column, bit] of [...line].entries()) {
        if (bit === "1") pixels.push(`<rect x="${14 + index * 12 + column * 2}" y="${3 + row * 2}" width="2" height="2"/>`);
      }
    }
  }
  return Buffer.from(`<svg width="156" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="156" height="20" fill="#fdf0cf"/><g fill="#123f5a">${pixels.join("")}</g></svg>`);
}
/** 全60語を固定順に結合したcontact sheetを出力する。 */
async function writeContactSheet(root, output) {
  const composites = [];
  for (const [index, [key]] of WORDS.entries()) {
    const generated = WORD_ASSETS.find((asset) => asset.key === key);
    const relative = generated ? join(OUTPUT_DIRECTORY, generated.fileName) : join(KANA_DIRECTORY, `${REUSE_SOURCE_KEYS[key]}.webp`);
    const thumbnail = await sharp(join(root, relative))
      .resize(144, 144, { fit: "contain", background: CREAM_BACKGROUND })
      .png()
      .toBuffer();
    const left = (index % 10) * 176;
    const top = Math.floor(index / 10) * 176;
    composites.push({ input: thumbnail, left: left + 16, top: top + 4 });
    composites.push({ input: label(key), left: left + 10, top: top + 150 });
  }
  await mkdir(dirname(output), { recursive: true });
  await sharp({ create: { width: 1760, height: 1056, channels: 3, background: CREAM_BACKGROUND } })
    .composite(composites)
    .png()
    .toFile(output);
}
function normalizePath(path, base) { return isAbsolute(path) ? path : join(base, path); }
function assertSafeRoot(root, labelText) { if (dirname(root) === root) throw new Error(`${labelText} cannot be a filesystem root: ${root}`); }
async function exists(path) { try { await access(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
/** 隔離rootへ45 WebP、catalog、全60 contact sheetを生成する。 */
async function generateArtifacts({ artifactRoot, contactSheetPath, failureAfterAssetKey }) {
  const wordDirectory = join(artifactRoot, OUTPUT_DIRECTORY);
  const catalog = join(artifactRoot, CATALOG_PATH);
  await Promise.all([
    rm(wordDirectory, { recursive: true, force: true }),
    rm(catalog, { force: true }),
  ]);
  await Promise.all([
    mkdir(wordDirectory, { recursive: true }),
    mkdir(dirname(catalog), { recursive: true }),
  ]);
  for (const asset of WORD_ASSETS) {
    await writeContainedWebp(join(REPOSITORY_ROOT, SOURCE_DIRECTORY, asset.sheet), join(wordDirectory, asset.fileName), asset.sourceRect);
    if (failureAfterAssetKey === asset.key) throw new Error(`Injected word image generation failure after ${asset.key}`);
  }
  await writeFile(catalog, renderCatalog(), "utf8");
  for (const sourceKey of Object.values(REUSE_SOURCE_KEYS)) {
    const target = join(artifactRoot, KANA_DIRECTORY, `${sourceKey}.webp`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(REPOSITORY_ROOT, KANA_DIRECTORY, `${sourceKey}.webp`), target);
  }
  await writeContactSheet(artifactRoot, contactSheetPath);
  return { wordDirectory, catalog };
}
/** publishせず隔離成果物を作る公開API。 */
export async function buildWordImageArtifacts({ artifactRoot, contactSheetPath = "word-contact.png", failureAfterAssetKey } = {}) {
  if (!artifactRoot) throw new Error("artifactRoot is required");
  const root = normalizePath(artifactRoot, REPOSITORY_ROOT);
  assertSafeRoot(root, "artifactRoot");
  sharp.cache(false);
  await validateWordSourceAssets();
  return generateArtifacts({
    artifactRoot: root,
    contactSheetPath: normalizePath(contactSheetPath, root),
    failureAfterAssetKey,
  });
}
/** 同一directory temporary fileからcontact sheetをatomic replaceする。 */
async function publishContact(staged, target) {
  await mkdir(dirname(target), { recursive: true });
  const temporary = await mkdtemp(join(dirname(target), ".hiragana-word-contact-"));
  try {
    const file = join(temporary, "contact.png");
    await copyFile(staged, file);
    await rename(file, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
/** words directoryとword catalog限定のrename transaction。 */
async function publishArtifacts(staged, destinationRoot) {
  const records = [
    { staged: staged.wordDirectory, target: join(destinationRoot, OUTPUT_DIRECTORY) },
    { staged: staged.catalog, target: join(destinationRoot, CATALOG_PATH) },
  ].map((record) => ({
    ...record,
    backup: join(dirname(record.target), `.${basename(record.target)}.backup-${randomUUID()}`),
    hadTarget: false,
  }));
  const installed = [];
  try {
    for (const record of records) {
      await mkdir(dirname(record.target), { recursive: true });
      record.hadTarget = await exists(record.target);
      if (record.hadTarget) await rename(record.target, record.backup);
      try {
        await rename(record.staged, record.target);
      } catch (error) {
        if (record.hadTarget) await rename(record.backup, record.target);
        throw error;
      }
      installed.push(record);
    }
  } catch (error) {
    for (const record of installed.reverse()) {
      if (await exists(record.target)) await rename(record.target, record.staged);
      if (record.hadTarget && await exists(record.backup)) await rename(record.backup, record.target);
    }
    throw error;
  }
  await Promise.all(records.map((record) => rm(record.backup, { recursive: true, force: true })));
}
/** preflight後、成功した隔離生成だけをword管理対象へpublishする。 */
export async function optimizeWordImages({ destinationRoot = REPOSITORY_ROOT, contactSheetPath = process.env.WORD_CONTACT_SHEET_PATH ?? DEFAULT_CONTACT, failureAfterAssetKey } = {}) {
  const root = normalizePath(destinationRoot, REPOSITORY_ROOT);
  assertSafeRoot(root, "destinationRoot");
  sharp.cache(false);
  await validateWordSourceAssets();
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, ".hiragana-word-image-build-"));
  try {
    const stagedContact = join(staging, "contact.png");
    const staged = await generateArtifacts({ artifactRoot: staging, contactSheetPath: stagedContact, failureAfterAssetKey });
    await publishArtifacts(staged, root);
    await publishContact(stagedContact, normalizePath(contactSheetPath, REPOSITORY_ROOT));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Generated ${WORD_ASSETS.length} word images.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await optimizeWordImages({ failureAfterAssetKey: process.env.WORD_IMAGE_GENERATION_FAIL_AFTER });
