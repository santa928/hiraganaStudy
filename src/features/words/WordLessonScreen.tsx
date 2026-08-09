import { useMemo, useState } from "react";

import type { AudioGuide } from "../../platform/audio/AudioGuide";
import { WORD_ENTRIES, findWord } from "../learning/content/words";
import type { LearningProgress } from "../learning/model/types";
import { WordArrangeStep } from "./WordArrangeStep";
import { WordChoiceStep } from "./WordChoiceStep";
import { WordWritingStep } from "./WordWritingStep";
import "./WordLesson.css";

/** 単語1語の再開・復習画面へ渡す入力。 */
export interface WordLessonScreenProps {
  readonly progress: LearningProgress;
  readonly wordId: string;
  readonly audio: AudioGuide;
  readonly onSelected: (wordId: string) => void;
  readonly onArranged: (wordId: string) => void;
  readonly onWritten: (wordId: string) => void;
  readonly onReturnToGarden: () => void;
  /** 完了語の復習では保存flagを変更せず、この画面だけで3段階を進める。 */
  readonly reviewMode?: boolean;
}

/** 正答を含める文字だけの3択を、固定順で作る。 */
export function createWordChoices(wordId: string): readonly string[] {
  const index = WORD_ENTRIES.findIndex((entry) => entry.id === wordId);
  const target = WORD_ENTRIES[index];
  if (!target) return [];
  const alternatives = WORD_ENTRIES.filter((entry) => entry.id !== wordId && entry.stage === target.stage).slice(0, 2).map((entry) => entry.text);
  const choices = [...alternatives];
  choices.splice(index % 3, 0, target.text);
  return choices;
}

/** 保存flagから再読込でも一意に決まる、現在語の小さな段階を返す。 */
export function selectWordStep(progress: LearningProgress, wordId: string): "choice" | "arrange" | "writing" | "complete" {
  const status = progress.words[wordId];
  if (!status?.selected) return "choice";
  if (!status.arranged) return "arrange";
  if (!status.writingTried) return "writing";
  return "complete";
}

/** 選ぶ・並べる・書くを1語ずつ表示し、完了復習では本線を巻き戻さない。 */
export function WordLessonScreen({ progress, wordId, audio, onSelected, onArranged, onWritten, onReturnToGarden, reviewMode = false }: WordLessonScreenProps): React.JSX.Element {
  const word = useMemo(() => findWord(wordId), [wordId]);
  const [reviewStep, setReviewStep] = useState<"choice" | "arrange" | "writing" | "complete">("choice");
  const step = reviewMode ? reviewStep : selectWordStep(progress, wordId);
  const speechEnabled = progress.settings.speech;

  /** 並べ方の案内を次画面へ持ち越さず、書字段階だけを開始する。 */
  const completeArrange = (): void => {
    audio.cancel();
    if (reviewMode) setReviewStep("writing");
    else onArranged(wordId);
  };

  return <main className="wordLesson" data-testid="word-lesson" data-word-step={step}>
    <header className="wordLesson__header"><p>ことばを そだてよう</p><button className="wordLesson__back" type="button" aria-label="ことばの にわへ もどる" onClick={onReturnToGarden}>にわ</button></header>
    {step === "choice" ? <WordChoiceStep word={word} choices={createWordChoices(wordId)} audio={audio} speechEnabled={speechEnabled} reducedMotion={progress.settings.reducedMotion} onComplete={() => reviewMode ? setReviewStep("arrange") : onSelected(wordId)} /> : null}
    {step === "arrange" ? <WordArrangeStep word={word.text} reducedMotion={progress.settings.reducedMotion} onGuide={() => { if (speechEnabled) void audio.speak("さいしょの もじから おいてみよう", { interrupt: true }); }} onComplete={completeArrange} /> : null}
    {step === "writing" ? <WordWritingStep cells={word.writingCells} onComplete={() => reviewMode ? setReviewStep("complete") : onWritten(wordId)} /> : null}
    {step === "complete" ? <section className="wordLesson__arrange"><p>{word.text} の はなが さいたよ</p><button className="wordLesson__next" type="button" onClick={onReturnToGarden}>ことばの にわへ</button></section> : null}
  </main>;
}
