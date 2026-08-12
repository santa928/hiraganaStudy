import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../content/kana";
import { reduceLesson, createInitialProgress } from "./reducer";
import type { LearningProgress } from "./types";
import { isWordGardenUnlocked, selectRoute } from "./selectors";
import { progressAt, progressWithCompletedCount, stateAt } from "../../../test/fixtures/progress";

/** 読みの花まで到達した文字を、指定段階から再開するテスト状態を作る。 */
function readCompletedStateAt(
  character: Parameters<typeof stateAt>[0],
  stage: Parameters<typeof stateAt>[1],
) {
  const initial = stateAt(character, stage);
  return {
    ...initial,
    progress: {
      ...initial.progress,
      kana: {
        ...initial.progress.kana,
        [character]: { ...initial.progress.kana[character], readCompleted: true },
      },
    },
  };
}

describe("学習状態機械", () => {
  it("形合わせ正解で読みを達成し、書字より先に花へ進む", () => {
    const result = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: true });

    expect(result.stage).toBe("reward");
    expect(result.progress.kana["か"]).toMatchObject({ shapeMatched: true, readCompleted: true });
  });

  it("読みモードは花の後に書字を挟まず次の未読文字へ進む", () => {
    const initial = stateAt("あ", "reward");
    const state = {
      ...initial,
      progress: {
        ...initial.progress,
        kana: { ...initial.progress.kana, あ: { ...initial.progress.kana["あ"], readCompleted: true } },
      },
    };

    const result = reduceLesson(state, { type: "CONTINUE" });

    expect(result.currentKana).toBe("い");
    expect(result.stage).toBe("intro");
  });

  it("読み書きモードは花の後に最初の未完書字へ進む", () => {
    const initial = stateAt("あ", "reward");
    const state = {
      ...initial,
      progress: {
        ...initial.progress,
        settings: { ...initial.progress.settings, learningMode: "readingWriting" as const },
        kana: {
          ...initial.progress.kana,
          あ: { ...initial.progress.kana["あ"], readCompleted: true, traceWideTried: true },
        },
      },
    };

    const result = reduceLesson(state, { type: "CONTINUE" });

    expect(result.currentKana).toBe("あ");
    expect(result.stage).toBe("traceNarrow");
  });

  it.each(["traceWide", "traceNarrow", "copyWithModel", "freeWrite"] as const)(
    "%sからあとでを選ぶと書字実績を保って次の未読文字へ進む",
    (stage) => {
      const initial = stateAt("あ", stage);
      const state = {
        ...initial,
        progress: {
          ...initial.progress,
          settings: { ...initial.progress.settings, learningMode: "readingWriting" as const },
          kana: {
            ...initial.progress.kana,
            あ: { ...initial.progress.kana["あ"], readCompleted: true, traceWideTried: true },
          },
        },
      };

      const result = reduceLesson(state, { type: "DEFER_WRITING" });

      expect(result.currentKana).toBe("い");
      expect(result.stage).toBe("intro");
      expect(result.progress.kana["あ"].traceWideTried).toBe(true);
      expect(result.progress.kana["あ"].writingCompleted).toBe(false);
    },
  );

  it("4段階すべてを体験した時だけ書字完了として花へ戻る", () => {
    const initial = stateAt("あ", "freeWrite");
    const state = {
      ...initial,
      progress: {
        ...initial.progress,
        settings: { ...initial.progress.settings, learningMode: "readingWriting" as const },
        kana: {
          ...initial.progress.kana,
          あ: {
            ...initial.progress.kana["あ"],
            readCompleted: true,
            traceWideTried: true,
            traceNarrowTried: true,
            copyTried: true,
          },
        },
      },
    };

    const result = reduceLesson(state, { type: "COMPLETE_FREE_WRITE" });

    expect(result.stage).toBe("reward");
    expect(result.progress.kana["あ"]).toMatchObject({ freeWriteTried: true, writingCompleted: true });
  });

  it("前の書字段階が欠けた自由書字では鉛筆印を完了にしない", () => {
    const result = reduceLesson(readCompletedStateAt("あ", "freeWrite"), { type: "COMPLETE_FREE_WRITE" });

    expect(result.progress.kana["あ"].freeWriteTried).toBe(true);
    expect(result.progress.kana["あ"].writingCompleted).toBe(false);
  });

  it("書字中に読みモードへ変えると途中実績を保って次の読みへ進む", () => {
    const initial = stateAt("あ", "traceNarrow");
    const state = {
      ...initial,
      progress: {
        ...initial.progress,
        settings: { ...initial.progress.settings, learningMode: "readingWriting" as const },
        kana: {
          ...initial.progress.kana,
          あ: { ...initial.progress.kana["あ"], readCompleted: true, traceWideTried: true },
        },
      },
    };

    const result = reduceLesson(state, { type: "CHANGE_LEARNING_MODE", mode: "reading" });

    expect(result.progress.settings.learningMode).toBe("reading");
    expect(result.currentKana).toBe("い");
    expect(result.progress.kana["あ"].traceWideTried).toBe(true);
  });

  it("46文字未完了時と本線より先の単語イベントを無視する", () => {
    const initial = createInitialProgress();
    const state = { progress: initial, currentKana: "あ" as const, stage: "intro" as const };
    expect(reduceLesson(state, { type: "COMPLETE_WORD_SELECTION", wordId: "w1-01" })).toEqual(state);

    const completed = progressWithCompletedCount(46);
    const wordState = { progress: completed, currentKana: "ん" as const, stage: "reward" as const };
    expect(reduceLesson(wordState, { type: "COMPLETE_WORD_SELECTION", wordId: "w1-02" })).toEqual(wordState);
  });

  it("単語は並べ終えた時点で読みを達成し、書字前でも次語を解放する", () => {
    const completed = progressWithCompletedCount(46);
    const initial = { progress: completed, currentKana: "ん" as const, stage: "reward" as const };
    const selected = reduceLesson(initial, { type: "COMPLETE_WORD_SELECTION", wordId: "w1-01" });
    const arranged = reduceLesson(selected, { type: "COMPLETE_WORD_ARRANGE", wordId: "w1-01" });
    const nextSelected = reduceLesson(arranged, { type: "COMPLETE_WORD_SELECTION", wordId: "w1-02" });

    expect(arranged.progress.words["w1-01"]).toMatchObject({
      arranged: true,
      readCompleted: true,
      writingTried: false,
      writingCompleted: false,
    });
    expect(nextSelected.progress.words["w1-02"].selected).toBe(true);
  });

  it("読めた単語の書字だけを後から完了し、次の未読語を変えない", () => {
    const completed = progressWithCompletedCount(46);
    const progress: LearningProgress = {
      ...completed,
      words: {
        ...completed.words,
        "w1-01": {
          ...completed.words["w1-01"],
          selected: true,
          arranged: true,
          readCompleted: true,
        },
      },
    };
    const state = { progress, currentKana: "ん" as const, stage: "reward" as const };
    const written = reduceLesson(state, { type: "COMPLETE_WORD_WRITING", wordId: "w1-01" });

    expect(written.progress.words["w1-01"]).toMatchObject({ writingTried: true, writingCompleted: true });
    expect(written.progress.words["w1-02"]).toEqual(progress.words["w1-02"]);
    expect(reduceLesson(state, { type: "COMPLETE_WORD_WRITING", wordId: "w1-02" })).toEqual(state);
  });

  it("初期進捗はあの導入から始まり、全46文字を未体験として作る", () => {
    const progress = createInitialProgress();

    expect(progress.schemaVersion).toBe(2);
    expect(progress.settings.learningMode).toBe("reading");
    expect(progress.currentKanaIndex).toBe(0);
    expect(progress.stage).toBe("intro");
    expect(Object.keys(progress.kana)).toEqual(KANA_ORDER);
    expect(Object.values(progress.kana).every((kana) => (
      !(kana as unknown as Record<string, unknown>).readCompleted
      && !(kana as unknown as Record<string, unknown>).writingCompleted
    ))).toBe(true);
    expect(Object.values(progress.words).every((word) => (
      !(word as unknown as Record<string, unknown>).readCompleted
      && !(word as unknown as Record<string, unknown>).writingCompleted
    ))).toBe(true);
  });

  it("完成版のBGM初期設定はオフにする", () => {
    expect(createInitialProgress().settings.music).toBe(false);
  });

  it("STARTを省いた初回CONTINUEでも導入を既読にして形合わせへ進む", () => {
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });
    const continued = reduceLesson(started, { type: "CONTINUE" });
    const continuedDirectly = reduceLesson(stateAt("あ", "intro"), { type: "CONTINUE" });

    expect(started.stage).toBe("intro");
    expect(started.progress.kana["あ"].seen).toBe(true);
    expect(continued.stage).toBe("shapeMatch");
    expect(continuedDirectly.stage).toBe("shapeMatch");
    expect(continuedDirectly.progress.kana["あ"].seen).toBe(true);
  });

  it("正しい形合わせは形の体験を記録して音問題を挟まず読みの花へ進む", () => {
    const result = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: true });

    expect(result.stage).toBe("reward");
    expect(result.progress.kana["か"].shapeMatched).toBe(true);
    expect(result.progress.kana["か"].soundMatched).toBe(false);
  });

  it("形合わせの誤答は段階を保ち、3回目から正解案内を判定できる", () => {
    const first = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: false });
    const second = reduceLesson(first, { type: "ANSWER_SHAPE", correct: false });
    const third = reduceLesson(second, { type: "ANSWER_SHAPE", correct: false });

    expect(third.stage).toBe("shapeMatch");
    expect(third.progress.kana["か"].guideCount).toBe(3);
    expect(third.progress.kana["か"].guideCount >= 3).toBe(true);
  });

  it("形合わせの試行回数を保存・再開し、次の誤答で第2段階へ進める", () => {
    const first = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: false });
    const resumed = reduceLesson(stateAt("あ", "intro"), { type: "RESUME", progress: first.progress });
    const second = reduceLesson(resumed, { type: "ANSWER_SHAPE", correct: false });

    expect(first.progress.lessonAttempt).toEqual({ character: "か", stage: "shapeMatch", count: 1 });
    expect(second.progress.kana["か"].guideCount).toBe(2);
    expect(second.progress.lessonAttempt).toEqual({ character: "か", stage: "shapeMatch", count: 2 });
  });

  it("形合わせを完了すると試行回数を消して読みの花へ進む", () => {
    const first = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: false });
    const writing = reduceLesson(first, { type: "ANSWER_SHAPE", correct: true });

    expect(writing.stage).toBe("reward");
    expect(writing.progress.lessonAttempt).toBeNull();
  });

  it("旧版で一文字の音問題にいた進捗は太いなぞりへ復旧する", () => {
    const saved = progressAt("い", "soundMatch");
    const resumed = reduceLesson(stateAt("あ", "intro"), { type: "RESUME", progress: saved });

    expect(resumed.currentKana).toBe("い");
    expect(resumed.stage).toBe("traceWide");
    expect(resumed.progress.rowReview).toBeNull();
    expect(resumed.progress.kana["い"].soundMatched).toBe(false);
  });

  it("行復習の音を誤答しても段階を保ち、案内回数だけを増やす", () => {
    const review = reduceLesson(readCompletedStateAt("お", "reward"), { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const result = reduceLesson(sound, { type: "ANSWER_SOUND", correct: false });

    expect(result.stage).toBe("soundMatch");
    expect(result.progress.rowReview).toEqual({ row: "a", step: "sound" });
    expect(result.progress.kana["お"].guideCount).toBe(1);
  });

  it("太いなぞりは太いなぞりの段階でのみ完了を記録する", () => {
    const result = reduceLesson(stateAt("た", "traceWide"), { type: "COMPLETE_TRACE", width: "wide" });
    const ignored = reduceLesson(stateAt("た", "traceWide"), { type: "COMPLETE_TRACE", width: "narrow" });

    expect(result.stage).toBe("traceNarrow");
    expect(result.progress.kana["た"].traceWideTried).toBe(true);
    expect(ignored).toEqual(stateAt("た", "traceWide"));
  });

  it("細いなぞりは細いなぞりの段階でのみ完了を記録する", () => {
    const result = reduceLesson(stateAt("た", "traceNarrow"), { type: "COMPLETE_TRACE", width: "narrow" });
    const ignored = reduceLesson(stateAt("た", "traceNarrow"), { type: "COMPLETE_TRACE", width: "wide" });

    expect(result.stage).toBe("copyWithModel");
    expect(result.progress.kana["た"].traceNarrowTried).toBe(true);
    expect(ignored).toEqual(stateAt("た", "traceNarrow"));
  });

  it("見本書きを終えると自由書字へ進む", () => {
    const result = reduceLesson(stateAt("な", "copyWithModel"), { type: "COMPLETE_COPY" });

    expect(result.stage).toBe("freeWrite");
    expect(result.progress.kana["な"].copyTried).toBe(true);
  });

  it("自由書字は試行すると採点結果に関係なく報酬へ進む", () => {
    const result = reduceLesson(stateAt("は", "freeWrite"), { type: "COMPLETE_FREE_WRITE" });

    expect(result.stage).toBe("reward");
    expect(result.progress.kana["は"].freeWriteTried).toBe(true);
  });

  it("旧自由書字スキップもあとでとして次の読みへ進み、未体験を保持する", () => {
    const result = reduceLesson(readCompletedStateAt("は", "freeWrite"), { type: "SKIP_FREE_WRITE" });

    expect(result.currentKana).toBe("ひ");
    expect(result.stage).toBe("intro");
    expect(result.progress.kana["は"].freeWriteTried).toBe(false);
  });

  it("あの報酬完了後は必ずいへ進む", () => {
    const result = reduceLesson(readCompletedStateAt("あ", "reward"), { type: "CONTINUE" });

    expect(result.currentKana).toBe("い");
    expect(result.stage).toBe("intro");
    expect(result.progress.kana["あ"].readCompleted).toBe(true);
  });

  it.each([
    ["お", "a"], ["こ", "ka"], ["そ", "sa"], ["と", "ta"], ["の", "na"],
    ["ほ", "ha"], ["も", "ma"], ["よ", "ya"], ["ろ", "ra"], ["ん", "wa"],
  ] as const)("行末の%sは次の文字ではなく%s行の形復習へ進む", (character, row) => {
    const result = reduceLesson(readCompletedStateAt(character, "reward"), { type: "CONTINUE" });

    expect(result.currentKana).toBe(character);
    expect(result.stage).toBe("shapeMatch");
    expect(result.progress.rowReview).toEqual({ row, step: "shape" });
    expect(result.progress.kana[character].readCompleted).toBe(true);
    expect(selectRoute(result.progress)).toEqual({ kind: "rowReview", row });
  });

  it("行復習は形、音の順に終えた後だけ次の文字へ進む", () => {
    const review = reduceLesson(readCompletedStateAt("お", "reward"), { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const next = reduceLesson(sound, { type: "ANSWER_SOUND", correct: true });

    expect(sound.progress.rowReview).toEqual({ row: "a", step: "sound" });
    expect(review.progress.kana["お"].readCompleted).toBe(true);
    expect(sound.progress.kana["お"].readCompleted).toBe(true);
    expect(next.progress.rowReview).toBeNull();
    expect(next.currentKana).toBe("か");
    expect(next.stage).toBe("intro");
    expect(next.progress.kana["お"].readCompleted).toBe(true);
    expect(next.progress.kana["お"].soundMatched).toBe(true);
  });

  it("行復習の音を再生できない時は音達成を変えず次の文字へ進む", () => {
    const review = reduceLesson(readCompletedStateAt("お", "reward"), { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const next = reduceLesson(sound, { type: "SKIP_SOUND_MATCH" });

    expect(next.progress.rowReview).toBeNull();
    expect(next.currentKana).toBe("か");
    expect(next.stage).toBe("intro");
    expect(next.progress.kana["お"].readCompleted).toBe(true);
    expect(next.progress.kana["お"].soundMatched).toBe(sound.progress.kana["お"].soundMatched);
  });

  it("45文字完了では単語を解放しない", () => {
    expect(isWordGardenUnlocked(progressWithCompletedCount(45))).toBe(false);
    expect(isWordGardenUnlocked(progressWithCompletedCount(46))).toBe(true);
  });

  it("最終行の復習まで終えると46文字完了として単語の庭へ進む", () => {
    const beforeFinalKana = progressWithCompletedCount(45);
    const finalState = {
      progress: {
        ...beforeFinalKana,
        currentKanaIndex: 45,
        stage: "reward" as const,
        kana: {
          ...beforeFinalKana.kana,
          ん: { ...beforeFinalKana.kana["ん"], readCompleted: true },
        },
      },
      currentKana: "ん" as const,
      stage: "reward" as const,
    };
    const review = reduceLesson(finalState, { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const completed = reduceLesson(sound, { type: "ANSWER_SOUND", correct: true });

    expect(review.progress.kana["ん"].readCompleted).toBe(true);
    expect(sound.progress.kana["ん"].readCompleted).toBe(true);
    expect(isWordGardenUnlocked(review.progress)).toBe(true);
    expect(isWordGardenUnlocked(sound.progress)).toBe(true);
    expect(completed.progress.kana["ん"].readCompleted).toBe(true);
    expect(selectRoute(review.progress)).toEqual({ kind: "rowReview", row: "wa" });
    expect(selectRoute(sound.progress)).toEqual({ kind: "rowReview", row: "wa" });
    expect(selectRoute(completed.progress)).toEqual({ kind: "wordGarden" });
  });

  it("RESUMEは保存進捗の文字indexと段階から一貫した状態を復元する", () => {
    const saved = progressAt("く", "traceNarrow");
    const result = reduceLesson(stateAt("あ", "intro"), { type: "RESUME", progress: saved });

    expect(result.currentKana).toBe("く");
    expect(result.stage).toBe("traceNarrow");
    expect(result.progress).toEqual(saved);
  });

  it.each([
    ["shape復習とsoundMatchの不一致", { ...progressAt("お", "soundMatch"), rowReview: { row: "a", step: "shape" } }],
    ["sound復習とshapeMatchの不一致", { ...progressAt("お", "shapeMatch"), rowReview: { row: "a", step: "sound" } }],
    ["現在文字と異なる行名", { ...progressAt("お", "shapeMatch"), rowReview: { row: "ka", step: "shape" } }],
    ["非行末文字の行復習", { ...progressAt("あ", "shapeMatch"), rowReview: { row: "a", step: "shape" } }],
  ] as const)("RESUMEは%sを初期進捗へフォールバックする", (_description, invalidProgress) => {
    const result = reduceLesson(
      stateAt("あ", "intro"),
      { type: "RESUME", progress: invalidProgress as unknown as ReturnType<typeof createInitialProgress> },
    );

    expect(result).toEqual({
      progress: createInitialProgress(),
      currentKana: "あ",
      stage: "intro",
    });
  });

  it("RESUMEは現在の行末文字と段階に整合する行復習を保持する", () => {
    const saved = {
      ...progressAt("お", "shapeMatch"),
      rowReview: { row: "a", step: "shape" } as const,
    };
    const result = reduceLesson(stateAt("あ", "intro"), { type: "RESUME", progress: saved });

    expect(result.currentKana).toBe("お");
    expect(result.stage).toBe("shapeMatch");
    expect(result.progress).toEqual(saved);
  });

  it.each([
    ["非整数の文字index", { ...progressAt("く", "traceNarrow"), currentKanaIndex: 7.5 }],
    ["範囲外の文字index", { ...progressAt("く", "traceNarrow"), currentKanaIndex: 46 }],
    ["不完全なkana record", { ...progressAt("く", "traceNarrow"), kana: { あ: progressAt("く", "traceNarrow").kana["あ"] } }],
  ])("RESUMEは%sを初期進捗へ安全にフォールバックする", (_description, invalidProgress) => {
    const result = reduceLesson(
      stateAt("あ", "intro"),
      { type: "RESUME", progress: invalidProgress as unknown as ReturnType<typeof createInitialProgress> },
    );

    expect(result).toEqual({
      progress: createInitialProgress(),
      currentKana: "あ",
      stage: "intro",
    });
  });

  it.each([
    ["nullのkana進捗", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, kana: { ...progress.kana, く: null } })],
    ["不正な段階", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, stage: "invalid-stage" })],
    ["不正な行復習", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, rowReview: { row: "invalid-row", step: "shape" } })],
    ["不正なschema version", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, schemaVersion: 3 })],
    ["booleanではない文字進捗", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, kana: { ...progress.kana, く: { ...progress.kana["く"], seen: "true" } } })],
    ["負の案内回数", (progress: ReturnType<typeof createInitialProgress>) => ({ ...progress, kana: { ...progress.kana, く: { ...progress.kana["く"], guideCount: -1 } } })],
  ] as const)("RESUMEは%sを初期進捗へフォールバックする", (_description, createInvalidProgress) => {
    const invalidProgress = createInvalidProgress(progressAt("く", "traceNarrow"));
    const result = reduceLesson(
      stateAt("あ", "intro"),
      { type: "RESUME", progress: invalidProgress as unknown as ReturnType<typeof createInitialProgress> },
    );

    expect(result).toEqual({
      progress: createInitialProgress(),
      currentKana: "あ",
      stage: "intro",
    });
  });

  it("状態と保存進捗を変更せずに新しい状態を返す", () => {
    const state = stateAt("さ", "shapeMatch");
    const snapshot = structuredClone(state);

    const result = reduceLesson(state, { type: "ANSWER_SHAPE", correct: false });

    expect(state).toEqual(snapshot);
    expect(result).not.toBe(state);
    expect(result.progress).not.toBe(state.progress);
    expect(result.progress.kana).not.toBe(state.progress.kana);
  });

  it("初期進捗からあの文字レッスンを返し、開始後も同じrouteを保つ", () => {
    const initial = createInitialProgress();
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });

    expect(selectRoute(initial)).toEqual({ kind: "kanaLesson", character: "あ" });
    expect(selectRoute(started.progress)).toEqual({ kind: "kanaLesson", character: "あ" });
  });

  it("あを終えて未体験のいへ進むと次の文字レッスンを返す", () => {
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });
    const reward = {
      ...started,
      progress: { ...started.progress, stage: "reward" as const },
      stage: "reward" as const,
    };
    const next = reduceLesson(reward, { type: "CONTINUE" });

    expect(next.currentKana).toBe("い");
    expect(selectRoute(next.progress)).toEqual({ kind: "kanaLesson", character: "い" });
  });

  it("途中再開で現在文字を見た履歴があれば文字レッスンを返す", () => {
    const resumed = reduceLesson(stateAt("く", "intro"), { type: "START" });

    expect(selectRoute(resumed.progress)).toEqual({ kind: "kanaLesson", character: "く" });
  });
});
