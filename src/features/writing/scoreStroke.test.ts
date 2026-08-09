import { describe, expect, it } from "vitest";

import { jitter, reverseAndShift, templateFor } from "../../test/fixtures/strokes";
import { scoreWriting, selectWritingGuide } from "./scoreStroke";
import { loadStrokeTemplate } from "./data/types";

describe("緩やかな書字判定", () => {
  it("参照線を少し揺らした3歳児相当の点列を否定しない", () => {
    const score = scoreWriting(jitter(templateFor("あ"), 0.035), loadStrokeTemplate("あ"));
    expect(score.guide).not.toBe("strongGuide");
  });

  it("逆方向かつ遠い線では補助を強める", () => {
    const score = scoreWriting(reverseAndShift(templateFor("あ"), 0.4), loadStrokeTemplate("あ"));
    expect(score.guide).toBe("strongGuide");
  });

  it("移動・等方scale・端末座標の差を正規化して同程度に扱う", () => {
    const input = templateFor("あ").map((stroke) => stroke.map(([x, y]) => [x * 280 + 160, y * 280 + 80] as const));
    const score = scoreWriting(input, loadStrokeTemplate("あ"));

    expect(score.guide).toBe("independent");
  });

  it("欠落・余分strokeと短いtapを強い補助へ導く", () => {
    const reference = templateFor("あ");
    expect(scoreWriting(reference.slice(0, -1), loadStrokeTemplate("あ")).guide).toBe("strongGuide");
    expect(scoreWriting([...reference, [[0.2, 0.2]]], loadStrokeTemplate("あ")).guide).toBe("strongGuide");
    expect(scoreWriting([[[0.5, 0.5]]], loadStrokeTemplate("あ")).guide).toBe("strongGuide");
  });

  it("大きなjitterで補助を強め、すべての出力を有限な0..1へ収める", () => {
    const score = scoreWriting(jitter(templateFor("あ"), 1.2), loadStrokeTemplate("あ"));

    expect(score.guide).toBe("strongGuide");
    expect(score.strokeCountMatch).toBe(true);
    for (const value of [score.pathSimilarity, score.directionSimilarity]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("閾値どおりに補助段階を切り替える", () => {
    expect(selectWritingGuide(0.6799, 1, true)).toBe("gentleGuide");
    expect(selectWritingGuide(0.68, 0.55, true)).toBe("independent");
    expect(selectWritingGuide(0.6801, 0.5501, true)).toBe("independent");
    expect(selectWritingGuide(0.42, 0.55, true)).toBe("gentleGuide");
    expect(selectWritingGuide(0.4199, 1, true)).toBe("strongGuide");
    expect(selectWritingGuide(1, 0.4199, true)).toBe("strongGuide");
    expect(selectWritingGuide(1, 1, false)).toBe("strongGuide");
    expect(scoreWriting(templateFor("あ"), loadStrokeTemplate("あ")).guide).toBe("independent");
  });
});
