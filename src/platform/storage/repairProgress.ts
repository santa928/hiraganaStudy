import { KANA_ENTRIES, KANA_ORDER } from "../../features/learning/content/kana";
import type { KanaCharacter } from "../../features/learning/content/types";
import { createInitialProgress } from "../../features/learning/model/reducer";
import type {
  KanaProgress,
  LearningProgress,
  LearningSettings,
  LessonStage,
  RowReviewProgress,
  WordProgress,
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

/** 単語の各体験状態を、値ごとに安全な初期値へ補正する。 */
function repairWordProgress(value: unknown): WordProgress {
  const candidate = isRecord(value) ? value : {};

  return {
    selected: typeof candidate.selected === "boolean" ? candidate.selected : false,
    arranged: typeof candidate.arranged === "boolean" ? candidate.arranged : false,
    writingTried: typeof candidate.writingTried === "boolean" ? candidate.writingTried : false,
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

/** 外部・旧形式の保存値を、現在の安全な学習進捗へ部分復旧する。
 *
 * 未知のスキーマは新規進捗へ戻し、既知スキーマでは壊れた文字・設定・単語だけを初期値へ戻す。
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
  const rawWords = isRecord(raw.words) ? raw.words : {};

  const kana = Object.fromEntries(
    KANA_ORDER.map((character) => [character, repairKanaProgress(rawKana[character], initial.kana[character])]),
  ) as Record<KanaCharacter, KanaProgress>;
  const words = Object.fromEntries(
    Object.entries(rawWords)
      .filter(([wordId]) => wordId.length > 0)
      .map(([wordId, progress]) => [wordId, repairWordProgress(progress)]),
  ) as Record<string, WordProgress>;
  const currentKana = KANA_ORDER[currentKanaIndex] ?? KANA_ORDER[0];

  return {
    schemaVersion: 1,
    currentKanaIndex,
    stage,
    rowReview: hasValidCurrentKanaIndex ? repairRowReview(raw.rowReview, currentKana, stage) : null,
    kana,
    words,
    settings: repairSettings(raw.settings, initial.settings),
  };
}
