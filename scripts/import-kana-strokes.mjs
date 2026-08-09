/* global console, fetch, process */

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 固定した上流データセットの識別子。branchやlatestには絶対にフォールバックしない。 */
const SOURCE = Object.freeze({
  owner: "karimghezali",
  repo: "fude-kana-data",
  commit: "ab69a27e2f5a5125ac89b5f13a1b0f0e318d5319",
  license: "CC BY-SA 3.0",
});

/** 基本文字の五十音順。TypeScriptの教材定義と同じ固定集合をスクリプト単体でも検査する。 */
const BASIC_WRITING_CHARACTERS = Object.freeze([
  "あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り",
  "る", "れ", "ろ", "わ", "を", "ん",
]);
const BASIC_WRITING_SEQUENCE = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";

/** 単語教材の濁音・半濁音・促音・拗音で使用する追加文字。 */
const ADVANCED_WRITING_CHARACTERS = Object.freeze([
  "が", "ぎ", "ご", "ざ", "ぞ", "だ", "で", "ど", "ば", "ぶ",
  "べ", "ぼ", "ぱ", "ぴ", "ぷ", "っ", "ゃ", "ゅ", "ょ",
]);

const WRITING_CHARACTERS = Object.freeze([
  ...BASIC_WRITING_CHARACTERS,
  ...ADVANCED_WRITING_CHARACTERS,
]);
const SAMPLE_COUNT = 48;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const OUTPUT_DIRECTORY = join(PROJECT_DIRECTORY, "src/features/writing/data/generated");
const LICENSE_DIRECTORY = join(PROJECT_DIRECTORY, "public/licenses/fude-kana-data");
const RAW_BASE_URL = `https://raw.githubusercontent.com/${SOURCE.owner}/${SOURCE.repo}/${SOURCE.commit}`;
const CODEPOINT_JSON = /^[0-9a-f]{5}\.json$/;

/** sourceファイル名に使う、単一文字の5桁小文字Unicode codepointを返す。 */
function codepointFilename(character) {
  const codepoint = character.codePointAt(0);
  if (Array.from(character).length !== 1 || codepoint === undefined) {
    throw new Error(`A single Unicode character is required: ${JSON.stringify(character)}`);
  }

  return `${codepoint.toString(16).padStart(5, "0")}.json`;
}

/** raw GitHubの固定commit URLだけを組み立て、HTTP失敗を明示的に拒否する。 */
async function fetchFixedSource(path) {
  const response = await fetch(`${RAW_BASE_URL}/${path}`);
  if (!response.ok) {
    throw new Error(`Unable to retrieve fixed source ${path}: HTTP ${response.status}`);
  }

  return response;
}

/** JSON値がオブジェクトかを検査する。 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 有限数を取り出し、不正値を生成前に拒否する。 */
function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

/** 上流が閉ループで明示するnull角度、または有限な方向角を取り出す。 */
function finiteNumberOrNull(value, label) {
  if (value === null) {
    return null;
  }

  return finiteNumber(value, label);
}

/** sourceの1ストロークを有限の二次元点列・方向・curl情報として厳密に検査する。 */
function parseSourceStroke(value, character, strokeIndex) {
  if (!isRecord(value) || !Array.isArray(value.points) || !isRecord(value.direction)) {
    throw new Error(`${character} stroke ${strokeIndex} has an invalid shape`);
  }
  if (value.points.length < 2) {
    throw new Error(`${character} stroke ${strokeIndex} needs at least two points`);
  }
  if (typeof value.isCurl !== "boolean") {
    throw new Error(`${character} stroke ${strokeIndex} isCurl must be boolean`);
  }

  const points = value.points.map((point, pointIndex) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`${character} stroke ${strokeIndex} point ${pointIndex} must be a pair`);
    }
    return [
      finiteNumber(point[0], `${character} stroke ${strokeIndex} point ${pointIndex} x`),
      finiteNumber(point[1], `${character} stroke ${strokeIndex} point ${pointIndex} y`),
    ];
  });

  return {
    points,
    direction: {
      dx: finiteNumber(value.direction.dx, `${character} stroke ${strokeIndex} direction dx`),
      dy: finiteNumber(value.direction.dy, `${character} stroke ${strokeIndex} direction dy`),
      angle: finiteNumberOrNull(value.direction.angle, `${character} stroke ${strokeIndex} direction angle`),
    },
    isCurl: value.isCurl,
  };
}

