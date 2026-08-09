/* global Buffer, console, process */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

export const WEBP_QUALITY = 82;
export const KANA_OUTPUT_SIZE = 512;
export const CREAM_BACKGROUND = Object.freeze({ r: 253, g: 240, b: 207, alpha: 1 });

const SOURCE_DIRECTORY = resolve("assets-source/illustration-sheets");
const KANA_OUTPUT_DIRECTORY = resolve("public/assets/illustrations/kana");
const WORLD_OUTPUT_DIRECTORY = resolve("public/assets/illustrations/world");
const ASSET_CATALOG_PATH = resolve("src/features/learning/content/assetCatalog.ts");
const CONTACT_SHEET_PATH = process.env.CONTACT_SHEET_PATH
  ?? "/private/tmp/hiragana-kana-contact-sheet.png";

const CELL_WIDTH = 384;
const CELL_HEIGHT = 512;

const SHEET_CONTENT = [
  [
    ["kana-a-duck", "あひる"], ["kana-i-dog", "いぬ"],
    ["kana-u-rabbit", "うさぎ"], ["kana-e-pencil", "えんぴつ"],
    ["kana-o-rice-ball", "おにぎり"], ["kana-ka-umbrella", "かさ"],
    ["kana-ki-giraffe", "きりん"], ["kana-ku-car", "くるま"],
  ],
  [
    ["kana-ke-yarn", "けいと"], ["kana-ko-koala", "こあら"],
    ["kana-sa-fish", "さかな"], ["kana-shi-zebra", "しまうま"],
    ["kana-su-watermelon", "すいか"], ["kana-se-cicada", "せみ"],
    ["kana-so-sky", "そら"], ["kana-ta-drum", "たいこ"],
  ],
  [
    ["kana-chi-butterfly", "ちょうちょ"], ["kana-tsu-blocks", "つみき"],
    ["kana-te-gloves", "てぶくろ"], ["kana-to-tomato", "とまと"],
    ["kana-na-eggplant", "なす"], ["kana-ni-carrot", "にんじん"],
    ["kana-nu-stuffed-toy", "ぬいぐるみ"], ["kana-ne-cat", "ねこ"],
  ],
  [
    ["kana-no-vehicles", "のりもの"], ["kana-ha-flower", "はな"],
    ["kana-hi-chick", "ひよこ"], ["kana-fu-balloon", "ふうせん"],
    ["kana-he-snake", "へび"], ["kana-ho-star", "ほし"],
    ["kana-ma-pillow", "まくら"], ["kana-mi-mandarin", "みかん"],
  ],
  [
    ["kana-mu-insect", "むし"], ["kana-me-glasses", "めがね"],
    ["kana-mo-peach", "もも"], ["kana-ya-mountain", "やま"],
    ["kana-yu-snowman", "ゆきだるま"], ["kana-yo-yacht", "よっと"],
    ["kana-ra-lion", "らいおん"], ["kana-ri-apple", "りんご"],
  ],
  [
    ["kana-ru-roulette", "るーれっと"], ["kana-re-lemon", "れもん"],
    ["kana-ro-candle", "ろうそく"], ["kana-wa-crocodile", "わに"],
    ["kana-wo-apple-eating", "りんごを たべる"], ["kana-n-bread-ending", "ぱん"],
  ],
];

const SOURCE_RECT_OVERRIDES = Object.freeze({
  "kana-ke-yarn": { left: 32, top: 0, width: 384, height: 512 },
  "kana-ko-koala": { left: 416, top: 0, width: 352, height: 512 },
  "kana-chi-butterfly": { left: 0, top: 0, width: 416, height: 512 },
  "kana-tsu-blocks": { left: 416, top: 0, width: 352, height: 512 },
  "kana-ki-giraffe": { left: 768, top: 512, width: 336, height: 512 },
  "kana-ku-car": { left: 1104, top: 576, width: 408, height: 352 },
  "kana-no-vehicles": { left: 32, top: 0, width: 386, height: 512 },
  "kana-ha-flower": { left: 448, top: 0, width: 304, height: 512 },
  "kana-he-snake": { left: 64, top: 512, width: 344, height: 512 },
  "kana-ho-star": { left: 420, top: 512, width: 336, height: 512 },
  "kana-mo-peach": { left: 768, top: 0, width: 336, height: 512 },
  "kana-ya-mountain": { left: 1104, top: 0, width: 408, height: 512 },
  "kana-yo-yacht": { left: 396, top: 520, width: 344, height: 400 },
  "kana-ro-candle": { left: 820, top: 80, width: 240, height: 432 },
  "kana-wa-crocodile": { left: 1060, top: 144, width: 464, height: 368 },
});

