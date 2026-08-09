import { useEffect, useMemo, useRef } from "react";

import type { AudioGuide } from "../../platform/audio/AudioGuide";
import { useFullscreen } from "../../platform/fullscreen/useFullscreen";
import { getIllustration, getWorldIllustration } from "../learning/content/assetCatalog";
import { KANA_ORDER, findKana } from "../learning/content/kana";
import type { LearningState, LessonEvent } from "../learning/model/types";
import { ChoiceGrid } from "./ChoiceGrid";
import { PromptCard } from "./PromptCard";
import { RewardStep } from "./RewardStep";
import { WritingStep } from "./WritingStep";
import "./LessonScreen.css";

/** LessonScreenへ渡す状態機械と音声の依存。 */
export interface LessonScreenProps {
  readonly state: LearningState;
  readonly dispatch: (event: LessonEvent) => void;
  readonly audio: AudioGuide;
  /** 保護者設定で読み上げを停止している時は、再生要求も出さない。 */
  readonly speechEnabled?: boolean;
  /** 任意復習だけに表示する、本線を変更しない庭への戻り口。 */
  readonly onReturnToGarden?: () => void;
}

type GuideKey = "intro" | "shape" | "sound" | "again" | "show" | "traceWide" | "traceNarrow" | "copyWithModel" | "freeWrite" | "reward";

/** 画面と読み上げが必ず同じ案内を使うための、短いコンテンツ辞書。 */
function guideMessage(key: GuideKey, character: string): string {
  const messages: Record<GuideKey, string> = {
    intro: `${character} に あってみよう`,
    shape: `おなじ かたちの ${character} を さがそう`,
    sound: `こえと えを きいて、もじを さがそう`,
    again: `もういちど、ゆっくり みてみよう`,
    show: `${character} を おしてみよう`,
    traceWide: "ふとい みちを なぞろう",
    traceNarrow: "ほそい みちを なぞろう",
    copyWithModel: "おてほんを みて かこう",
    freeWrite: "じぶんで かいてみよう",
    reward: `${character} の はなが さいたよ`,
  };
  return messages[key];
}

/** 正解位置を文字順から決定し、同じstageの再描画で選択肢を動かさない。 */
export function createLessonChoices(character: LearningState["currentKana"]): readonly LearningState["currentKana"][] {
  const entry = findKana(character);
  const choices = [...entry.distractors.slice(0, 2)];
  choices.splice(KANA_ORDER.indexOf(character) % 3, 0, character);
  return choices;
}

/** 現在文字と次の一文字だけを遅延読込する。 */
function preloadLessonImages(character: LearningState["currentKana"]): void {
  if (typeof Image === "undefined") return;
  const index = KANA_ORDER.indexOf(character);
  const nextCharacter = KANA_ORDER[index + 1];
  const targets = [character, nextCharacter].filter((value): value is LearningState["currentKana"] => value !== undefined);
  for (const target of targets) {
    const image = new Image();
    image.src = (awaitedIllustration(target));
  }
}

/** 読込対象だけのasset URLを取り出す。 */
function awaitedIllustration(character: LearningState["currentKana"]): string {
  return getIllustration(findKana(character).illustrationKey).src;
}

