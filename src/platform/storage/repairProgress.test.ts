import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../../features/learning/content/kana";
import { createInitialProgress } from "../../features/learning/model/reducer";
import { progressAt, progressWithCompletedCount } from "../../test/fixtures/progress";
import { repairProgress } from "./repairProgress";

/** 五十音順に先行文字を完了した、実際に再開可能な進捗を作る。 */
function resumableProgressAt(character: (typeof KANA_ORDER)[number], stage: ReturnType<typeof progressAt>["stage"]) {
  return {
    ...progressWithCompletedCount(KANA_ORDER.indexOf(character)),
    currentKanaIndex: KANA_ORDER.indexOf(character),
    stage,
  };
}

describe("repairProgress", () => {
  it("正常な保存進捗を復元し、保存用に知らないフィールドと単語を除く", () => {
    const raw = {
      ...resumableProgressAt("く", "traceNarrow"),
      words: { neko: { selected: true, arranged: false, writingTried: true } },
      settings: { speech: false, music: true, effects: false, reducedMotion: true },
      name: "たろう",
      strokeHistory: [[{ x: 1, y: 2 }]],
    };

    expect(repairProgress(raw)).toEqual({
      ...resumableProgressAt("く", "traceNarrow"),
      words: {},
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

  it("単語カタログ未導入時は任意キーを保存進捗へ残さず、設定だけを部分復旧する", () => {
    const raw = {
      ...resumableProgressAt("く", "traceNarrow"),
      words: {
        neko: { selected: true, arranged: "invalid", writingTried: true },
        inu: { selected: "invalid", arranged: false, writingTried: false },
      },
      settings: { speech: false, music: "invalid", effects: false, reducedMotion: "invalid" },
    };

    expect(repairProgress(raw)).toMatchObject({
      words: {},
      settings: { speech: false, music: true, effects: false, reducedMotion: false },
    });
  });

  it("未知のスキーマは新規進捗へ安全に戻す", () => {
    const unknownSchema = { ...progressAt("く", "traceNarrow"), schemaVersion: 2 };

    expect(repairProgress(unknownSchema)).toEqual(createInitialProgress());
  });

  it("現在位置と行復習の意味的に不整合な値だけを安全な値へ戻す", () => {
    const raw = {
      ...resumableProgressAt("く", "traceNarrow"),
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      rowReview: { row: "a", step: "shape" },
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
      rowReview: null,
    });
  });

  it("途中の壊れた文字を初期化したときは、最初の未完了文字から安全に再開する", () => {
    const raw = structuredClone(progressWithCompletedCount(46)) as {
      currentKanaIndex: number;
      stage: string;
      rowReview: unknown;
      kana: Record<string, unknown>;
    };
    raw.currentKanaIndex = KANA_ORDER.indexOf("ん");
    raw.stage = "reward";
    raw.rowReview = { row: "wa", step: "shape" };
    raw.kana["く"] = { ...(raw.kana["く"] as object), completedOnce: "invalid" };

    const repaired = repairProgress(raw);

    expect(repaired.currentKanaIndex).toBe(KANA_ORDER.indexOf("く"));
    expect(repaired.stage).toBe("intro");
    expect(repaired.rowReview).toBeNull();
    expect(repaired.kana["ん"].completedOnce).toBe(true);
  });

  it("全完了済みの正しい行復習は現在位置とともに保持する", () => {
    const raw = {
      ...progressWithCompletedCount(46),
      currentKanaIndex: KANA_ORDER.indexOf("ん"),
      stage: "shapeMatch" as const,
      rowReview: { row: "wa", step: "shape" as const },
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("ん"),
      stage: "shapeMatch",
      rowReview: { row: "wa", step: "shape" },
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
