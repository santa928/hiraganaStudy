import { KANA_ORDER, type KanaCharacter } from "../../features/learning/content/types";
import { createInitialProgress } from "../../features/learning/model/reducer";
import type { LearningProgress, LearningState, LessonAttempt, LessonStage } from "../../features/learning/model/types";

/** 指定文字・段階で再開するための保存進捗を作るテストfixture。 */
export function progressAt(
  character: KanaCharacter,
  stage: LessonStage,
  lessonAttempt: LessonAttempt | null = null,
): LearningProgress {
  const initial = createInitialProgress();
  const currentKanaIndex = KANA_ORDER.indexOf(character);

  return {
    ...initial,
    currentKanaIndex,
    stage,
    lessonAttempt,
  };
}

/** 指定文字・段階で再開するための学習状態を作るテストfixture。 */
export function stateAt(character: KanaCharacter, stage: LessonStage): LearningState {
  const progress = progressAt(character, stage);

  return {
    progress,
    currentKana: character,
    stage,
  };
}

/** 先頭から指定数の文字だけを読み書きとも体験した保存進捗を作るテストfixture。 */
export function progressWithCompletedCount(count: number): LearningProgress {
  const initial = createInitialProgress();
  const completedCharacters = new Set(KANA_ORDER.slice(0, count));

  return {
    ...initial,
    kana: Object.fromEntries(
      KANA_ORDER.map((character) => [
        character,
        {
          ...initial.kana[character],
          readCompleted: completedCharacters.has(character),
          writingCompleted: completedCharacters.has(character),
        },
      ]),
    ) as LearningProgress["kana"],
  };
}
