import { KANA_ORDER } from "../../learning/content/kana";
import type { KanaCharacter } from "../../learning/content/types";

/** 単語コースの書字で追加で使用する濁音・半濁音・促音・拗音。 */
export const ADVANCED_WRITING_CHARACTERS = [
  "が", "ぎ", "ご", "ざ", "ぞ", "だ", "で", "ど", "ば", "ぶ",
  "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぽ", "っ", "ゃ", "ゅ", "ょ",
] as const;

/** 書字テンプレートを持つ基本46文字と単語用20文字の固定集合。 */
export const WRITING_CHARACTERS = [
  ...KANA_ORDER,
  ...ADVANCED_WRITING_CHARACTERS,
] as const;

/** 生成済みの書字テンプレートを取得できる文字。 */
export type WritingCharacter = KanaCharacter | (typeof ADVANCED_WRITING_CHARACTERS)[number];

/** 正規化済みstroke点の二次元座標。 */
export type StrokePoint = readonly [number, number];

/** 上流データから保持するstrokeの主方向。 */
export interface StrokeDirection {
  readonly dx: number;
  readonly dy: number;
  readonly angle: number | null;
}

/** ひと筆分の正規化済み書字ガイド。 */
export interface StrokeTemplateStroke {
  readonly points: readonly StrokePoint[];
  readonly direction: StrokeDirection;
  readonly isCurl: boolean;
}

/** 一文字の順序付き書字ガイド。 */
export interface StrokeTemplate {
  readonly character: WritingCharacter;
  readonly strokes: readonly StrokeTemplateStroke[];
}

const generatedTemplates = import.meta.glob("./generated/*.json", {
  eager: true,
  import: "default",
}) as Readonly<Record<string, unknown>>;

/** unknown値がオブジェクトかを検査する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 生成JSONの有限な正規化座標を検査して、凍結可能な点として返す。 */
function parsePoint(value: unknown, character: WritingCharacter, strokeIndex: number, pointIndex: number): StrokePoint {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
    throw new Error(`Stroke template ${character} stroke ${strokeIndex} point ${pointIndex} is invalid`);
  }
  const [x, y] = value;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error(`Stroke template ${character} stroke ${strokeIndex} point ${pointIndex} is outside 0..1`);
  }

  return Object.freeze([x, y]) as StrokePoint;
}

/** 生成JSONのdirectionを検査して、凍結済み方向として返す。 */
function parseDirection(value: unknown, character: WritingCharacter, strokeIndex: number): StrokeDirection {
  if (!isRecord(value) || typeof value.dx !== "number" || typeof value.dy !== "number"
    || !Number.isFinite(value.dx) || !Number.isFinite(value.dy)
    || (value.angle !== null && (typeof value.angle !== "number" || !Number.isFinite(value.angle)))) {
    throw new Error(`Stroke template ${character} stroke ${strokeIndex} direction is invalid`);
  }

  return Object.freeze({ dx: value.dx, dy: value.dy, angle: value.angle });
}

/** 生成JSONを厳密に検査し、深く凍結された利用用テンプレートへ変換する。 */
function parseTemplate(value: unknown, expectedCharacter: WritingCharacter): StrokeTemplate {
  if (!isRecord(value) || value.character !== expectedCharacter || !Array.isArray(value.strokes) || value.strokes.length === 0) {
    throw new Error(`Stroke template is missing or mismatched for ${expectedCharacter}`);
  }

  const strokes = value.strokes.map((rawStroke, strokeIndex): StrokeTemplateStroke => {
    if (!isRecord(rawStroke) || !Array.isArray(rawStroke.points) || rawStroke.points.length !== 48 || typeof rawStroke.isCurl !== "boolean") {
      throw new Error(`Stroke template ${expectedCharacter} stroke ${strokeIndex} is invalid`);
    }

    return Object.freeze({
      points: Object.freeze(rawStroke.points.map((point, pointIndex) => parsePoint(point, expectedCharacter, strokeIndex, pointIndex))),
      direction: parseDirection(rawStroke.direction, expectedCharacter, strokeIndex),
      isCurl: rawStroke.isCurl,
    });
  });

  return Object.freeze({ character: expectedCharacter, strokes: Object.freeze(strokes) });
}

/** 指定文字に対応する生成ファイルの静的importパスを返す。 */
function generatedPath(character: WritingCharacter): string {
  const codepoint = character.codePointAt(0);
  if (codepoint === undefined) {
    throw new Error(`Stroke template character has no codepoint: ${character}`);
  }

  return `./generated/${codepoint.toString(16).padStart(5, "0")}.json`;
}

const templatesByCharacter: ReadonlyMap<WritingCharacter, StrokeTemplate> = new Map(
  WRITING_CHARACTERS.map((character) => {
    const path = generatedPath(character);
    const value = generatedTemplates[path];
    if (value === undefined) {
      throw new Error(`Generated stroke template file is missing: ${path}`);
    }

    return [character, parseTemplate(value, character)] as const;
  }),
);

/**
 * 同じ凍結済み参照を返す。実行時に生成データが欠損・不一致なら明示的に失敗する。
 * @throws 対応する生成JSONがない、または内容が不正な場合に例外を投げる。
 */
export function loadStrokeTemplate(character: WritingCharacter): StrokeTemplate {
  const template = templatesByCharacter.get(character);
  if (!template) {
    throw new Error(`Stroke template is missing for ${character}`);
  }

  return template;
}
