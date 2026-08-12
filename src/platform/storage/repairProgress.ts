import { KANA_ENTRIES, KANA_ORDER } from "../../features/learning/content/kana";
import { WORD_ENTRIES } from "../../features/learning/content/words";
import type { KanaCharacter } from "../../features/learning/content/types";
import { createInitialProgress } from "../../features/learning/model/reducer";
import type {
  KanaProgress,
  LearningMode,
  LessonAttempt,
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
  "readCompleted",
  "writingCompleted",
] as const;
const WRITING_STAGES = new Set<LessonStage>(["traceWide", "traceNarrow", "copyWithModel", "freeWrite"]);

/** 保存データの型境界で、配列を除くオブジェクトかを判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** schema v2の既知語を、成立可能な順方向だけへ補正する。 */
function repairWordProgressV2(value: unknown, initial: WordProgress): WordProgress {
  if (!isRecord(value)) return initial;
  const selected = value.selected === true;
  const arranged = selected && value.arranged === true;
  const writingTried = arranged && value.writingTried === true;
  const readCompleted = arranged && value.readCompleted === true;
  const writingCompleted = readCompleted && writingTried && value.writingCompleted === true;
  return { selected, arranged, writingTried, readCompleted, writingCompleted };
}

/** schema v1の単語進捗を、読み・書字が分かれたv2へ移行する。 */
function migrateWordProgressV1(value: unknown, initial: WordProgress): WordProgress {
  if (!isRecord(value)) return initial;
  const selected = value.selected === true;
  const arranged = selected && value.arranged === true;
  const writingTried = arranged && value.writingTried === true;
  return {
    selected,
    arranged,
    writingTried,
    readCompleted: arranged,
    writingCompleted: writingTried,
  };
}

/** schema v2の1文字分を検査し、壊れた文字だけを初期化する。 */
function repairKanaProgressV2(value: unknown, initial: KanaProgress): KanaProgress {
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
    readCompleted: value.readCompleted as boolean,
    writingCompleted: value.writingCompleted as boolean,
    guideCount,
  };
}

/** schema v1の1文字分を、読み・書字が分かれたv2へ移行する。 */
function migrateKanaProgressV1(value: unknown, initial: KanaProgress): KanaProgress {
  if (!isRecord(value)) return initial;

  const legacyBooleanFields = [
    "seen",
    "shapeMatched",
    "soundMatched",
    "traceWideTried",
    "traceNarrowTried",
    "copyTried",
    "freeWriteTried",
    "completedOnce",
  ] as const;
  const guideCount = value.guideCount;
  if (
    !legacyBooleanFields.every((field) => typeof value[field] === "boolean")
    || typeof guideCount !== "number"
    || !Number.isSafeInteger(guideCount)
    || guideCount < 0
  ) {
    return initial;
  }

  const traceWideTried = value.traceWideTried as boolean;
  const traceNarrowTried = value.traceNarrowTried as boolean;
  const copyTried = value.copyTried as boolean;
  const freeWriteTried = value.freeWriteTried as boolean;

  return {
    seen: value.seen as boolean,
    shapeMatched: value.shapeMatched as boolean,
    soundMatched: value.soundMatched as boolean,
    traceWideTried,
    traceNarrowTried,
    copyTried,
    freeWriteTried,
    readCompleted: value.completedOnce === true || value.shapeMatched === true,
    writingCompleted: traceWideTried && traceNarrowTried && copyTried && freeWriteTried,
    guideCount,
  };
}

/** 音声・演出・学び方設定を、値ごとに安全な初期値へ補正する。 */
function repairSettings(
  value: unknown,
  initial: LearningSettings,
  migratedMode: LearningMode | null,
): LearningSettings {
  const candidate = isRecord(value) ? value : {};

  return {
    learningMode: migratedMode
      ?? (candidate.learningMode === "reading" || candidate.learningMode === "readingWriting"
        ? candidate.learningMode
        : initial.learningMode),
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
 * 単語は既知の60 IDだけを復元し、不明IDと不可能な段階逆転は捨てる。
 * 入力オブジェクトは変更しない。
 */
export function repairProgress(raw: unknown): LearningProgress {
  const initial = createInitialProgress();

  if (!isRecord(raw) || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)) return initial;
  const isLegacyV1 = raw.schemaVersion === 1;

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
    KANA_ORDER.map((character) => [
      character,
      isLegacyV1
        ? migrateKanaProgressV1(rawKana[character], initial.kana[character])
        : repairKanaProgressV2(rawKana[character], initial.kana[character]),
    ]),
  ) as Record<KanaCharacter, KanaProgress>;
  const firstIncompleteIndex = KANA_ORDER.findIndex((character) => !kana[character].readCompleted);
  const allCompleted = firstIncompleteIndex < 0;
  const savedKana = KANA_ORDER[currentKanaIndex] ?? KANA_ORDER[0];
  const candidateRowReview = hasValidCurrentKanaIndex
    ? repairRowReview(raw.rowReview, savedKana, stage)
    : null;
  const preservesActiveWriting = hasValidCurrentKanaIndex
    && WRITING_STAGES.has(stage)
    && kana[savedKana].readCompleted
    && !kana[savedKana].writingCompleted;
  const preservesCurrentUnread = !allCompleted && currentKanaIndex === firstIncompleteIndex;
  const preservesRowReview = candidateRowReview !== null;
  const preservesSavedPosition = preservesActiveWriting || preservesCurrentUnread || preservesRowReview;
  const normalizedIndex = preservesSavedPosition
    ? currentKanaIndex
    : allCompleted ? KANA_ORDER.length - 1 : firstIncompleteIndex;
  const positionChanged = currentKanaIndex !== normalizedIndex;
  const normalizedStage = preservesSavedPosition ? stage : allCompleted ? "reward" : initial.stage;
  const currentKana = KANA_ORDER[normalizedIndex] ?? KANA_ORDER[0];
  const repairedRowReview = !positionChanged ? repairRowReview(raw.rowReview, currentKana, normalizedStage) : null;
  const repairedStage = normalizedStage === "soundMatch" && repairedRowReview === null
    ? "traceWide"
    : normalizedStage;
  const repairedWords: Record<string, WordProgress> = {};
  let hasIncompleteWord = false;
  for (const entry of WORD_ENTRIES) {
    const repaired = hasIncompleteWord
      ? initial.words[entry.id]
      : isLegacyV1
        ? migrateWordProgressV1(rawWords[entry.id], initial.words[entry.id])
        : repairWordProgressV2(rawWords[entry.id], initial.words[entry.id]);
    repairedWords[entry.id] = repaired;
    if (!repaired.readCompleted) hasIncompleteWord = true;
  }

  return {
    schemaVersion: 2,
    currentKanaIndex: normalizedIndex,
    stage: repairedStage,
    rowReview: repairedRowReview,
    lessonAttempt: repairLessonAttempt(raw.lessonAttempt, currentKana, repairedStage),
    kana,
    words: allCompleted ? repairedWords : initial.words,
    settings: repairSettings(raw.settings, initial.settings, isLegacyV1 ? "readingWriting" : null),
  };
}