/** source文字JSONの文字・codepoint・stroke数・順序付きstrokeを厳密に検査する。 */
function parseSourceTemplate(value, character) {
  if (!isRecord(value) || value.character !== character || !Array.isArray(value.strokes)) {
    throw new Error(`${character} source template has an invalid shape or mismatched character`);
  }
  const expectedCodepoint = `U+${character.codePointAt(0).toString(16).toUpperCase()}`;
  if (value.codepoint !== expectedCodepoint) {
    throw new Error(`${character} source codepoint mismatch: expected ${expectedCodepoint}`);
  }
  if (!Number.isInteger(value.strokeCount) || value.strokeCount <= 0 || value.strokeCount !== value.strokes.length) {
    throw new Error(`${character} source stroke count is invalid`);
  }

  return value.strokes.map((stroke, index) => parseSourceStroke(stroke, character, index));
}

/** 弧長に沿って点列を指定個数へ再サンプリングし、零長strokeを明示的に拒否する。 */
function resampleByArcLength(points, count) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const [previousX, previousY] = points[index - 1];
    const [currentX, currentY] = points[index];
    distances.push(distances[index - 1] + Math.hypot(currentX - previousX, currentY - previousY));
  }
  const totalLength = distances.at(-1);
  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    throw new Error("Stroke cannot be resampled because its arc length is zero or invalid");
  }

  const resampled = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const target = (totalLength * index) / (count - 1);
    while (segment < distances.length - 1 && distances[segment] < target) {
      segment += 1;
    }
    const startDistance = distances[segment - 1];
    const endDistance = distances[segment];
    const span = endDistance - startDistance;
    if (!Number.isFinite(span) || span < 0) {
      throw new Error("Stroke has an invalid cumulative arc length");
    }
    const ratio = span === 0 ? 0 : (target - startDistance) / span;
    const [startX, startY] = points[segment - 1];
    const [endX, endY] = points[segment];
    resampled.push([startX + ((endX - startX) * ratio), startY + ((endY - startY) * ratio)]);
  }

  return resampled;
}

/** 文字内の全strokeを等方スケールで正規化し、短辺を中央paddingして縦横比を保持する。 */
function normalizeTemplateStrokes(strokes, character) {
  const sampledStrokes = strokes.map((stroke) => ({
    ...stroke,
    points: resampleByArcLength(stroke.points, SAMPLE_COUNT),
  }));
  const allPoints = sampledStrokes.flatMap((stroke) => stroke.points);
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const longestSide = Math.max(width, height);
  if (![minX, maxX, minY, maxY, width, height, longestSide].every(Number.isFinite) || longestSide <= 0) {
    throw new Error(`${character} cannot be normalised because its template bounds are degenerate`);
  }
  const scale = 1 / longestSide;
  const xOffset = (1 - (width * scale)) / 2;
  const yOffset = (1 - (height * scale)) / 2;

  return sampledStrokes.map((stroke) => ({
    points: stroke.points.map(([x, y]) => [
      roundNormalized(((x - minX) * scale) + xOffset, character),
      roundNormalized(((y - minY) * scale) + yOffset, character),
    ]),
    direction: stroke.direction,
    isCurl: stroke.isCurl,
  }));
}

/** 丸め後にも単位正方形内であることを保証する。 */
function roundNormalized(value, character) {
  if (!Number.isFinite(value) || value < -Number.EPSILON || value > 1 + Number.EPSILON) {
    throw new Error(`${character} normalised coordinate is outside 0..1`);
  }
  const rounded = Number(Math.min(1, Math.max(0, value)).toFixed(4));
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > 1) {
    throw new Error(`${character} rounded coordinate is outside 0..1`);
  }

  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 一つの文字のsource JSONを固定URLから取得し、生成形式へ変換する。 */