/** 4x2の名目セルを返す。越境対象だけ固定overrideで置き換える。 */
function nominalCellRect(index) {
  return {
    left: (index % 4) * CELL_WIDTH,
    top: Math.floor(index / 4) * CELL_HEIGHT,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  };
}

/** 46文字のsource位置とruntime metadataを一つの固定順manifestへ展開する。 */
function createKanaManifest() {
  return SHEET_CONTENT.flatMap((items, sheetIndex) => items.map(([key, alt], index) => ({
    key,
    alt,
    fileName: `${key}.webp`,
    width: KANA_OUTPUT_SIZE,
    height: KANA_OUTPUT_SIZE,
    sheet: `sheet-${String(sheetIndex + 1).padStart(2, "0")}.png`,
    cell: { column: index % 4, row: Math.floor(index / 4) },
    sourceRect: SOURCE_RECT_OVERRIDES[key] ?? nominalCellRect(index),
  })));
}

export const KANA_ASSETS = Object.freeze(createKanaManifest());

export const WORLD_ASSETS = Object.freeze([
  {
    key: "garden-background",
    alt: "朝のひらがなの庭",
    fileName: "garden-background.webp",
    width: 1024,
    height: 1536,
    source: "style-reference.png",
    sourceRect: null,
  },
  {
    key: "voice-bird",
    alt: "こえのことり",
    fileName: "voice-bird.webp",
    width: 512,
    height: 512,
    source: "style-reference.png",
    sourceRect: { left: 48, top: 1008, width: 384, height: 448 },
  },
  {
    key: "watering-can",
    alt: "みどりのじょうろ",
    fileName: "watering-can.webp",
    width: 512,
    height: 512,
    source: "style-reference.png",
    sourceRect: { left: 544, top: 1024, width: 480, height: 432 },
  },
]);

/** 画像を指定矩形から切り出し、背景を保ったcontainでWebPへ変換する。 */
async function writeContainedWebp(sourcePath, outputPath, sourceRect, width, height) {
  let pipeline = sharp(sourcePath, { failOn: "error" });
  if (sourceRect) pipeline = pipeline.extract(sourceRect);

  await pipeline
    .resize(width, height, { fit: "contain", background: CREAM_BACKGROUND })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toFile(outputPath);
}

const BITMAP_GLYPHS = Object.freeze({
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  a: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  b: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  c: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  d: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  e: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  f: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  g: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  h: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  i: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  j: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  k: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  l: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  m: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  n: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  o: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  p: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  r: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  s: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  t: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  u: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  v: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  w: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  x: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
});

