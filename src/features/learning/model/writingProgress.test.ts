import { describe, expect, it } from "vitest";

import { createInitialProgress } from "./reducer";
import {
  firstIncompleteWritingStage,
  isWritingStage,
  mergeKanaWritingPractice,
  selectKanaReviewStage,
} from "./writingProgress";

describe("書字進捗helper", () => {
  it.each([
    ["intro", false],
    ["shapeMatch", false],
    ["traceWide", true],
    ["traceNarrow", true],
    ["copyWithModel", true],
    ["freeWrite", true],
    ["reward", false],
  ] as const)("%sの書字段階判定は%s", (stage, expected) => {
    expect(isWritingStage(stage)).toBe(expected);
  });

  it("最初に未体験の書字段階を固定順で返す", () => {
    const initial = createInitialProgress().kana["あ"];

    expect(firstIncompleteWritingStage(initial)).toBe("traceWide");
    expect(firstIncompleteWritingStage({ ...initial, traceWideTried: true })).toBe("traceNarrow");
    expect(firstIncompleteWritingStage({ ...initial, traceWideTried: true, traceNarrowTried: true })).toBe("copyWithModel");
    expect(firstIncompleteWritingStage({
      ...initial,
      traceWideTried: true,
      traceNarrowTried: true,
      copyTried: true,
    })).toBe("freeWrite");
    expect(firstIncompleteWritingStage({
      ...initial,
      traceWideTried: true,
      traceNarrowTried: true,
      copyTried: true,
      freeWriteTried: true,
    })).toBeNull();
  });

  it("読み書きモードの未完花だけを最初の未完書字から復習する", () => {
    const initial = createInitialProgress();
    const writingMode = {
      ...initial,
      settings: { ...initial.settings, learningMode: "readingWriting" as const },
      kana: {
        ...initial.kana,
        あ: {
          ...initial.kana["あ"],
          readCompleted: true,
          traceWideTried: true,
        },
      },
    };

    expect(selectKanaReviewStage(writingMode, "あ")).toBe("traceNarrow");
    expect(selectKanaReviewStage(initial, "あ")).toBe("intro");
    expect(selectKanaReviewStage({
      ...writingMode,
      kana: { ...writingMode.kana, あ: { ...writingMode.kana["あ"], writingCompleted: true } },
    }, "あ")).toBe("intro");
  });

  it("復習書字は対象文字の書字実績だけを本線へマージする", () => {
    const initial = createInitialProgress();
    const main = {
      ...initial,
      currentKanaIndex: 4,
      stage: "shapeMatch" as const,
      rowReview: { row: "a" as const, step: "shape" as const },
      kana: { ...initial.kana, あ: { ...initial.kana["あ"], readCompleted: true } },
    };
    const reviewed = {
      ...main.kana["あ"],
      readCompleted: false,
      traceWideTried: true,
      traceNarrowTried: true,
      copyTried: true,
      freeWriteTried: true,
      writingCompleted: true,
      guideCount: 99,
    };

    const merged = mergeKanaWritingPractice(main, "あ", reviewed);

    expect(merged).toMatchObject({
      currentKanaIndex: 4,
      stage: "shapeMatch",
      rowReview: { row: "a", step: "shape" },
    });
    expect(merged.kana["あ"]).toEqual({
      ...main.kana["あ"],
      traceWideTried: true,
      traceNarrowTried: true,
      copyTried: true,
      freeWriteTried: true,
      writingCompleted: true,
    });
    expect(merged.kana["あ"].readCompleted).toBe(true);
    expect(merged.kana["あ"].guideCount).toBe(0);
    expect(main.kana["あ"].traceWideTried).toBe(false);
  });

  it("復習側が古くても本線で体験済みの書字段階を未完へ戻さない", () => {
    const initial = createInitialProgress();
    const main = {
      ...initial,
      kana: {
        ...initial.kana,
        あ: { ...initial.kana["あ"], readCompleted: true, traceWideTried: true },
      },
    };
    const reviewed = { ...initial.kana["あ"], traceNarrowTried: true };

    const merged = mergeKanaWritingPractice(main, "あ", reviewed);

    expect(merged.kana["あ"].traceWideTried).toBe(true);
    expect(merged.kana["あ"].traceNarrowTried).toBe(true);
  });
});
