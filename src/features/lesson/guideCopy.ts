import { kanaAssociationLabel } from "../learning/content/kana";
import type { KanaEntry } from "../learning/content/types";

/** 一文字レッスンで表示・読み上げを選ぶ固定の案内段階。 */
export type LessonGuideKey =
  | "intro"
  | "shape"
  | "shapeAgain"
  | "shapeShow"
  | "sound"
  | "soundAgain"
  | "soundShow"
  | "traceWide"
  | "traceNarrow"
  | "copyWithModel"
  | "freeWrite"
  | "reward";

/** 画面へ出す短文と、音声で補う文を混線させない案内の組。 */
export interface GuideCopy {
  readonly visible: string;
  readonly spoken: string;
}

/** 同じ文を画面と音声へ渡す案内を作る。 */
function sharedGuide(message: string): GuideCopy {
  return { visible: message, spoken: message };
}

/**
 * 一文字レッスンの画面文と読み上げ文を返す。
 *
 * 音問題だけは画面から関連語と対象文字を隠し、正解根拠を音声へ限定する。
 */
export function lessonGuideCopy(key: LessonGuideKey, entry: KanaEntry): GuideCopy {
  const association = kanaAssociationLabel(entry);
  const guides: Record<LessonGuideKey, GuideCopy> = {
    intro: sharedGuide(association),
    shape: sharedGuide(`${association}。おなじ かたちを さがそう`),
    shapeAgain: sharedGuide(`もういちど、${association}。ゆっくり みてみよう`),
    shapeShow: sharedGuide(`${association}。おなじ もじを おしてみよう`),
    sound: {
      visible: "こえを きいて\nおなじ もじを さがそう",
      spoken: `${association}。こえを きいて、おなじ もじを さがそう`,
    },
    soundAgain: {
      visible: "もういちど きいて\nおなじ もじを さがそう",
      spoken: `もういちど、${association}。ゆっくり きいてみよう`,
    },
    soundShow: {
      visible: "こえを きいて\nひかる もじを おしてみよう",
      spoken: `${association}。ひかる もじを おしてみよう`,
    },
    traceWide: sharedGuide("ふとい みちを なぞろう"),
    traceNarrow: sharedGuide("ほそい みちを なぞろう"),
    copyWithModel: sharedGuide("おてほんを みて かこう"),
    freeWrite: sharedGuide("じぶんで かいてみよう"),
    reward: sharedGuide(`${entry.character} の はなが さいたよ`),
  };
  return guides[key];
}
