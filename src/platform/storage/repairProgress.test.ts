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
      words: createInitialProgress().words,
      settings: { speech: false, music: true, effects: false, reducedMotion: true },
    });
  });

  it("旧schema v1保存にないlessonAttemptをnullへ後方互換で補正する", () => {
    const raw = resumableProgressAt("く", "traceNarrow") as Record<string, unknown>;
    delete raw.lessonAttempt;

    expect(repairProgress(raw).lessonAttempt).toBeNull();
  });

  it("既知60語だけを部分復旧し、段階が逆転した語を安全に正規化する", () => {
    const raw = {
      ...progressWithCompletedCount(46),
      words: {
        "w1-01": { selected: true, arranged: true, writingTried: true },
        "w1-02": { selected: false, arranged: true, writingTried: true },
        "w1-03": { selected: true, arranged: true, writingTried: true },
        unknown: { selected: true, arranged: true, writingTried: true },
      },
    };

    const repaired = repairProgress(raw);
    expect(repaired.words["w1-01"]).toEqual({ selected: true, arranged: true, writingTried: true });
    expect(repaired.words["w1-02"]).toEqual({ selected: false, arranged: false, writingTried: false });
    expect(repaired.words["w1-03"]).toEqual({ selected: false, arranged: false, writingTried: false });
    expect(repaired.words).not.toHaveProperty("unknown");
  });

  it("46文字未完了の旧保存では単語進捗を全初期化し、単語飛ばしを防ぐ", () => {
    const raw = {
      ...createInitialProgress(),
      words: { "w1-01": { selected: true, arranged: true, writingTried: true } },
    };

    expect(repairProgress(raw).words).toEqual(createInitialProgress().words);
  });

  it("現在の文字と選択段階に整合するlessonAttemptだけを保存する", () => {
    const raw = {
      ...resumableProgressAt("く", "shapeMatch"),
      lessonAttempt: { character: "く", stage: "shapeMatch", count: 2 },
    };

    expect(repairProgress(raw).lessonAttempt).toEqual({ character: "く", stage: "shapeMatch", count: 2 });
  });

  it("現在段階と矛盾するlessonAttemptは進行を壊さずnullへ補正する", () => {
    const raw = {
      ...resumableProgressAt("く", "soundMatch"),
      lessonAttempt: { character: "く", stage: "shapeMatch", count: 2 },
    };

    expect(repairProgress(raw).lessonAttempt).toBeNull();
  });

  it("旧版で一文字の音問題にいた保存進捗は太いなぞりへ移行する", () => {
    const repaired = repairProgress(resumableProgressAt("い", "soundMatch"));

    expect(repaired).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("い"),
      stage: "traceWide",
      rowReview: null,
    });
    expect(repaired.kana["い"].soundMatched).toBe(false);
  });

  it("行復習の音問題にいた保存進捗はそのまま保持する", () => {
    const raw = {
      ...resumableProgressAt("お", "soundMatch"),
      rowReview: { row: "a", step: "sound" } as const,
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("お"),
      stage: "soundMatch",
      rowReview: { row: "a", step: "sound" },
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

  it("未知単語を保存進捗へ残さず、既知60語と設定を部分復旧する", () => {
    const raw = {
      ...resumableProgressAt("く", "traceNarrow"),
      words: {
        neko: { selected: true, arranged: "invalid", writingTried: true },
        inu: { selected: "invalid", arranged: false, writingTried: false },
      },
      settings: { speech: false, music: "invalid", effects: false, reducedMotion: "invalid" },
    };

    expect(repairProgress(raw)).toMatchObject({
      words: createInitialProgress().words,
      settings: { speech: false, music: false, effects: false, reducedMotion: false },
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

  it.each([
    ["無効なindex", -1],
    ["最初の未完了文字より前のindex", 0],
  ])("先頭5文字完了時は%sでも最初の未完了文字かへ復旧する", (_description, currentKanaIndex) => {
    const raw = {
      ...progressWithCompletedCount(5),
      currentKanaIndex,
      stage: "traceNarrow" as const,
      rowReview: { row: "a", step: "shape" as const },
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("か"),
      stage: "intro",
      rowReview: null,
    });
  });

  it("最初の未完了文字にある正しい途中段階は保持する", () => {
    const raw = resumableProgressAt("く", "traceNarrow");

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

  it("最終文字が最初の未完了なら正しい最終行reviewを保持する", () => {
    const raw = {
      ...progressWithCompletedCount(45),
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

  it("全完了状態は最終文字の安全な報酬段階へ正規化する", () => {
    const raw = {
      ...progressWithCompletedCount(46),
      currentKanaIndex: 0,
      stage: "shapeMatch" as const,
      rowReview: { row: "a", step: "shape" as const },
    };

    expect(repairProgress(raw)).toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("ん"),
      stage: "reward",
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
