import { describe, expect, it } from "vitest";

import { KANA_ORDER } from "../content/kana";
import { reduceLesson, createInitialProgress } from "./reducer";
import { isWordGardenUnlocked, selectRoute } from "./selectors";
import { progressAt, progressWithCompletedCount, stateAt } from "../../../test/fixtures/progress";

describe("学習状態機械", () => {
  it("初期進捗はあの導入から始まり、全46文字を未体験として作る", () => {
    const progress = createInitialProgress();

    expect(progress.currentKanaIndex).toBe(0);
    expect(progress.stage).toBe("intro");
    expect(Object.keys(progress.kana)).toEqual(KANA_ORDER);
    expect(Object.values(progress.kana).every((kana) => !kana.completedOnce)).toBe(true);
  });

  it("STARTで導入を既読にし、CONTINUEで形合わせへ進む", () => {
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });
    const continued = reduceLesson(started, { type: "CONTINUE" });

    expect(started.stage).toBe("intro");
    expect(started.progress.kana["あ"].seen).toBe(true);
    expect(continued.stage).toBe("shapeMatch");
  });

  it("正しい形合わせは形の体験を記録して音合わせへ進む", () => {
    const result = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: true });

    expect(result.stage).toBe("soundMatch");
    expect(result.progress.kana["か"].shapeMatched).toBe(true);
  });

  it("形合わせの誤答は段階を保ち、3回目から正解案内を判定できる", () => {
    const first = reduceLesson(stateAt("か", "shapeMatch"), { type: "ANSWER_SHAPE", correct: false });
    const second = reduceLesson(first, { type: "ANSWER_SHAPE", correct: false });
    const third = reduceLesson(second, { type: "ANSWER_SHAPE", correct: false });

    expect(third.stage).toBe("shapeMatch");
    expect(third.progress.kana["か"].guideCount).toBe(3);
    expect(third.progress.kana["か"].guideCount >= 3).toBe(true);
  });

  it("正しい音合わせは音の体験を記録して太いなぞりへ進む", () => {
    const result = reduceLesson(stateAt("さ", "soundMatch"), { type: "ANSWER_SOUND", correct: true });

    expect(result.stage).toBe("traceWide");
    expect(result.progress.kana["さ"].soundMatched).toBe(true);
  });

  it("音合わせの誤答は段階を保ち、案内回数だけを増やす", () => {
    const result = reduceLesson(stateAt("さ", "soundMatch"), { type: "ANSWER_SOUND", correct: false });

    expect(result.stage).toBe("soundMatch");
    expect(result.progress.kana["さ"].guideCount).toBe(1);
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

  it("自由書字はスキップでも報酬へ進み、未体験を保持する", () => {
    const result = reduceLesson(stateAt("は", "freeWrite"), { type: "SKIP_FREE_WRITE" });

    expect(result.stage).toBe("reward");
    expect(result.progress.kana["は"].freeWriteTried).toBe(false);
  });

  it("あの報酬完了後は必ずいへ進む", () => {
    const result = reduceLesson(stateAt("あ", "reward"), { type: "CONTINUE" });

    expect(result.currentKana).toBe("い");
    expect(result.stage).toBe("intro");
    expect(result.progress.kana["あ"].completedOnce).toBe(true);
  });

  it.each([
    ["お", "a"], ["こ", "ka"], ["そ", "sa"], ["と", "ta"], ["の", "na"],
    ["ほ", "ha"], ["も", "ma"], ["よ", "ya"], ["ろ", "ra"], ["ん", "wa"],
  ] as const)("行末の%sは次の文字ではなく%s行の形復習へ進む", (character, row) => {
    const result = reduceLesson(stateAt(character, "reward"), { type: "CONTINUE" });

    expect(result.currentKana).toBe(character);
    expect(result.stage).toBe("shapeMatch");
    expect(result.progress.rowReview).toEqual({ row, step: "shape" });
    expect(selectRoute(result.progress)).toEqual({ kind: "rowReview", row });
  });

  it("行復習は形、音の順に終えた後だけ次の文字へ進む", () => {
    const review = reduceLesson(stateAt("お", "reward"), { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const next = reduceLesson(sound, { type: "ANSWER_SOUND", correct: true });

    expect(sound.progress.rowReview).toEqual({ row: "a", step: "sound" });
    expect(next.progress.rowReview).toBeNull();
    expect(next.currentKana).toBe("か");
    expect(next.stage).toBe("intro");
  });

  it("45文字完了では単語を解放しない", () => {
    expect(isWordGardenUnlocked(progressWithCompletedCount(45))).toBe(false);
    expect(isWordGardenUnlocked(progressWithCompletedCount(46))).toBe(true);
  });

  it("最終行の復習まで終えると46文字完了として単語の庭へ進む", () => {
    const beforeFinalKana = progressWithCompletedCount(45);
    const finalState = {
      progress: { ...beforeFinalKana, currentKanaIndex: 45, stage: "reward" as const },
      currentKana: "ん" as const,
      stage: "reward" as const,
    };
    const review = reduceLesson(finalState, { type: "CONTINUE" });
    const sound = reduceLesson(review, { type: "ANSWER_SHAPE", correct: true });
    const completed = reduceLesson(sound, { type: "ANSWER_SOUND", correct: true });

    expect(completed.progress.kana["ん"].completedOnce).toBe(true);
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

  it("状態と保存進捗を変更せずに新しい状態を返す", () => {
    const state = stateAt("さ", "shapeMatch");
    const snapshot = structuredClone(state);

    const result = reduceLesson(state, { type: "ANSWER_SHAPE", correct: false });

    expect(state).toEqual(snapshot);
    expect(result).not.toBe(state);
    expect(result.progress).not.toBe(state.progress);
    expect(result.progress.kana).not.toBe(state.progress.kana);
  });

  it("初期進捗は音声確認ルートを返し、開始後は文字レッスンを返す", () => {
    const initial = createInitialProgress();
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });

    expect(selectRoute(initial)).toEqual({ kind: "soundGate" });
    expect(selectRoute(started.progress)).toEqual({ kind: "kanaLesson", character: "あ" });
  });

  it("あを終えて未体験のいへ進むと庭へ戻る", () => {
    const started = reduceLesson(stateAt("あ", "intro"), { type: "START" });
    const reward = {
      ...started,
      progress: { ...started.progress, stage: "reward" as const },
      stage: "reward" as const,
    };
    const next = reduceLesson(reward, { type: "CONTINUE" });

    expect(next.currentKana).toBe("い");
    expect(selectRoute(next.progress)).toEqual({ kind: "garden" });
  });

  it("途中再開で現在文字を見た履歴があれば文字レッスンを返す", () => {
    const resumed = reduceLesson(stateAt("く", "intro"), { type: "START" });

    expect(selectRoute(resumed.progress)).toEqual({ kind: "kanaLesson", character: "く" });
  });
});
