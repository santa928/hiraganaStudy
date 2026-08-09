import type { StrokeTemplate } from "./data/types";
import { clamp, normalizeWriting, resample, type WritingPoint, type WritingStrokes } from "./geometry";

/** 子どもへ合否を示さず、次回の道幅を決めるためだけの補助段階。 */
export type WritingGuide = "strongGuide" | "gentleGuide" | "independent";

/** 緩やかな経路比較で得る、すべて0..1の内部判定値。 */
export interface WritingScore {
  readonly strokeCountMatch: boolean;
  readonly pathSimilarity: number;
  readonly directionSimilarity: number;
  readonly guide: WritingGuide;
}

const SAMPLE_COUNT = 32;

/**
 * 経路・方向・stroke数から、子どもへ表示しない次回補助段階を決める。
 *
 * 値は安全に0..1へ収める。境界は仕様どおり、path 0.68以上かつdirection
 * 0.55以上でindependent、どちらかが0.42未満またはstroke数不一致でstrongGuide。
 */
export function selectWritingGuide(pathSimilarity: number, directionSimilarity: number, strokeCountMatch: boolean): WritingGuide {
  const path = clamp(pathSimilarity);
  const direction = clamp(directionSimilarity);
  if (!strokeCountMatch || path < 0.42 || direction < 0.42) return "strongGuide";
  if (path >= 0.68 && direction >= 0.55) return "independent";
  return "gentleGuide";
}

/** 二点間のユークリッド距離を有限値として返す。 */
function distance([firstX, firstY]: WritingPoint, [secondX, secondY]: WritingPoint): number {
  return Math.hypot(firstX - secondX, firstY - secondY);
}

/** 端点の進行方向を0..1の内積類似度へ変換する。 */
function directionSimilarity(points: readonly WritingPoint[]): number {
  if (points.length < 2) return 0;
  const [startX, startY] = points[0];
  const [endX, endY] = points.at(-1)!;
  const length = Math.hypot(endX - startX, endY - startY);
  if (length <= Number.EPSILON || !Number.isFinite(length)) return 0;
  return Math.atan2(endY - startY, endX - startX);
}

/** 二つのstrokeの端点方向をdot productで比較する。 */
function compareDirection(input: readonly WritingPoint[], reference: readonly WritingPoint[]): number {
  const inputAngle = directionSimilarity(input);
  const referenceAngle = directionSimilarity(reference);
  if ((input.length < 2) || (reference.length < 2)) return 0;
  const inputLength = distance(input[0], input.at(-1)!);
  const referenceLength = distance(reference[0], reference.at(-1)!);
  if (inputLength <= Number.EPSILON || referenceLength <= Number.EPSILON) return 0;
  return clamp((Math.cos(inputAngle - referenceAngle) + 1) / 2);
}

/** 点対応・開始点・終点を混ぜた経路類似度を返す。 */
function comparePath(input: readonly WritingPoint[], reference: readonly WritingPoint[]): number {
  if (input.length === 0 || reference.length === 0) return 0;
  const count = Math.min(input.length, reference.length);
  let total = 0;
  for (let index = 0; index < count; index += 1) total += distance(input[index], reference[index]);
  const correspondence = total / count;
  const endpoints = (distance(input[0], reference[0]) + distance(input.at(-1)!, reference.at(-1)!)) / 2;
  return clamp(1 - ((correspondence * 0.7 + endpoints * 0.3) / 0.55));
}

/** テンプレートの点列を入力と同じ読み取り専用stroke形式に変換する。 */
function templateStrokes(template: StrokeTemplate): WritingStrokes {
  return template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y] as const));
}

/**
 * 入力筆跡と既知の文字テンプレートを緩やかに比較し、補助段階を返す。
 *
 * これは採点表示や進行停止に使わない。入力・テンプレートの移動と等方scaleを除き、
 * 対応する32点、端点、方向、stroke数を有限な値だけで比較する。
 */
export function scoreWriting(input: WritingStrokes, template: StrokeTemplate): WritingScore {
  const normalizedInput = normalizeWriting(input);
  const normalizedTemplate = normalizeWriting(templateStrokes(template));
  const strokeCountMatch = normalizedInput.length === normalizedTemplate.length
    && normalizedInput.every((stroke) => stroke.length >= 2);
  const pairedCount = Math.min(normalizedInput.length, normalizedTemplate.length);
  if (pairedCount === 0) {
    return { strokeCountMatch: false, pathSimilarity: 0, directionSimilarity: 0, guide: "strongGuide" };
  }

  let paths = 0;
  let directions = 0;
  for (let index = 0; index < pairedCount; index += 1) {
    const inputStroke = resample(normalizedInput[index], SAMPLE_COUNT);
    const templateStroke = resample(normalizedTemplate[index], SAMPLE_COUNT);
    paths += comparePath(inputStroke, templateStroke);
    directions += compareDirection(inputStroke, templateStroke);
  }

  const pathSimilarity = clamp(paths / pairedCount);
  const direction = clamp(directions / pairedCount);
  const guide = selectWritingGuide(pathSimilarity, direction, strokeCountMatch);

  return {
    strokeCountMatch,
    pathSimilarity,
    directionSimilarity: direction,
    guide,
  };
}
