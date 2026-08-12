import { KANA_ORDER } from "../content/kana";
import type { LearningProgress, LearningRoute } from "./types";

/** 基本文字46文字を一度ずつ完了しているかを返す。 */
export function isWordGardenUnlocked(progress: LearningProgress): boolean {
  return KANA_ORDER.every((character) => progress.kana[character].readCompleted);
}

/** 保存進捗から、次に表示すべき主画面を決める。 */
export function selectRoute(progress: LearningProgress): LearningRoute {
  const currentKana = KANA_ORDER[progress.currentKanaIndex] ?? KANA_ORDER[0];

  if (progress.rowReview) return { kind: "rowReview", row: progress.rowReview.row };
  if (isWordGardenUnlocked(progress)) return { kind: "wordGarden" };
  if (KANA_ORDER.every((character) => !progress.kana[character].seen)) return { kind: "soundGate" };
  if (!progress.kana[currentKana].seen) return { kind: "garden" };

  return { kind: "kanaLesson", character: currentKana };
}
