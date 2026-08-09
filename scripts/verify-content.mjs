/* global console, process */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** 完成版で固定する清音46文字順。 */
export const EXPECTED_KANA_ORDER = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"];

/** 完成46文字後に固定順で開く60語。 */
export const EXPECTED_WORDS_BY_STAGE = {
  W1: ["いえ", "かお", "かき", "かさ", "くし", "こま", "さる", "しか", "すし", "たこ", "つき", "なす"],
  W2: ["あひる", "いぬ", "うさぎ", "えんぴつ", "きりん", "くるま", "こあら", "さかな", "しまうま", "すいか", "たいこ", "つみき"],
  W3: ["かがみ", "いちご", "ごりら", "ぞう", "ざりがに", "だるま", "でんしゃ", "どうぶつ", "ばなな", "ぶた", "ぱんだ", "ぴあの"],
  W4: ["きって", "こっぷ", "らっぱ", "きっぷ", "せっけん", "はっぱ", "しっぽ", "べっど", "ろけっと", "ぽけっと", "ざっし", "がっき"],
  W5: ["きゃべつ", "きゅうり", "きょうりゅう", "しゃしん", "しゅりけん", "しょうぼうしゃ", "ちゃわん", "ちゅうりっぷ", "ちょうちょ", "にんぎょう", "りゅっく", "ぎゅうにゅう"],
};

const EXPECTED_ADVANCED_WRITING = [..."がぎござぞだでどばぶべぼぱぴぷぽっゃゅょ"];
const EXPECTED_WRITING_CHARACTERS = [...EXPECTED_KANA_ORDER, ...EXPECTED_ADVANCED_WRITING];
const EXPECTED_WORLD_KEYS = ["garden-background", "voice-bird", "watering-can"];
const EXPECTED_SFX_PATHS = ["garden-loop.wav", "sprout.wav", "success.wav", "tap.wav"]
  .map((fileName) => `public/assets/sfx/${fileName}`);
const EXPECTED_ICON_PATHS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]
  .map((fileName) => `public/icons/${fileName}`);
const EXPECTED_LICENSE_PATHS = [
  "THIRD_PARTY_NOTICES.md",
  "public/licenses/fude-kana-data/LICENSE",
  "public/licenses/fude-kana-data/NOTICE",
];

/** OS差を除いたrepository相対pathへ正規化する。 */
function repositoryPath(rootDirectory, absolutePath) {
  return relative(rootDirectory, absolutePath).split(sep).join("/");
}

/** 指定directory以下の物理ファイルを再帰列挙する。 */
async function walkFiles(rootDirectory, directory, results) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) await walkFiles(rootDirectory, absolutePath, results);
    else if (entry.isFile()) results.add(repositoryPath(rootDirectory, absolutePath));
  }
}

/** TypeScript中の固定manifest objectから、監査に必要な文字列fieldだけを読む。 */
function parseManifestObjects(source, keyPattern) {
  const entries = [];
  const objectPattern = new RegExp(`\\{\\s*"key":\\s*"(${keyPattern})",([\\s\\S]*?)\\n\\s*\\}`, "g");
  for (const match of source.matchAll(objectPattern)) {
    const body = match[2];
    const field = (name) => body.match(new RegExp(`"${name}":\\s*"([^"]*)"`))?.[1] ?? null;
    entries.push({
      key: match[1],
      text: field("text"),
      alt: field("alt"),
      kind: field("kind"),
      fileName: field("fileName"),
      sourceKey: field("sourceKey"),
    });
  }
  return entries;
}

