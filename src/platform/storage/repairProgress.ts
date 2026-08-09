import { KANA_ENTRIES, KANA_ORDER } from "../../features/learning/content/kana";
import type { KanaCharacter } from "../../features/learning/content/types";
import { createInitialProgress } from "../../features/learning/model/reducer";
import type {
  KanaProgress,
  LessonAttempt,
  LearningProgress,
  LearningSettings,
  LessonStage,
  RowReviewProgress,
} from "../../features/learning/model/types";

const LESSON_STAGES = new Set<LessonStage>([
  "intro", "shapeMatch", "soundMatch", "traceWide", "traceNarrow", "copyWithModel", "freeWrite", "reward",
]);
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

/** 保存データの型境界で、配列を除くオブジェクトかを判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 1文字分が完全な進捗かを検査する。壊れた文字は全体を初期化する。 */
function repairKanaProgress(value: unknown, initial: KanaProgress): KanaProgress {
  if (!isRecord(value)) return initial;

  const hasValidBooleans = KANA_PROGRESS_BOOLEAN_FIELDS.every((field) => typeof value[field] === "boolean");
  const guideCount = value.guideCount;

  if (!hasValidBooleans || typeof guideCount !== "number" || !Number.isSafeInteger(guideCount) || guideCount < 0) {
    return initial;
  }

  return {
    seen: value.seen as boolean,
    shapeMatched: value.shapeMatched as boolean,
    soundMatched: value.soundMatched as boolean,
    traceWideTried: value.traceWideTried as boolean,
    traceNarrowTried: value.traceNarrowTried as boolean,
    copyTried: value.copyTried as boolean,
    freeWriteTried: value.freeWriteTried as boolean,
    completedOnce: value.completedOnce as boolean,
    guideCount,
  };
}

/** 音声・演出設定を、値ごとに安全な初期値へ補正する。 */
function repairSettings(value: unknown, initial: LearningSettings): LearningSettings {
  const candidate = isRecord(value) ? value : {};

  return {
    speech: typeof candidate.speech === "boolean" ? candidate.speech : initial.speech,
    music: typeof candidate.music === "boolean" ? candidate.music : initial.music,
    effects: typeof candidate.effects === "boolean" ? candidate.effects : initial.effects,
    reducedMotion: typeof candidate.reducedMotion === "boolean" ? candidate.reducedMotion : initial.reducedMotion,
  };
}

/** 現在文字と段階に矛盾しない行復習だけを復元する。 */
function repairRowReview(
  value: unknown,
  currentKana: KanaCharacter,
  stage: LessonStage,
): RowReviewProgress | null {
  if (value === null || !isRecord(value)) return null;

  const entry = KANA_ENTRIES.find((candidate) => candidate.character === currentKana);
  const isRowEnding = currentKana === "お" || currentKana === "こ" || currentKana === "そ" || currentKana === "と"
    || currentKana === "の" || currentKana === "ほ" || currentKana === "も" || currentKana === "よ"
    || currentKana === "ろ" || currentKana === "ん";
  const isShapeReview = value.step === "shape" && stage === "shapeMatch";
  const isSoundReview = value.step === "sound" && stage === "soundMatch";

  if (!entry || !isRowEnding || value.row !== entry.row || (!isShapeReview && !isSoundReview)) return null;

  return { row: entry.row, step: isShapeReview ? "shape" : "sound" };
}

/** 旧v1保存を含め、現在の選択問題に一致する案内段階だけを復元する。 */
function repairLessonAttempt(value: unknown, currentKana: KanaCharacter, stage: LessonStage): LessonAttempt | null {
  if (!isRecord(value) || (stage !== "shapeMatch" && stage !== "soundMatch")) return null;

  if (
    value.character !== currentKana
    || value.stage !== stage
    || typeof value.count !== "number"
    || !Number.isSafeInteger(value.count)
    || value.count < 0
  ) {
    return null;
  }

  return { character: currentKana, stage, count: value.count };
}

/** 外部・旧形式の保存値を、現在の安全な学習進捗へ部分復旧する。
 *
 * 未知のスキーマは新規進捗へ戻し、既知スキーマでは壊れた文字・設定だけを初期値へ戻す。
 * 単語カタログが未導入の間は、任意キーを保存しないため単語進捗を空にする。
 * 入力オブジェクトは変更しない。
 */
export function repairProgress(raw: unknown): LearningProgress {
  const initial = createInitialProgress();

  if (!isRecord(raw) || raw.schemaVersion !== 1) return initial;

  const hasValidCurrentKanaIndex = typeof raw.currentKanaIndex === "number"
    && Number.isSafeInteger(raw.currentKanaIndex)
    && raw.currentKanaIndex >= 0
    && raw.currentKanaIndex < KANA_ORDER.length;
  const currentKanaIndex = hasValidCurrentKanaIndex ? raw.currentKanaIndex as number : initial.currentKanaIndex;
  const stage = hasValidCurrentKanaIndex && typeof raw.stage === "string" && LESSON_STAGES.has(raw.stage as LessonStage)
    ? raw.stage as LessonStage
    : initial.stage;
  const rawKana = isRecord(raw.kana) ? raw.kana : {};

  const kana = Object.fromEntries(
    KANA_ORDER.map((character) => [character, repairKanaProgress(rawKana[character], initial.kana[character])]),
  ) as Record<KanaCharacter, KanaProgress>;
  const firstIncompleteIndex = KANA_ORDER.findIndex((character) => !kana[character].completedOnce);
  const allCompleted = firstIncompleteIndex < 0;
  const normalizedIndex = allCompleted ? KANA_ORDER.length - 1 : firstIncompleteIndex;
  const positionChanged = currentKanaIndex !== normalizedIndex;
  const normalizedStage = allCompleted ? "reward" : positionChanged ? initial.stage : stage;
  const currentKana = KANA_ORDER[normalizedIndex] ?? KANA_ORDER[0];

  return {
    schemaVersion: 1,
    currentKanaIndex: normalizedIndex,
    stage: normalizedStage,
    rowReview: !allCompleted && hasValidCurrentKanaIndex && !positionChanged
      ? repairRowReview(raw.rowReview, currentKana, normalizedStage)
      : null,
    lessonAttempt: repairLessonAttempt(raw.lessonAttempt, currentKana, normalizedStage),
    kana,
    words: {},
    settings: repairSettings(raw.settings, initial.settings),
  };
}
