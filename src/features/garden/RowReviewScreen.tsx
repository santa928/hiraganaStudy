import { useEffect, useMemo, useRef } from "react";

import type { AudioGuide } from "../../platform/audio/AudioGuide";
import { getWorldIllustration } from "../learning/content/assetCatalog";
import { KANA_ENTRIES, findKana } from "../learning/content/kana";
import type { KanaCharacter } from "../learning/content/types";
import type { LearningState, LessonEvent } from "../learning/model/types";
import { ChoiceGrid } from "../lesson/ChoiceGrid";
import { PromptCard } from "../lesson/PromptCard";
import "../lesson/LessonScreen.css";
import "./GardenScreen.css";

/** 行復習画面へ渡す状態機械と音声の依存。 */
export interface RowReviewScreenProps {
  readonly state: LearningState;
  readonly dispatch: (event: LessonEvent) => void;
  readonly audio: AudioGuide;
}

/** 行内の比較しやすい文字を固定順で三つ返す。 */
export function createRowReviewChoices(character: KanaCharacter): readonly KanaCharacter[] {
  const entry = findKana(character);
  const characters = KANA_ENTRIES.filter((candidate) => candidate.row === entry.row).map((candidate) => candidate.character);
  if (characters.length === 3) return characters;
  const first = characters[0];
  const middle = characters[Math.floor(characters.length / 2)];
  const last = characters[characters.length - 1];
  return [first, middle, last] as readonly KanaCharacter[];
}

/** 行末の文字を題材に、形から音へ一問ずつ復習する。 */
export function RowReviewScreen({ state, dispatch, audio }: RowReviewScreenProps): React.JSX.Element {
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);
  const review = state.progress.rowReview;
  const step = review?.step ?? "shape";
  const isShape = step === "shape";
  const choices = useMemo(() => createRowReviewChoices(entry.character), [entry.character]);
  const attempt = state.progress.lessonAttempt?.character === entry.character && state.progress.lessonAttempt.stage === state.stage
    ? state.progress.lessonAttempt.count
    : 0;
  const guide = isShape
    ? attempt >= 2 ? `${entry.character} を みつけよう` : `${entry.character} と おなじ かたちを さがそう`
    : attempt >= 2 ? `${entry.character} を きいて さがそう` : "こえを きいて もじを さがそう";
  const stageIdentity = `${entry.character}-${step}-${attempt}`;
  const mountedRef = useRef(true);
  const replayRequestRef = useRef(0);
  const stageIdentityRef = useRef(stageIdentity);
  stageIdentityRef.current = stageIdentity;
  const background = getWorldIllustration("garden-background");

  useEffect(() => {
    replayRequestRef.current += 1;
    if (!state.progress.settings.speech) return;
    audio.cancel();
    void audio.speak(guide, { interrupt: true });
    return () => audio.cancel();
  }, [audio, guide, state.progress.settings.speech]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const replayGuide = (): void => {
    if (!state.progress.settings.speech) return;
    const requestId = replayRequestRef.current + 1;
    const requestedIdentity = stageIdentity;
    replayRequestRef.current = requestId;
    audio.cancel();
    const replay = async (): Promise<void> => {
      if (audio.getStatus() !== "ready") {
        try {
          await audio.unlock();
        } catch {
          return;
        }
      }
      if (!mountedRef.current || replayRequestRef.current !== requestId || stageIdentityRef.current !== requestedIdentity) return;
      await audio.speak(guide, { interrupt: true });
    };
    void replay();
  };

  const answer = (choice: KanaCharacter): void => {
    dispatch(isShape ? { type: "ANSWER_SHAPE", correct: choice === entry.character } : { type: "ANSWER_SOUND", correct: choice === entry.character });
  };

  return (
    <main className="rowReviewScreen lessonScreen" data-testid="row-review" data-step={step} data-reduced-motion={state.progress.settings.reducedMotion || undefined} style={{ backgroundImage: `url(${background.src})` }}>
      <header className="rowReviewScreen__header">
        <p>この ぎょうを もういちど</p>
        <button className="lessonScreen__speaker" type="button" aria-label="こえを もういちど きく" onClick={replayGuide}><svg aria-hidden="true" viewBox="0 0 64 64" focusable="false"><path d="M10 26h12l16-13v38L22 38H10z" /><path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" /></svg></button>
      </header>
      <p className="lessonScreen__guide">{guide}</p>
      <section className="rowReviewScreen__body">
        <PromptCard entry={entry} showCharacter={isShape} emphasized={attempt >= 2} />
        <ChoiceGrid choices={choices} correct={entry.character} guideCount={attempt} onChoose={answer} />
      </section>
    </main>
  );
}
