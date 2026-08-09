import { KANA_ORDER } from "../content/kana";
import type { KanaCharacter, KanaEntry } from "../content/types";
import type {
  KanaProgress,
  LearningProgress,
  LearningState,
  LessonEvent,
} from "./types";

const ROW_ENDINGS = new Set<KanaCharacter>(["お", "こ", "そ", "と", "の", "ほ", "も", "よ", "ろ", "ん"]);

/** 新しい文字の、未体験状態を作る。 */
function createInitialKanaProgress(): KanaProgress {
  return {
    seen: false,
    shapeMatched: false,
    soundMatched: false,
    traceWideTried: false,
    traceNarrowTried: false,
    copyTried: false,
    freeWriteTried: false,
    completedOnce: false,
    guideCount: 0,
  };
}

/** 46文字すべてが未体験の初期保存進捗を作る。 */
export function createInitialProgress(): LearningProgress {
  return {
    schemaVersion: 1,
    currentKanaIndex: 0,
    stage: "intro",
    rowReview: null,
    kana: Object.fromEntries(
      KANA_ORDER.map((character) => [character, createInitialKanaProgress()]),
    ) as Record<KanaCharacter, KanaProgress>,
    words: {},
    settings: {
      speech: true,
      music: true,
      effects: true,
      reducedMotion: false,
    },
  };
}

/** 保存進捗から、描画に必要な現在文字を一貫して組み立てる。 */
function stateFromProgress(progress: LearningProgress): LearningState {
  return {
    progress,
    currentKana: KANA_ORDER[progress.currentKanaIndex] ?? KANA_ORDER[0],
    stage: progress.stage,
  };
}

/** 現在文字の進捗だけを不変に更新する。 */
function updateCurrentKana(
  state: LearningState,
  update: (current: KanaProgress) => KanaProgress,
  updates: Partial<Pick<LearningProgress, "currentKanaIndex" | "stage" | "rowReview">> = {},
): LearningState {
  const progress: LearningProgress = {
    ...state.progress,
    ...updates,
    kana: {
      ...state.progress.kana,
      [state.currentKana]: update(state.progress.kana[state.currentKana]),
    },
  };

  return stateFromProgress(progress);
}

/** 現在文字を変えず、段階または行復習だけを不変に更新する。 */
function updateProgress(
  state: LearningState,
  updates: Partial<Pick<LearningProgress, "currentKanaIndex" | "stage" | "rowReview">>,
): LearningState {
  return stateFromProgress({ ...state.progress, ...updates });
}

/** 行末の復習完了後、次の文字または単語コースへ進める。 */
function advanceAfterRowReview(state: LearningState): LearningState {
  const nextKanaIndex = state.progress.currentKanaIndex + 1;

  if (nextKanaIndex >= KANA_ORDER.length) {
    return updateProgress(state, { rowReview: null, stage: "reward" });
  }

  return updateProgress(state, {
    currentKanaIndex: nextKanaIndex,
    rowReview: null,
    stage: "intro",
  });
}

/** 報酬を確定し、行末なら復習、その他は次の文字へ進める。 */
function continueAfterReward(state: LearningState): LearningState {
  const completed = updateCurrentKana(state, (current) => ({ ...current, completedOnce: true }));

  if (ROW_ENDINGS.has(completed.currentKana)) {
    return updateProgress(completed, {
      rowReview: { row: completed.progress.rowReview?.row ?? getKanaRow(completed.currentKana), step: "shape" },
      stage: "shapeMatch",
    });
  }

  return advanceAfterRowReview(completed);
}

/** 対象文字に対応する五十音行を、コンテンツ順から返す。 */
function getKanaRow(character: KanaCharacter): KanaEntry["row"] {
  const index = KANA_ORDER.indexOf(character);

  if (index <= 4) return "a";
  if (index <= 9) return "ka";
  if (index <= 14) return "sa";
  if (index <= 19) return "ta";
  if (index <= 24) return "na";
  if (index <= 29) return "ha";
  if (index <= 34) return "ma";
  if (index <= 37) return "ya";
  if (index <= 42) return "ra";
  return "wa";
}

/** 学習イベントを処理し、入力を変更せず次の状態を返す。 */
export function reduceLesson(state: LearningState, event: LessonEvent): LearningState {
  if (event.type === "RESUME") {
    return stateFromProgress(event.progress);
  }

  if (event.type === "START" && state.stage === "intro") {
    return updateCurrentKana(state, (current) => ({ ...current, seen: true }));
  }

  if (event.type === "CONTINUE") {
    if (state.stage === "intro") return updateProgress(state, { stage: "shapeMatch" });
    if (state.stage === "reward") return continueAfterReward(state);
    return state;
  }

  if (event.type === "ANSWER_SHAPE" && state.stage === "shapeMatch") {
    if (!event.correct) {
      return updateCurrentKana(state, (current) => ({ ...current, guideCount: current.guideCount + 1 }));
    }

    if (state.progress.rowReview?.step === "shape") {
      return updateProgress(state, {
        rowReview: { ...state.progress.rowReview, step: "sound" },
        stage: "soundMatch",
      });
    }

    return updateCurrentKana(state, (current) => ({ ...current, shapeMatched: true }), { stage: "soundMatch" });
  }

  if (event.type === "ANSWER_SOUND" && state.stage === "soundMatch") {
    if (!event.correct) {
      return updateCurrentKana(state, (current) => ({ ...current, guideCount: current.guideCount + 1 }));
    }

    if (state.progress.rowReview?.step === "sound") return advanceAfterRowReview(state);

    return updateCurrentKana(state, (current) => ({ ...current, soundMatched: true }), { stage: "traceWide" });
  }

  if (event.type === "COMPLETE_TRACE") {
    if (event.width === "wide" && state.stage === "traceWide") {
      return updateCurrentKana(state, (current) => ({ ...current, traceWideTried: true }), { stage: "traceNarrow" });
    }
    if (event.width === "narrow" && state.stage === "traceNarrow") {
      return updateCurrentKana(state, (current) => ({ ...current, traceNarrowTried: true }), { stage: "copyWithModel" });
    }
    return state;
  }

  if (event.type === "COMPLETE_COPY" && state.stage === "copyWithModel") {
    return updateCurrentKana(state, (current) => ({ ...current, copyTried: true }), { stage: "freeWrite" });
  }

  if (event.type === "COMPLETE_FREE_WRITE" && state.stage === "freeWrite") {
    return updateCurrentKana(state, (current) => ({ ...current, freeWriteTried: true }), { stage: "reward" });
  }

  if (event.type === "SKIP_FREE_WRITE" && state.stage === "freeWrite") {
    return updateProgress(state, { stage: "reward" });
  }

  return state;
}