/** words.tsのstage配列を、実装コードを実行せず固定文字列として読む。 */
function parseWordsByStage(source) {
  return Object.fromEntries(Object.keys(EXPECTED_WORDS_BY_STAGE).map((stage) => {
    const body = source.match(new RegExp(`${stage}:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "";
    return [stage, [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1])];
  }));
}

/** 文字列配列の順序差を、欠落keyが分かるメッセージへ変換する。 */
function compareOrdered(label, actual, expected, issues) {
  for (const value of expected) {
    if (!actual.includes(value)) issues.push(`${label}欠落: ${value}`);
  }
  for (const value of actual) {
    if (!expected.includes(value)) issues.push(`${label}対象外: ${value}`);
  }
  if (actual.length === expected.length && actual.some((value, index) => value !== expected[index])) {
    issues.push(`${label}順不一致: ${actual.join("")}`);
  }
}

/** 重複した教材keyを一覧化する。 */
function reportDuplicates(label, values, issues) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) issues.push(`${label}重複: ${value}`);
    seen.add(value);
  }
}

/** 期待する物理ファイル集合との差を列挙する。 */
function compareFiles(actualFiles, expectedFiles, missingLabel, unexpectedLabel, issues) {
  for (const path of expectedFiles) {
    if (!actualFiles.has(path)) issues.push(`${missingLabel}: ${path}`);
  }
  for (const path of actualFiles) {
    if (!expectedFiles.has(path)) issues.push(`${unexpectedLabel}: ${path}`);
  }
}

/** repository実体から、内容監査用の読取専用inventoryを作る。 */
export async function collectContentInventory(repositoryRoot) {
  const rootDirectory = resolve(repositoryRoot);
  const [kanaSource, wordsSource, assetCatalogSource, wordAssetCatalogSource] = await Promise.all([
    readFile(join(rootDirectory, "src/features/learning/content/kana.ts"), "utf8"),
    readFile(join(rootDirectory, "src/features/learning/content/words.ts"), "utf8"),
    readFile(join(rootDirectory, "src/features/learning/content/assetCatalog.ts"), "utf8"),
    readFile(join(rootDirectory, "src/features/learning/content/wordAssetCatalog.ts"), "utf8"),
  ]);
  const kanaEntries = [...kanaSource.matchAll(/\{\s*character:\s*"([^"]+)",\s*illustrationKey:\s*"([^"]+)"/g)]
    .map((match) => ({ character: match[1], illustrationKey: match[2] }));
  const catalogEntries = parseManifestObjects(assetCatalogSource, '[^"]+');
  const wordAssetEntries = parseManifestObjects(wordAssetCatalogSource, "w[1-5]-[0-9]{2}");
  const existingFiles = new Set();
  for (const relativeDirectory of [
    "public/assets",
    "public/icons",
    "public/licenses",
    "src/features/writing/data/generated",
  ]) {
    await walkFiles(rootDirectory, join(rootDirectory, relativeDirectory), existingFiles);
  }
  existingFiles.add("THIRD_PARTY_NOTICES.md");

  const strokeDirectory = join(rootDirectory, "src/features/writing/data/generated");
  const strokeTemplates = [];
  for (const entry of await readdir(strokeDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readFile(join(strokeDirectory, entry.name), "utf8"));
      strokeTemplates.push({
        character: typeof parsed.character === "string" ? parsed.character : "",
        fileName: entry.name,
        valid: Array.isArray(parsed.strokes) && parsed.strokes.length > 0
          && parsed.strokes.every((stroke) => Array.isArray(stroke.points) && stroke.points.length === 48),
      });
    } catch {
      strokeTemplates.push({ character: "", fileName: entry.name, valid: false });
    }
  }

  const noticeContents = Object.fromEntries(await Promise.all(EXPECTED_LICENSE_PATHS.map(async (path) => {
    try {
      return [path, await readFile(join(rootDirectory, path), "utf8")];
    } catch {
      return [path, ""];
    }
  })));

  return {
    kanaEntries,
    wordsByStage: parseWordsByStage(wordsSource),
    catalogEntries,
    wordAssetEntries,
    strokeTemplates,
    existingFiles,
    noticeContents,
  };
}

/** inventoryを完成版の固定契約と照合し、対象key付きの全問題を返す。 */
export function findContentIssues(inventory) {
  const issues = [];
  const kanaCharacters = inventory.kanaEntries.map((entry) => entry.character);
  compareOrdered("ひらがな順", kanaCharacters, EXPECTED_KANA_ORDER, issues);
  reportDuplicates("ひらがな", kanaCharacters, issues);

  const words = [];
  for (const [stage, expectedWords] of Object.entries(EXPECTED_WORDS_BY_STAGE)) {
    const actualWords = inventory.wordsByStage[stage] ?? [];
    compareOrdered(`${stage}単語`, actualWords, expectedWords, issues);
    words.push(...actualWords);
  }
  if (words.length !== 60) issues.push(`単語数不一致: ${words.length}/60`);
  reportDuplicates("単語", words, issues);

  const catalogByKey = new Map(inventory.catalogEntries.map((entry) => [entry.key, entry]));
  reportDuplicates("illustration定義", inventory.catalogEntries.map((entry) => entry.key), issues);
  for (const entry of inventory.kanaEntries) {
    const asset = catalogByKey.get(entry.illustrationKey);
    if (!asset) {
      issues.push(`ひらがなillustration定義欠落: ${entry.character}:${entry.illustrationKey}`);
      continue;
    }
    const path = `public/assets/illustrations/kana/${asset.fileName}`;
    if (!asset.fileName || !inventory.existingFiles.has(path)) issues.push(`公開asset欠落: ${path}`);
  }
  for (const key of EXPECTED_WORLD_KEYS) {
    const asset = catalogByKey.get(key);
    const path = `public/assets/illustrations/world/${asset?.fileName ?? `${key}.webp`}`;
    if (!asset) issues.push(`世界illustration定義欠落: ${key}`);
    else if (!inventory.existingFiles.has(path)) issues.push(`公開asset欠落: ${path}`);
  }

  const expectedWordIds = Object.keys(EXPECTED_WORDS_BY_STAGE).flatMap((stage, stageIndex) => (
    EXPECTED_WORDS_BY_STAGE[stage].map((text, wordIndex) => ({
      id: `w${stageIndex + 1}-${String(wordIndex + 1).padStart(2, "0")}`,
      text,
    }))
  ));
  const wordAssetByKey = new Map(inventory.wordAssetEntries.map((entry) => [entry.key, entry]));
  reportDuplicates("単語illustration定義", inventory.wordAssetEntries.map((entry) => entry.key), issues);
  for (const expected of expectedWordIds) {
    const asset = wordAssetByKey.get(expected.id);
    if (!asset) {
      issues.push(`単語illustration定義欠落: ${expected.id}`);
      continue;
    }
    if (asset.text !== expected.text) issues.push(`単語illustration対応不一致: ${expected.id}:${asset.text ?? ""}`);
    if (!asset.alt) issues.push(`単語alt欠落: ${expected.id}`);
    if (asset.kind === "reuse") {
      if (!asset.sourceKey || !catalogByKey.has(asset.sourceKey)) issues.push(`単語再利用元欠落: ${expected.id}:${asset.sourceKey ?? ""}`);
    } else if (asset.kind === "word" && asset.fileName) {
      const path = `public/assets/illustrations/words/${asset.fileName}`;
      if (!inventory.existingFiles.has(path)) issues.push(`公開asset欠落: ${path}`);
    } else {
      issues.push(`単語illustration種別不正: ${expected.id}`);
    }
  }

  const expectedImageFiles = new Set([
    ...inventory.catalogEntries.filter((entry) => entry.key.startsWith("kana-") && entry.fileName)
      .map((entry) => `public/assets/illustrations/kana/${entry.fileName}`),
    ...inventory.catalogEntries.filter((entry) => EXPECTED_WORLD_KEYS.includes(entry.key) && entry.fileName)
      .map((entry) => `public/assets/illustrations/world/${entry.fileName}`),
    ...inventory.wordAssetEntries.filter((entry) => entry.kind === "word" && entry.fileName)
      .map((entry) => `public/assets/illustrations/words/${entry.fileName}`),
  ]);
  const actualImageFiles = new Set([...inventory.existingFiles].filter((path) => path.startsWith("public/assets/illustrations/") && path.endsWith(".webp")));
  compareFiles(actualImageFiles, expectedImageFiles, "公開asset欠落", "未定義illustration asset", issues);

  const strokeByCharacter = new Map(inventory.strokeTemplates.map((entry) => [entry.character, entry]));
  reportDuplicates("書字template", inventory.strokeTemplates.map((entry) => entry.character), issues);
  for (const character of EXPECTED_WRITING_CHARACTERS) {
    const expectedFileName = `${character.codePointAt(0).toString(16).padStart(5, "0")}.json`;
    const template = strokeByCharacter.get(character);
    if (!template) issues.push(`書字template欠落: ${character}`);
    else if (template.fileName !== expectedFileName || !template.valid) issues.push(`書字template不正: ${character}:${template.fileName}`);
  }
  for (const entry of inventory.strokeTemplates) {
    if (!EXPECTED_WRITING_CHARACTERS.includes(entry.character)) issues.push(`書字template対象外: ${entry.character || entry.fileName}`);
  }
  if (inventory.strokeTemplates.length !== 66) issues.push(`書字template数不一致: ${inventory.strokeTemplates.length}/66`);

  const actualSfx = new Set([...inventory.existingFiles].filter((path) => path.startsWith("public/assets/sfx/")));
  compareFiles(actualSfx, new Set(EXPECTED_SFX_PATHS), "効果音欠落", "未定義効果音", issues);
  const actualIcons = new Set([...inventory.existingFiles].filter((path) => path.startsWith("public/icons/")));
  compareFiles(actualIcons, new Set(EXPECTED_ICON_PATHS), "PWA icon欠落", "未定義PWA icon", issues);

  for (const path of EXPECTED_LICENSE_PATHS) {
    if (!inventory.existingFiles.has(path) || !inventory.noticeContents[path]?.trim()) issues.push(`第三者license欠落: ${path}`);
  }
  const attribution = inventory.noticeContents["THIRD_PARTY_NOTICES.md"] ?? "";
  if (!attribution.includes("ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319")) issues.push("第三者帰属の固定source commit欠落: fude-kana-data");
  if (!attribution.includes("CC BY-SA 3.0")) issues.push("第三者license表記欠落: CC BY-SA 3.0");

  return issues;
}

/** CLIから完成教材を監査し、欠落keyを列挙して非0終了する。 */
export async function verifyContent(repositoryRoot = process.cwd()) {
  const inventory = await collectContentInventory(repositoryRoot);
  const issues = findContentIssues(inventory);
  if (issues.length > 0) {
    console.error(`Content verification failed (${issues.length}件):`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log("Content verification passed: 46 kana, 60 words, 66 stroke templates, 94 illustrations, 4 sounds, 3 icons, licenses.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await verifyContent();
