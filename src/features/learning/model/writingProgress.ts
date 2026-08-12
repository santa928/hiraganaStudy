import type { KanaCharacter } from "../content/types";
import type { KanaProgress, LearningProgress, LessonStage, WritingStage } from "./types";

const WRITING_STAGE_FLAGS = [
  ["traceWide", "traceWideTried"],
  ["traceNarrow", "traceNarrowTried"],
  ["copyWithModel", "copyTried"],
  ["freeWrite", "freeWriteTried"],
] as const satisfies ReadonlyArray<readonly [WritingStage, keyof KanaProgress]>;

/** stageが4段階書字のいずれかかを判定する。 */
export function isWritingStage(stage: LessonStage): stage is WritingStage {
  return WRITING_STAGE_FLAGS.some(([candidate]) => candidate === stage);
}

/** 最初に未体験の書字段階を返し、全段階体験済みならnullを返す。 */
export function firstIncompleteWritingStage(progress: KanaProgress): WritingStage | null {
  return WRITING_STAGE_FLAGS.find(([, flag]) => progress[flag] !== true)?.[0] ?? null;
}

/** モードと文字実績から、花タップ時に開始する復習段階を決める。 */
export function selectKanaReviewStage(
  progress: LearningProgress,
  character: KanaCharacter,
): LessonStage {
  const kana = progress.kana[character];
  if (progress.settings.learningMode !== "readingWriting" || !kana.readCompleted || kana.writingCompleted) {
    return "intro";
  }

  return firstIncompleteWritingStage(kana) ?? "intro";
}

/** 復習書字の実績だけを対象文字へ反映し、本線カーソルと読み実績を保持する。 */
export function mergeKanaWritingPractice(
  progress: LearningProgress,
  character: KanaCharacter,
  reviewed: KanaProgress,
): LearningProgress {
  const current = progress.kana[character];

  return {
    ...progress,
    kana: {
      ...progress.kana,
      [character]: {
        ...current,
        traceWideTried: current.traceWideTried || reviewed.traceWideTried,
        traceNarrowTried: current.traceNarrowTried || reviewed.traceNarrowTried,
        copyTried: current.copyTried || reviewed.copyTried,
        freeWriteTried: current.freeWriteTried || reviewed.freeWriteTried,
        writingCompleted: current.writingCompleted || reviewed.writingCompleted,
      },
    },
  };
}
