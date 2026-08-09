import { KANA_ORDER } from "../content/kana";
import type { KanaCharacter, KanaEntry } from "../content/types";
import type {
  KanaProgress,
  LessonAttempt,
  LearningProgress,
  LearningState,
  LessonEvent,
  LessonStage,
} from "./types";

const ROW_ENDINGS = new Set<KanaCharacter>(["お", "こ", "そ", "と", "の", "ほ", "も", "よ", "ろ", "ん"]);
const LESSON_STAGES = new Set<LessonStage>([
  "intro", "shapeMatch", "soundMatch", "traceWide", "traceNarrow", "copyWithModel", "freeWrite", "reward",
]);
const KANA_ROWS = new Set<KanaEntry["row"]>(["a", "ka", "sa", "ta", "na", "ha", "ma", "ya", "ra", "wa"]);
const KANA_PROGRESS_BOOLEAN_FIELDS = [
  "seen",
  "shapeMatched",
  "soundMatched",
  "traceWideTried",
  "traceNarrowTried",
  "copyTried",
  "freeWriteTried",
  "completedOnce",
] as const;

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
    lessonAttempt: null,
    kana: Object.fromEntries(
      KANA_ORDER.map((character) => [character, createInitialKanaProgress()]),
    ) as Record<KanaCharacter, KanaProgress>,
    words: {},
    settings: {
      speech: true,
      music: false,
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

/** 型境界を越えて渡った再開進捗が現在文字を安全に復元できるかを検査する。 */
function isResumableProgress(progress: unknown): progress is LearningProgress {
  if (typeof progress !== "object" || progress === null) return false;

  const candidate = progress as {
    readonly schemaVersion?: unknown;
    readonly currentKanaIndex?: unknown;
    readonly stage?: unknown;
    readonly rowReview?: unknown;
    readonly kana?: unknown;
  };
  const currentKanaIndex = candidate.currentKanaIndex;
  const stage = candidate.stage;
  const kana = candidate.kana;

  if (
    candidate.schemaVersion !== 1
    || typeof currentKanaIndex !== "number"
    || !Number.isInteger(currentKanaIndex)
    || currentKanaIndex < 0
    || currentKanaIndex >= KANA_ORDER.length
    || typeof stage !== "string"
    || !LESSON_STAGES.has(stage as LessonStage)
    || typeof kana !== "object"
    || kana === null
  ) {
    return false;
  }

  const currentKana = KANA_ORDER[currentKanaIndex];

  if (!currentKana || !isValidRowReview(candidate.rowReview, currentKana, stage as LessonStage)) return false;

  const kanaRecord = kana as Record<string, unknown>;

  return KANA_ORDER.every((character) => (
    Object.hasOwn(kanaRecord, character) && isValidKanaProgress(kanaRecord[character])
  ));
}

/** 行復習が未実施か、現在の行末文字・行・段階に整合するかを検査する。 */
function isValidRowReview(rowReview: unknown, currentKana: KanaCharacter, stage: LessonStage): boolean {
  if (rowReview === null) return true;
  if (typeof rowReview !== "object") return false;

  const candidate = rowReview as { readonly row?: unknown; readonly step?: unknown };

  return (
    typeof candidate.row === "string"
    && KANA_ROWS.has(candidate.row as KanaEntry["row"])
    && ROW_ENDINGS.has(currentKana)
    && candidate.row === getKanaRow(currentKana)
    && ((candidate.step === "shape" && stage === "shapeMatch") || (candidate.step === "sound" && stage === "soundMatch"))
  );
}

/** 1文字の再開進捗が状態機械の直接参照に耐える最小完全形かを検査する。 */
function isValidKanaProgress(progress: unknown): progress is KanaProgress {
  if (typeof progress !== "object" || progress === null) return false;

  const candidate = progress as Record<string, unknown>;

  return (
    KANA_PROGRESS_BOOLEAN_FIELDS.every((field) => typeof candidate[field] === "boolean")
    && typeof candidate.guideCount === "number"
    && Number.isFinite(candidate.guideCount)
    && Number.isInteger(candidate.guideCount)
    && candidate.guideCount >= 0
  );
}

/** 現在文字・現在段階と一致する選択問題の案内段階だけを保存する。 */
function normalizeLessonAttempt(progress: LearningProgress): LessonAttempt | null {
  const attempt = progress.lessonAttempt;
  const currentKana = KANA_ORDER[progress.currentKanaIndex];

  if (
    !attempt
    || !currentKana
    || attempt.character !== currentKana
    || attempt.stage !== progress.stage
    || (attempt.stage !== "shapeMatch" && attempt.stage !== "soundMatch")
    || !Number.isSafeInteger(attempt.count)
    || attempt.count < 0
  ) {
    return null;
  }

  return attempt;
}

/** 段階遷移・文字遷移で古い選択問題の案内段階を消す。 */
function withNormalizedLessonAttempt(progress: LearningProgress): LearningProgress {
  return { ...progress, lessonAttempt: normalizeLessonAttempt(progress) };
}

/** 誤答と同時に、現在の選択問題だけの案内段階を一つ進める。 */
function recordWrongAnswer(state: LearningState, stage: LessonAttempt["stage"]): LearningState {
  const currentAttempt = state.progress.lessonAttempt;
  const count = currentAttempt?.character === state.currentKana && currentAttempt.stage === stage
    ? currentAttempt.count + 1
    : 1;

  return updateCurrentKana(
    state,
    (current) => ({ ...current, guideCount: current.guideCount + 1 }),
    { lessonAttempt: { character: state.currentKana, stage, count } },
  );
}

/** 現在文字の進捗だけを不変に更新する。 */
function updateCurrentKana(
  state: LearningState,
  update: (current: KanaProgress) => KanaProgress,
  updates: Partial<Pick<LearningProgress, "currentKanaIndex" | "stage" | "rowReview" | "lessonAttempt">> = {},
): LearningState {
  const progress: LearningProgress = {
    ...state.progress,
    ...updates,
    kana: {
      ...state.progress.kana,
      [state.currentKana]: update(state.progress.kana[state.currentKana]),
    },
  };

  return stateFromProgress(withNormalizedLessonAttempt(progress));
}

/** 現在文字を変えず、段階または行復習だけを不変に更新する。 */
function updateProgress(
  state: LearningState,
  updates: Partial<Pick<LearningProgress, "currentKanaIndex" | "stage" | "rowReview" | "lessonAttempt">>,
): LearningState {
  return stateFromProgress(withNormalizedLessonAttempt({ ...state.progress, ...updates }));
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

/** 非行末は報酬で確定し、行末は確定を保留して復習を始める。 */
function continueAfterReward(state: LearningState): LearningState {
  if (ROW_ENDINGS.has(state.currentKana)) {
    return updateProgress(state, {
      rowReview: { row: getKanaRow(state.currentKana), step: "shape" },
      stage: "shapeMatch",
    });
  }

  const completed = updateCurrentKana(state, (current) => ({ ...current, completedOnce: true }));

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
    return stateFromProgress(isResumableProgress(event.progress)
      ? withNormalizedLessonAttempt(event.progress)
      : createInitialProgress());
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
      return recordWrongAnswer(state, "shapeMatch");
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
      return recordWrongAnswer(state, "soundMatch");
    }

    if (state.progress.rowReview?.step === "sound") {
      return advanceAfterRowReview(updateCurrentKana(state, (current) => ({ ...current, completedOnce: true })));
    }

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
