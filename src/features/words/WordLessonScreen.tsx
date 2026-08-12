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
  readonly onDeferred: (wordId: string) => void;
  readonly onReturnToGarden: () => void;
  /** 読み復習は一時状態、未完書字の復習だけは書字達成を保存する。 */
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
export function selectWordStep(progress: LearningProgress, wordId: string): "choice" | "arrange" | "reward" | "complete" {
  const status = progress.words[wordId];
  if (!status?.selected) return "choice";
  if (!status.arranged || !status.readCompleted) return "arrange";
  if (!status.writingCompleted) return "reward";
  return "complete";
}

/** 選ぶ・並べる・書くを1語ずつ表示し、完了復習では本線を巻き戻さない。 */
export function WordLessonScreen({ progress, wordId, audio, onSelected, onArranged, onWritten, onDeferred, onReturnToGarden, reviewMode = false }: WordLessonScreenProps): React.JSX.Element {
  const word = useMemo(() => findWord(wordId), [wordId]);
  const status = progress.words[wordId];
  const resumesUnfinishedWriting = reviewMode
    && progress.settings.learningMode === "readingWriting"
    && status?.readCompleted
    && !status.writingCompleted;
  const [reviewStep, setReviewStep] = useState<"choice" | "arrange" | "reward" | "writing" | "complete">(resumesUnfinishedWriting ? "writing" : "choice");
  const [writingStarted, setWritingStarted] = useState(false);
  const step = reviewMode ? reviewStep : writingStarted ? "writing" : selectWordStep(progress, wordId);
  const speechEnabled = progress.settings.speech;

  /** 並べ方の案内を持ち越さず、読みの花を必ず一度表示する。 */
  const completeArrange = (): void => {
    audio.cancel();
    if (reviewMode) setReviewStep("reward");
    else onArranged(wordId);
  };

  /** 学び方に応じ、読み花から任意書字またはことばの庭へ進む。 */
  const continueFromReward = (): void => {
    if (progress.settings.learningMode === "readingWriting") {
      if (reviewMode) setReviewStep("writing");
      else setWritingStarted(true);
      return;
    }
    onReturnToGarden();
  };

  /** 未完書字の復習は保存し、すでに完了した復習だけ画面内で閉じる。 */
  const completeWriting = (): void => {
    if (reviewMode && status?.writingCompleted) {
      setReviewStep("complete");
      return;
    }
    onWritten(wordId);
  };

  return <main className="wordLesson" data-testid="word-lesson" data-word-step={step}>
    <header className="wordLesson__header"><p>ことばを そだてよう</p><button className="wordLesson__back" type="button" aria-label="ことばの にわへ もどる" onClick={onReturnToGarden}>にわ</button></header>
    {step === "choice" ? <WordChoiceStep word={word} choices={createWordChoices(wordId)} audio={audio} speechEnabled={speechEnabled} reducedMotion={progress.settings.reducedMotion} onComplete={() => reviewMode ? setReviewStep("arrange") : onSelected(wordId)} /> : null}
    {step === "arrange" ? <WordArrangeStep word={word.text} reducedMotion={progress.settings.reducedMotion} onGuide={() => { if (speechEnabled) void audio.speak("さいしょの もじから おいてみよう", { interrupt: true }); }} onComplete={completeArrange} /> : null}
    {step === "reward" ? <section className="wordLesson__reward" data-testid="word-reward"><p>{word.text} の はなが さいたよ</p><div className="wordLesson__flower" aria-label={`${word.text} の はな`}>{word.text}</div><button className="wordLesson__next" type="button" onClick={continueFromReward}>{progress.settings.learningMode === "readingWriting" ? "かいてみよう" : "ことばの にわへ"}</button></section> : null}
    {step === "writing" ? <WordWritingStep cells={word.writingCells} onComplete={completeWriting} onDefer={() => onDeferred(wordId)} /> : null}
    {step === "complete" ? <section className="wordLesson__reward"><p>{word.text} の はなが さいたよ</p><div className="wordLesson__flower" aria-label={`${word.text} の はな、かく れんしゅうも した`}>{word.text}<span className="wordLesson__flowerPencil" data-pencil-badge aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="m7 23 2-7L22 3l7 7-13 13-7 2zM19 6l7 7M9 16l7 7" /></svg></span></div><button className="wordLesson__next" type="button" onClick={onReturnToGarden}>ことばの にわへ</button></section> : null}
  </main>;
}
