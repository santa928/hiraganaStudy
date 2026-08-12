import { useEffect, useMemo, useRef } from "react";

import type { AudioGuide } from "../../platform/audio/AudioGuide";
import { getWorldIllustration } from "../learning/content/assetCatalog";
import { KANA_ENTRIES, findKana } from "../learning/content/kana";
import type { KanaCharacter } from "../learning/content/types";
import type { LearningState, LessonEvent } from "../learning/model/types";
import { ChoiceGrid } from "../lesson/ChoiceGrid";
import { lessonGuideCopy, type LessonGuideKey } from "../lesson/guideCopy";
import { HomeIcon } from "../lesson/HomeIcon";
import { PromptCard } from "../lesson/PromptCard";
import { SoundPrompt } from "../lesson/SoundPrompt";
import { SpeakerIcon } from "../lesson/SpeakerIcon";
import "../lesson/LessonScreen.css";
import "./GardenScreen.css";

/** 行復習画面へ渡す状態機械と音声の依存。 */
export interface RowReviewScreenProps {
  readonly state: LearningState;
  readonly dispatch: (event: LessonEvent) => void;
  readonly audio: AudioGuide;
  /** 行復習の段階を保ったまま庭へ戻る。 */
  readonly onReturnToGarden: () => void;
}

/** 行内の比較しやすい文字を返し、最初の音復習だけは二択にする。 */
export function createRowReviewChoices(character: KanaCharacter, step: "shape" | "sound"): readonly KanaCharacter[] {
  const entry = findKana(character);
  const characters = KANA_ENTRIES.filter((candidate) => candidate.row === entry.row).map((candidate) => candidate.character);
  if (entry.row === "a" && step === "sound") {
    const firstDistractor = characters.find((candidate) => candidate !== character);
    return firstDistractor ? [firstDistractor, character] : [character];
  }
  if (characters.length === 3) return characters;
  const first = characters[0];
  const middle = characters[Math.floor(characters.length / 2)];
  const last = characters[characters.length - 1];
  return [first, middle, last] as readonly KanaCharacter[];
}

/** 行末の文字を題材に、形から音へ一問ずつ復習する。 */
export function RowReviewScreen({ state, dispatch, audio, onReturnToGarden }: RowReviewScreenProps): React.JSX.Element {
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);
  const review = state.progress.rowReview;
  const step = review?.step ?? "shape";
  const isShape = step === "shape";
  const choices = useMemo(() => createRowReviewChoices(entry.character, step), [entry.character, step]);
  const attempt = state.progress.lessonAttempt?.character === entry.character && state.progress.lessonAttempt.stage === state.stage
    ? state.progress.lessonAttempt.count
    : 0;
  const guideKey: LessonGuideKey = isShape
    ? attempt >= 2 ? "shapeShow" : "shape"
    : attempt >= 2 ? "soundShow" : "sound";
  const guide = lessonGuideCopy(guideKey, entry);
  const stageIdentity = `${entry.character}-${step}-${attempt}`;
  const mountedRef = useRef(true);
  const replayRequestRef = useRef(0);
  const dispatchRef = useRef(dispatch);
  const stageIdentityRef = useRef(stageIdentity);
  dispatchRef.current = dispatch;
  stageIdentityRef.current = stageIdentity;
  const background = getWorldIllustration("garden-background");

  useEffect(() => {
    let active = true;
    replayRequestRef.current += 1;
    audio.cancel();
    if (!state.progress.settings.speech) return;
    try {
      void Promise.resolve(audio.speak(guide.spoken, { interrupt: true })).catch(() => {
        if (active && !isShape) dispatchRef.current({ type: "SKIP_SOUND_MATCH" });
      });
    } catch {
      if (!isShape) dispatchRef.current({ type: "SKIP_SOUND_MATCH" });
    }
    return () => {
      active = false;
      audio.cancel();
    };
  }, [audio, guide.spoken, isShape, state.progress.settings.speech]);
  useEffect(() => {
    if (isShape) return;
    if (state.progress.settings.speech && audio.getStatus() !== "visual-only") return;
    audio.cancel();
    dispatch({ type: "SKIP_SOUND_MATCH" });
  }, [audio, dispatch, isShape, state.progress.settings.speech]);
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
      let status = audio.getStatus();
      if (status !== "ready") {
        try {
          status = await audio.unlock();
        } catch {
          if (!isShape && mountedRef.current && replayRequestRef.current === requestId && stageIdentityRef.current === requestedIdentity) {
            dispatchRef.current({ type: "SKIP_SOUND_MATCH" });
          }
          return;
        }
      }
      if (!mountedRef.current || replayRequestRef.current !== requestId || stageIdentityRef.current !== requestedIdentity) return;
      if (status === "visual-only") {
        if (!isShape) dispatchRef.current({ type: "SKIP_SOUND_MATCH" });
        return;
      }
      try {
        await audio.speak(guide.spoken, { interrupt: true });
      } catch {
        if (!isShape && mountedRef.current && replayRequestRef.current === requestId && stageIdentityRef.current === requestedIdentity) {
          dispatchRef.current({ type: "SKIP_SOUND_MATCH" });
        }
      }
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
        <button className="lessonScreen__speaker" type="button" aria-label="こえを もういちど きく" onClick={replayGuide}><SpeakerIcon /></button>
        <button className="lessonScreen__home" type="button" aria-label="にわへ もどる" onClick={onReturnToGarden}><HomeIcon /></button>
      </header>
      <p className="lessonScreen__guide">{guide.visible}</p>
      <section className="rowReviewScreen__body">
        {isShape ? <PromptCard entry={entry} showCharacter emphasized={attempt >= 2} /> : <SoundPrompt onReplay={replayGuide} />}
        <div className="rowReviewScreen__actions">
          <ChoiceGrid choices={choices} correct={entry.character} guideCount={attempt} onChoose={answer} />
          {!isShape ? <button className="rowReviewScreen__skip" type="button" aria-label="こえの おさらいを とばす" onClick={() => dispatch({ type: "SKIP_SOUND_MATCH" })}>つぎへ <span aria-hidden="true">▶</span></button> : null}
        </div>
      </section>
    </main>
  );
}
