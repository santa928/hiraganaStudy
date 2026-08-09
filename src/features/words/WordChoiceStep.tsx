import { useEffect, useState } from "react";

import type { WordEntry } from "../learning/content/types";
import { getWordIllustration } from "../learning/content/wordAssetCatalog";
import type { AudioGuide } from "../../platform/audio/AudioGuide";

/** 完成イラストと単語文字だけの選択を表示する。 */
export interface WordChoiceStepProps {
  readonly word: WordEntry;
  readonly choices: readonly string[];
  readonly audio: AudioGuide;
  readonly speechEnabled: boolean;
  readonly reducedMotion?: boolean;
  readonly onComplete: () => void;
}

/** 単語を見て選ぶ最初の一手。選択肢には画像・読み仮名を混ぜない。 */
export function WordChoiceStep({ word, choices, audio, speechEnabled, reducedMotion = false, onComplete }: WordChoiceStepProps): React.JSX.Element {
  const illustration = getWordIllustration(word.illustrationKey);
  const [imageFailed, setImageFailed] = useState(false);
  const [guideKey, setGuideKey] = useState(0);
  const hasLongChoice = choices.some((choice) => [...choice].length >= 5);

  useEffect(() => {
    audio.cancel();
    if (speechEnabled) void audio.speak(`${word.spokenLabel} を みつけよう`, { interrupt: true });
    return () => audio.cancel();
  }, [audio, speechEnabled, word.spokenLabel]);

  const choose = (choice: string): void => {
    if (choice !== word.text) {
      setGuideKey((current) => current + 1);
      if (speechEnabled) void audio.speak("もういちど、ゆっくり みてみよう", { interrupt: true });
      return;
    }
    onComplete();
  };

  return <section className="wordLesson__choice" data-testid="word-choice" data-reduced-motion={reducedMotion || undefined}>
    <div className="wordLesson__promptCard" key={guideKey} data-layout="word-card" data-guide={guideKey || undefined}>
      <button className="wordLesson__speaker" type="button" aria-label="ことばを もういちど きく" onClick={() => { if (speechEnabled) void audio.speak(word.spokenLabel, { interrupt: true }); }}>
        <svg aria-hidden="true" viewBox="0 0 64 64" focusable="false"><path d="M10 26h12l16-13v38L22 38H10z" /><path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" /></svg>
      </button>
      {imageFailed
        ? <button className="wordLesson__imageFallback" type="button" aria-label="えを もういちど みる" onClick={() => setImageFailed(false)}><span aria-hidden="true" /><small>えを もういちど みる</small></button>
        : <img className="wordLesson__illustration" src={illustration.src} alt="" width={illustration.width} height={illustration.height} onError={() => setImageFailed(true)} />}
    </div>
    <div className="wordLesson__choices" data-long={hasLongChoice || undefined} aria-label="ことばを えらぶ">
      {choices.map((choice) => <button className="wordLesson__choiceButton" key={choice} type="button" onClick={() => choose(choice)}>{choice}</button>)}
    </div>
  </section>;
}
