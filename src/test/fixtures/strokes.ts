import { loadStrokeTemplate, type StrokeTemplate, type WritingCharacter } from "../../features/writing/data/types";
import type { WritingStroke, WritingStrokes } from "../../features/writing/geometry";

/** 固定seedで0以上1未満の疑似乱数を返す。 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** 生成済みテンプレートをテスト用の入力stroke型へ写す。 */
export function templateFor(character: WritingCharacter): WritingStrokes {
  const template = loadStrokeTemplate(character);
  return template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y] as const));
}

/** 固定seedの小さな揺れを加えた、子どもの入力相当の点列を作る。 */
export function jitter(template: WritingStrokes, amount: number): WritingStrokes {
  const random = seededRandom(0x4f6a_3c12);
  return template.map((stroke) => stroke.map(([x, y]) => [
    x + ((random() * 2) - 1) * amount,
    y + ((random() * 2) - 1) * amount,
  ] as const));
}

/** すべてのstrokeを逆向きにし、決定的な距離を加える。 */
export function reverseAndShift(template: WritingStrokes, amount: number): WritingStrokes {
  return template.map((stroke) => [...stroke].reverse().map(([x, y]) => [x + amount, y + amount] as const));
}

/** テンプレート型を使うテスト向けの対応点列を返す。 */
export function strokesFromTemplate(template: StrokeTemplate): WritingStrokes {
  return template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y] as const));
}

/** 1筆だけで使うテスト入力型。 */
export function stroke(...points: readonly (readonly [number, number])[]): WritingStroke {
  return points.map(([x, y]) => [x, y] as const);
}