/** 状態機械の8段階を、朝の庭の一画面一操作へ接続する。 */
export function LessonScreen({ state, dispatch, audio, speechEnabled = true, onReturnToGarden }: LessonScreenProps): React.JSX.Element {
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);
  const voiceBird = getWorldIllustration("voice-bird");
  const gardenBackground = getWorldIllustration("garden-background");
  const wateringCan = getWorldIllustration("watering-can");
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const mountedRef = useRef(true);
  const replayRequestRef = useRef(0);
  const choices = useMemo(() => createLessonChoices(entry.character), [entry.character]);
  const isChoiceStage = state.stage === "shapeMatch" || state.stage === "soundMatch";
  const stageIdentity = `${state.currentKana}-${state.stage}`;
  const stageAttempts = state.progress.lessonAttempt?.character === state.currentKana
    && state.progress.lessonAttempt.stage === state.stage
    ? state.progress.lessonAttempt.count
    : 0;
  const guideKey: GuideKey = state.stage === "shapeMatch"
    ? stageAttempts >= 3 ? "show" : stageAttempts >= 1 ? "again" : "shape"
    : state.stage === "soundMatch"
      ? stageAttempts >= 3 ? "show" : stageAttempts >= 1 ? "again" : "sound"
      : state.stage;
  const guide = guideMessage(guideKey, entry.character);
  const stageIdentityRef = useRef(stageIdentity);
  const guideRef = useRef(guide);
  stageIdentityRef.current = stageIdentity;
  guideRef.current = guide;

  useEffect(() => {
    preloadLessonImages(state.currentKana);
  }, [state.currentKana]);

  useEffect(() => {
    replayRequestRef.current += 1;
    audio.cancel();
    if (!speechEnabled) return;
    void audio.speak(guide, { interrupt: true });
    return () => {
      replayRequestRef.current += 1;
      audio.cancel();
    };
  }, [audio, guide, speechEnabled, stageIdentity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const replayGuide = (): void => {
    if (!speechEnabled) return;
    const requestId = replayRequestRef.current + 1;
    const requestedStageIdentity = stageIdentity;
    const requestedGuide = guide;
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
      if (
        !mountedRef.current
        || replayRequestRef.current !== requestId
        || stageIdentityRef.current !== requestedStageIdentity
        || guideRef.current !== requestedGuide
      ) return;
      await audio.speak(requestedGuide, { interrupt: true });
    };
    void replay();
  };

  const answer = (choice: LearningState["currentKana"]): void => {
    const correct = choice === entry.character;
    const event: LessonEvent = state.stage === "shapeMatch"
      ? { type: "ANSWER_SHAPE", correct }
      : { type: "ANSWER_SOUND", correct };
    dispatch(event);
  };

  const writing = (): React.JSX.Element | null => {
    if (state.stage === "traceWide") return <WritingStep key={`${entry.character}-traceWide`} character={entry.character} mode="traceWide" onComplete={() => dispatch({ type: "COMPLETE_TRACE", width: "wide" })} />;
    if (state.stage === "traceNarrow") return <WritingStep key={`${entry.character}-traceNarrow`} character={entry.character} mode="traceNarrow" onComplete={() => dispatch({ type: "COMPLETE_TRACE", width: "narrow" })} />;
    if (state.stage === "copyWithModel") return <WritingStep key={`${entry.character}-copyWithModel`} character={entry.character} mode="copyWithModel" onComplete={() => dispatch({ type: "COMPLETE_COPY" })} />;
    if (state.stage === "freeWrite") return <WritingStep key={`${entry.character}-freeWrite`} character={entry.character} mode="freeWrite" onComplete={() => dispatch({ type: "COMPLETE_FREE_WRITE" })} onSkip={() => dispatch({ type: "SKIP_FREE_WRITE" })} />;
    return null;
  };

  return (
    <main className="lessonScreen" data-testid="lesson-stage" data-stage={state.stage} data-reduced-motion={state.progress.settings.reducedMotion || undefined} style={{ backgroundImage: `url(${gardenBackground.src})` }}>
      <header className="lessonScreen__hud" data-layout="hud">
        <p aria-label="いまの もじ">{entry.character}</p>
        <button className="lessonScreen__speaker" type="button" aria-label="こえを もういちど きく" onClick={replayGuide}>
          <img src={voiceBird.src} alt="こえのことり" width={voiceBird.width} height={voiceBird.height} />
        </button>
        <button className="lessonScreen__fullscreen" type="button" aria-label={isFullscreen ? "がめんを もどす" : "がめんを ひろげる"} onClick={toggleFullscreen}>⛶</button>
      </header>
      <p className="lessonScreen__guide" data-layout="guide">{guide}</p>
      <div className="lessonScreen__body">
        <section className="lessonScreen__material" data-layout="lesson">
          {state.stage === "intro" ? <PromptCard entry={entry} showCharacter emphasized /> : null}
          {state.stage === "shapeMatch" ? <PromptCard entry={entry} showCharacter emphasized={stageAttempts >= 2} /> : null}
          {state.stage === "soundMatch" ? <PromptCard entry={entry} showCharacter={false} /> : null}
          {writing()}
          {state.stage === "reward" ? <RewardStep entry={entry} /> : null}
        </section>
        <section className="lessonScreen__actions" data-layout="actions">
          {state.stage === "intro" ? <button className="lessonButton" type="button" onClick={() => dispatch({ type: "CONTINUE" })}>はじめる</button> : null}
          {isChoiceStage ? <ChoiceGrid choices={choices} correct={entry.character} guideCount={stageAttempts} onChoose={answer} /> : null}
          {state.stage === "reward" ? <button className="lessonButton lessonButton--watering" type="button" onClick={() => dispatch({ type: "CONTINUE" })}>
            <img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} />じょうろで つぎへ
          </button> : null}
          {onReturnToGarden ? <button className="lessonButton lessonButton--secondary" type="button" onClick={onReturnToGarden}>にわへ もどる</button> : null}
        </section>
      </div>
    </main>
  );
}