async function importTemplate(character) {
  const filename = codepointFilename(character);
  const response = await fetchFixedSource(`kana-data/${filename}`);
  let raw;
  try {
    raw = JSON.parse(await response.text());
  } catch (error) {
    throw new Error(
      `${character} source JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return {
    character,
    strokes: normalizeTemplateStrokes(parseSourceTemplate(raw, character), character),
  };
}

/** 対象外の生成済みcodepoint JSONだけを列挙して削除し、他ファイルには触れない。 */
async function removeStaleGeneratedFiles(expectedFilenames) {
  const expected = new Set(expectedFilenames);
  const files = await readdir(OUTPUT_DIRECTORY, { withFileTypes: true });
  await Promise.all(files
    .filter((entry) => entry.isFile() && CODEPOINT_JSON.test(entry.name) && !expected.has(entry.name))
    .map((entry) => rm(join(OUTPUT_DIRECTORY, entry.name))));
}

/** 取得元とこのプロジェクトでの変換内容をCC BY-SA条件とともに明示するNOTICE本文。 */
function projectNotice() {
  return [
    "fude-kana-data attribution and statement of changes",
    "===============================================",
    "",
    "Source data",
    "-----------",
    "Repository: karimghezali/fude-kana-data",
    `Fixed commit: ${SOURCE.commit}`,
    `Source URL: ${RAW_BASE_URL}/kana-data/`,
    "Original work: KanjiVG by Ulrich Apel",
    "KanjiVG source: https://kanjivg.tagaini.net/",
    "Licence: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)",
    "Licence URL: https://creativecommons.org/licenses/by-sa/3.0/",
    "",
    "Changes in this project",
    "-----------------------",
    "- Extracted the 46 basic hiragana and 19 additional word-writing characters.",
    "- Resampled every ordered stroke to exactly 48 points by arc length.",
    "- Normalised each character template with a shared scale, centred short-side padding, and a 0..1 coordinate system.",
    "- Rounded generated point coordinates to four decimal places.",
    "- Preserved character identity, stroke order, direction, and isCurl values, including null angle values.",
    "",
    "Distribution",
    "------------",
    "The generated stroke data in src/features/writing/data/generated is a derivative work",
    "and is distributed under CC BY-SA 3.0.",
    "",
  ].join("\n");
}

/** リポジトリ全体の第三者通知に入れる、生成データの帰属本文。 */
function thirdPartyNotice() {
  return [
    "# Third-party notices",
    "",
    "## fude-kana-data stroke templates",
    "",
    `The generated files in \`src/features/writing/data/generated\` are derived from [fude-kana-data](https://github.com/karimghezali/fude-kana-data) by karimghezali, fixed at commit [${SOURCE.commit}](https://github.com/karimghezali/fude-kana-data/commit/${SOURCE.commit}). fude-kana-data is itself derived from [KanjiVG](https://kanjivg.tagaini.net/) by Ulrich Apel.`,
    "",
    `Source retrieval URL: ${RAW_BASE_URL}/kana-data/<codepoint>.json`,
    "",
    "This project extracted 46 basic hiragana and 19 additional word-writing characters, resampled every ordered stroke to 48 points by arc length, normalised each character template with a shared scale and centred short-side padding into a 0..1 coordinate system, and rounded generated point coordinates to four decimal places. Character identity, stroke order, direction, and `isCurl` are preserved, including source `direction.angle: null` values for closed loops.",
    "",
    "The generated stroke data is distributed under [Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/). The upstream LICENSE and this project's attribution notice are available at `public/licenses/fude-kana-data/`.",
    "",
  ].join("\n");
}

/** 固定sourceを取得・検査・変換し、データとライセンス通知を決定的に書き出す。 */
async function main() {
  if (BASIC_WRITING_CHARACTERS.length !== 46 || BASIC_WRITING_CHARACTERS.join("") !== BASIC_WRITING_SEQUENCE) {
    throw new Error("Basic writing characters must match the fixed 46-character gojuon order");
  }
  if (WRITING_CHARACTERS.length !== 65 || new Set(WRITING_CHARACTERS).size !== 65) {
    throw new Error("Writing character set must contain exactly 65 unique characters");
  }
  const filenames = WRITING_CHARACTERS.map(codepointFilename);
  if (new Set(filenames).size !== filenames.length) {
    throw new Error("Writing character codepoint filenames must be unique");
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await mkdir(LICENSE_DIRECTORY, { recursive: true });
  const [templates, licenseResponse] = await Promise.all([
    Promise.all(WRITING_CHARACTERS.map(importTemplate)),
    fetchFixedSource("LICENSE"),
  ]);
  const license = await licenseResponse.text();
  if (license.length === 0) {
    throw new Error("Fixed source LICENSE is empty");
  }

  await removeStaleGeneratedFiles(filenames);
  await Promise.all(templates.map((template) => writeFile(
    join(OUTPUT_DIRECTORY, codepointFilename(template.character)),
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  )));
  await writeFile(join(LICENSE_DIRECTORY, "LICENSE"), license, "utf8");
  await writeFile(join(LICENSE_DIRECTORY, "NOTICE"), projectNotice(), "utf8");
  await writeFile(join(PROJECT_DIRECTORY, "THIRD_PARTY_NOTICES.md"), thirdPartyNotice(), "utf8");

  console.log(`Imported ${templates.length} stroke templates from ${SOURCE.owner}/${SOURCE.repo}@${SOURCE.commit}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
