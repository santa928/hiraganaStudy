import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../../features/learning/content/kana";
import { createInitialProgress } from "../../features/learning/model/reducer";
import { progressAt } from "../../test/fixtures/progress";
import { repairProgress } from "./repairProgress";

describe("repairProgress", () => {
  it("正常な保存進捗を復元し、保存用に知らないフィールドを除く", () => {
    const raw = {
      ...progressAt("く", "traceNarrow"),
      words: { neko: { selected: true, arranged: false, writingTried: true } },
      settings: { speech: false, music: true, effects: false, reducedMotion: true },
      name: "たろう",
      strokeHistory: [[{ x: 1, y: 2 }]],
    };

    expect(repairProgress(raw)).toEqual({
      ...progressAt("く", "traceNarrow"),
      words: { neko: { selected: true, arranged: false, writingTried: true } },
      settings: { speech: false, music: true, effects: false, reducedMotion: true },
    });
  });

  it("壊れた文字だけを初期化し、正常な文字進捗は保持する", () => {
    const raw = structuredClone(progressAt("く", "traceNarrow")) as {
      kana: Record<string, unknown>;
    };
    raw.kana["あ"] = { ...(raw.kana["あ"] as object), seen: true, guideCount: 3 };
    raw.kana["く"] = { ...(raw.kana["く"] as object), traceNarrowTried: "yes" };

    const repaired = repairProgress(raw);

    expect(repaired.kana["あ"]).toEqual({
      seen: true,
      shapeMatched: false,
      soundMatched: false,
      traceWideTried: false,
      traceNarrowTried: false,
      copyTried: false,
      freeWriteTried: false,
      completedOnce: false,
      guideCount: 3,
    });
    expect(repaired.kana["く"]).toEqual(createInitialProgress().kana["く"]);
  });

  it("個別の単語と設定の壊れた値だけを初期値へ戻す", () => {
    const raw = {
      ...progressAt("く", "traceNarrow"),
      words: {
        neko: { selected: true, arranged: "invalid", writingTried: true },
        inu: { selected: "invalid", arranged: false, writingTried: false },
      },
      settings: { speech: false, music: "invalid", effects: false, reducedMotion: "invalid" },
    };

    expect(repairProgress(raw)).toMatchObject({
      words: {
        neko: { selected: true, arranged: false, writingTried: true },
        inu: { selected: false, arranged: false, writingTried: false },
      },
      settings: { speech: false, music: true, effects: false, reducedMotion: false },
    });
  });

  it("未知のスキーマは新規進捗へ安全に戻す", () => {
    const unknownSchema = { ...progressAt("く", "traceNarrow"), schemaVersion: 2 };

    expect(repairProgress(unknownSchema)).toEqual(createInitialProgress());
  });

  it("現在位置と行復習の意味的に不整合な値だけを安全な値へ戻す", () => {
    const raw = {
      ...progressAt("く", "traceNarrow"),
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      rowReview: { row: "a", step: "shape" },
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
      rowReview: null,
    });
  });

  it("入力を変更しない", () => {
    const raw = structuredClone(progressAt("く", "traceNarrow")) as {
      kana: Record<string, unknown>;
    };
    raw.kana["く"] = { ...(raw.kana["く"] as object), seen: "invalid" };
    const snapshot = structuredClone(raw);

    repairProgress(raw);

    expect(raw).toEqual(snapshot);
  });
});