/** fontconfigへ依存せず、ASCII keyを5x7 bitmapのSVG矩形として描く。 */
function renderBitmapLabel(text, width, height) {
  const scale = 2;
  const advance = 12;
  const textWidth = text.length * advance - 2;
  const originX = Math.max(4, Math.floor((width - textWidth) / 2));
  const originY = Math.floor((height - 14) / 2);
  const pixels = [];

  for (const [characterIndex, character] of [...text].entries()) {
    const glyph = BITMAP_GLYPHS[character];
    if (!glyph) throw new Error(`Unsupported contact-sheet label character: ${character}`);
    for (const [row, line] of glyph.entries()) {
      for (const [column, bit] of [...line].entries()) {
        if (bit === "1") {
          pixels.push(`<rect x="${originX + characterIndex * advance + column * scale}" y="${originY + row * scale}" width="${scale}" height="${scale}"/>`);
        }
      }
    }
  }

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="4" fill="#fdf0cf" fill-opacity="0.96"/>
    <g fill="#123f5a">${pixels.join("")}</g>
  </svg>`);
}

/** runtime用カタログを画像生成manifestから決定的に生成する。 */
function renderAssetCatalogSource() {
  const kanaManifest = KANA_ASSETS.map(({ key, alt, fileName, width, height }) => ({
    key, fileName, width, height, alt,
  }));
  const worldManifest = WORLD_ASSETS.map(({ key, alt, fileName, width, height }) => ({
    key, fileName, width, height, alt,
  }));

  return `/** 画像の描画寸法と代替文をまとめたruntime metadata。 */
export interface IllustrationAsset {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export const KANA_ASSET_MANIFEST = ${JSON.stringify(kanaManifest, null, 2)} as const;

export const WORLD_ASSET_MANIFEST = ${JSON.stringify(worldManifest, null, 2)} as const;

export type KanaIllustrationKey = (typeof KANA_ASSET_MANIFEST)[number]["key"];
export type WorldIllustrationKey = (typeof WORLD_ASSET_MANIFEST)[number]["key"];

/** GitHub Pagesのbase pathを保った静的asset URLを返す。 */
export function resolveAssetPath(relativePath: string, basePath: string = import.meta.env.BASE_URL): string {
  const normalizedBase = basePath === "/"
    ? "/"
    : \`/\${basePath.replace(/^\\/+|\\/+$/g, "")}/\`;
  return \`\${normalizedBase}\${relativePath.replace(/^\\/+/, "")}\`;
}

function createCatalog<T extends readonly { readonly key: string; readonly fileName: string; readonly width: number; readonly height: number; readonly alt: string }[]>(
  manifest: T,
  directory: "kana" | "world",
): Readonly<Record<T[number]["key"], IllustrationAsset>> {
  return Object.fromEntries(manifest.map((entry) => [
    entry.key,
    {
      src: resolveAssetPath(\`assets/illustrations/\${directory}/\${entry.fileName}\`),
      width: entry.width,
      height: entry.height,
      alt: entry.alt,
    },
  ])) as Readonly<Record<T[number]["key"], IllustrationAsset>>;
}

export const ASSET_CATALOG = createCatalog(KANA_ASSET_MANIFEST, "kana");
export const WORLD_ASSET_CATALOG = createCatalog(WORLD_ASSET_MANIFEST, "world");

/**
 * 指定keyの教材イラストを返す。
 * @throws 未知のkeyでは仮画像へ置換せず例外を投げる。
 */
export function getIllustration(key: string): IllustrationAsset {
  const asset = ASSET_CATALOG[key as KanaIllustrationKey];
  if (!asset) throw new Error(\`Unknown kana illustration: \${key}\`);
  return asset;
}

/**
 * 指定keyの世界観イラストを返す。
 * @throws 未知のkeyでは仮画像へ置換せず例外を投げる。
 */
export function getWorldIllustration(key: string): IllustrationAsset {
  const asset = WORLD_ASSET_CATALOG[key as WorldIllustrationKey];
  if (!asset) throw new Error(\`Unknown world illustration: \${key}\`);
  return asset;
}
`;
}

/** 46画像をキーラベル付きの目視用contact sheetへまとめる。 */
async function writeContactSheet(outputPath) {
  const tileWidth = 280;
  const tileHeight = 240;
  const columns = 8;
  const rows = Math.ceil(KANA_ASSETS.length / columns);
  const composites = [];

  for (const [index, asset] of KANA_ASSETS.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    const thumbnail = await sharp(join(KANA_OUTPUT_DIRECTORY, asset.fileName))
      .resize(216, 216, { fit: "contain", background: CREAM_BACKGROUND })
      .png()
      .toBuffer();
    const label = renderBitmapLabel(asset.key, 260, 24);
    composites.push({ input: thumbnail, left: left + 32, top: top + 4 });
    composites.push({ input: label, left: left + 10, top: top + 212 });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: CREAM_BACKGROUND,
    },
  }).composite(composites).png().toFile(outputPath);
}

/** sourceから全完成画像、runtime catalog、contact sheetを再生成する。 */
export async function optimizeImages() {
  sharp.cache(false);
  await Promise.all([
    mkdir(KANA_OUTPUT_DIRECTORY, { recursive: true }),
    mkdir(WORLD_OUTPUT_DIRECTORY, { recursive: true }),
  ]);

  for (const asset of KANA_ASSETS) {
    await writeContainedWebp(
      join(SOURCE_DIRECTORY, asset.sheet),
      join(KANA_OUTPUT_DIRECTORY, asset.fileName),
      asset.sourceRect,
      asset.width,
      asset.height,
    );
  }

  for (const asset of WORLD_ASSETS) {
    await writeContainedWebp(
      join(SOURCE_DIRECTORY, asset.source),
      join(WORLD_OUTPUT_DIRECTORY, asset.fileName),
      asset.sourceRect,
      asset.width,
      asset.height,
    );
  }

  await writeFile(ASSET_CATALOG_PATH, renderAssetCatalogSource(), "utf8");
  await writeContactSheet(CONTACT_SHEET_PATH);
  console.log(`Generated ${KANA_ASSETS.length} kana images and ${WORLD_ASSETS.length} world images.`);
  console.log(`Contact sheet: ${CONTACT_SHEET_PATH}`);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await optimizeImages();
