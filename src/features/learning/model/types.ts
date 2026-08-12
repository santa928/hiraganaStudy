import type { KanaEntry, KanaCharacter } from "../content/types";

/** 1文字の中で順に体験する学習段階。 */
export type LessonStage =
  | "intro"
  | "shapeMatch"
  | "soundMatch"
  | "traceWide"
  | "traceNarrow"
  | "copyWithModel"
  | "freeWrite"
  | "reward";

/** 保護者が端末全体へ設定する、読み中心または読み書きの学び方。 */
export type LearningMode = "reading" | "readingWriting";

/** 4段階書字のいずれかを表す、復習・後回し判定用の段階。 */
export type WritingStage = Extract<LessonStage, "traceWide" | "traceNarrow" | "copyWithModel" | "freeWrite">;

/** 1文字ごとに保存する体験済み状態と案内回数。 */
export interface KanaProgress {
  readonly seen: boolean;
  readonly shapeMatched: boolean;
  readonly soundMatched: boolean;
  readonly traceWideTried: boolean;
  readonly traceNarrowTried: boolean;
  readonly copyTried: boolean;
  readonly freeWriteTried: boolean;
  readonly readCompleted: boolean;
  readonly writingCompleted: boolean;
  readonly guideCount: number;
}

/** 単語コースで保存する体験済み状態。 */
export interface WordProgress {
  readonly selected: boolean;
  readonly arranged: boolean;
  readonly writingTried: boolean;
  readonly readCompleted: boolean;
  readonly writingCompleted: boolean;
}

/** 音声・演出に関する端末内設定。 */
export interface LearningSettings {
  readonly learningMode: LearningMode;
  readonly speech: boolean;
  readonly music: boolean;
  readonly effects: boolean;
  readonly reducedMotion: boolean;
}

/** 行末にだけ挟む復習の現在位置。 */
export interface RowReviewProgress {
  readonly row: KanaEntry["row"];
  readonly step: "shape" | "sound";
}

/** 一文字の形合わせと、行末の任意音復習でだけ使う案内段階。 */
export interface LessonAttempt {
  readonly character: KanaCharacter;
  readonly stage: "shapeMatch" | "soundMatch";
  readonly count: number;
}

/** 端末保存する学習全体の進捗。 */
export interface LearningProgress {
  readonly schemaVersion: 2;
  readonly currentKanaIndex: number;
  readonly stage: LessonStage;
  readonly rowReview: RowReviewProgress | null;
  readonly lessonAttempt: LessonAttempt | null;
  readonly kana: Readonly<Record<KanaCharacter, KanaProgress>>;
  readonly words: Readonly<Record<string, WordProgress>>;
  readonly settings: LearningSettings;
}

/** UIが描画する現在の文字と、その保存進捗。 */
export interface LearningState {
  readonly progress: LearningProgress;
  readonly currentKana: KanaCharacter;
  readonly stage: LessonStage;
}

/** 学習画面から状態機械へ送る、許可済みの操作イベント。 */
export type LessonEvent =
  | { readonly type: "START" }
  | { readonly type: "ANSWER_SHAPE"; readonly correct: boolean }
  | { readonly type: "ANSWER_SOUND"; readonly correct: boolean }
  | { readonly type: "SKIP_SOUND_MATCH" }
  | { readonly type: "COMPLETE_TRACE"; readonly width: "wide" | "narrow" }
  | { readonly type: "COMPLETE_COPY" }
  | { readonly type: "COMPLETE_FREE_WRITE" }
  | { readonly type: "SKIP_FREE_WRITE" }
  | { readonly type: "DEFER_WRITING" }
  | { readonly type: "CHANGE_LEARNING_MODE"; readonly mode: LearningMode }
  | { readonly type: "COMPLETE_WORD_SELECTION"; readonly wordId: string }
  | { readonly type: "COMPLETE_WORD_ARRANGE"; readonly wordId: string }
  | { readonly type: "COMPLETE_WORD_WRITING"; readonly wordId: string }
  | { readonly type: "CONTINUE" }
  | { readonly type: "RESUME"; readonly progress: LearningProgress };

/** 進捗から決まる学習アプリの主画面。 */
export type LearningRoute =
  | { readonly kind: "garden" }
  | { readonly kind: "kanaLesson"; readonly character: KanaCharacter }
  | { readonly kind: "rowReview"; readonly row: KanaEntry["row"] }
  | { readonly kind: "wordGarden" };
