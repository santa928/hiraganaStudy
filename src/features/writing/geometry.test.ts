import { describe, expect, it } from "vitest";

import { normalizeWriting, resample, type WritingStrokes } from "./geometry";

describe("書字の幾何", () => {
  it("弧長に沿って端点を保ったまま再サンプリングする", () => {
    const points = [[0, 0], [0, 2], [6, 2]] as const;

    const sampled = resample(points, 4);
    expect(sampled[0]).toEqual([0, 0]);
    expect(sampled.at(-1)).toEqual([6, 2]);
    expect(sampled[1][0]).toBeCloseTo(2 / 3);
    expect(sampled[1][1]).toBeCloseTo(2);
    expect(sampled[2][0]).toBeCloseTo(10 / 3);
    expect(sampled[2][1]).toBeCloseTo(2);
  });

  it("空・1点・重複点・0長・非有限入力を決定的に安全処理する", () => {
    expect(resample([], 4)).toEqual([]);
    expect(resample([[3, 4]], 4)).toEqual([[3, 4], [3, 4], [3, 4], [3, 4]]);
    expect(resample([[1, 1], [1, 1], [1, 1]], 3)).toEqual([[1, 1], [1, 1], [1, 1]]);
    expect(resample([[Number.NaN, 1], [2, Number.POSITIVE_INFINITY]], 3)).toEqual([]);
    expect(() => resample([[0, 0], [1, 1]], 1)).toThrow("count");
  });

  it("全stroke共通の等方scaleと中央paddingで正規化し、入力を変更しない", () => {
    const input: WritingStrokes = [[[10, 20], [50, 20]], [[10, 40], [50, 40]]];
    const copy = structuredClone(input);

    expect(normalizeWriting(input)).toEqual([
      [[0, 0.25], [1, 0.25]],
      [[0, 0.75], [1, 0.75]],
    ]);
    expect(input).toEqual(copy);
  });

  it("空入力・片軸0・全体0を有限な0..1座標へ正規化する", () => {
    const normalized = normalizeWriting([[], [[2, 8], [2, 12]], [[5, 5], [5, 5]]]);

    expect(normalizeWriting([])).toEqual([]);
    for (const stroke of normalized) {
      for (const [x, y] of stroke) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });
});
