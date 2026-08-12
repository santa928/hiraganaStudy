import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AudioGuide } from "../../platform/audio/AudioGuide";
import { getIllustration, getWorldIllustration } from "../learning/content/assetCatalog";
import { KANA_ORDER, findKana } from "../learning/content/kana";
import type { LearningState, LessonEvent } from "../learning/model/types";
import { firstIncompleteWritingStage } from "../learning/model/writingProgress";
import { ChoiceGrid } from "./ChoiceGrid";
import { lessonGuideCopy, type LessonGuideKey } from "./guideCopy";
import { HomeIcon } from "./HomeIcon";
import { PromptCard } from "./PromptCard";
import { RewardStep } from "./RewardStep";
import { SpeakerIcon } from "./SpeakerIcon";
import { SuccessBloom } from "./SuccessBloom";
import { WritingStep } from "./WritingStep";
import "./LessonScreen.css";

/** LessonScreenへ渡す状態機械と音声の依存。 */
export interface LessonScreenProps {
  readonly state: LearningState;
  readonly dispatch: (event: LessonEvent) => void;
  readonly audio: AudioGuide;
  /** 保護者設定で読み上げを停止している時は、再生要求も出さない。 */
  readonly speechEnabled?: boolean;
  /** 現在の学習状態を保ったまま庭へ戻る。 */
  readonly onReturnToGarden: () => void;
  /** 正解演出の開始時に、設定済みの効果音を一度だけ要求する。 */
  readonly onCelebrate?: () => void;
}

export const SUCCESS_CELEBRATION_MS = 560;

type SuccessTarget =
  | { readonly kind: "choice"; readonly choice: LearningState["currentKana"] }
  | { readonly kind: "writing" };

interface PendingSuccess {
  readonly stageIdentity: string;
  readonly event: LessonEvent;
  readonly target: SuccessTarget;
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

/** 一文字の導入・形合わせ・4書字・報酬を、朝の庭の一画面一操作へ接続する。 */
export function LessonScreen({ state, dispatch, audio, speechEnabled = true, onReturnToGarden, onCelebrate }: LessonScreenProps): React.JSX.Element {
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);
  const gardenBackground = getWorldIllustration("garden-background");
  const wateringCan = getWorldIllustration("watering-can");
  const mountedRef = useRef(true);
  const replayRequestRef = useRef(0);
  const successTimerRef = useRef<number | null>(null);
  const pendingSuccessRef = useRef<PendingSuccess | null>(null);
  const [pendingSuccess, setPendingSuccess] = useState<PendingSuccess | null>(null);
  const choices = useMemo(() => createLessonChoices(entry.character), [entry.character]);
  const isChoiceStage = state.stage === "shapeMatch";
  const stageIdentity = `${state.currentKana}-${state.stage}`;
  const visiblePendingSuccess = pendingSuccess?.stageIdentity === stageIdentity ? pendingSuccess : null;
  const stageAttempts = state.progress.lessonAttempt?.character === state.currentKana
    && state.progress.lessonAttempt.stage === state.stage
    ? state.progress.lessonAttempt.count
    : 0;
  const currentProgress = state.progress.kana[state.currentKana];
  const offersWriting = state.progress.settings.learningMode === "readingWriting"
    && currentProgress.readCompleted
    && !currentProgress.writingCompleted
    && firstIncompleteWritingStage(currentProgress) !== null;
  const guideKey: LessonGuideKey = state.stage === "shapeMatch"
    ? stageAttempts >= 3 ? "shapeShow" : stageAttempts >= 1 ? "shapeAgain" : "shape"
    : state.stage === "soundMatch"
      ? "traceWide"
    : state.stage;
  const guide = lessonGuideCopy(guideKey, entry);
  const stageIdentityRef = useRef(stageIdentity);
  const guideRef = useRef(guide.spoken);
  stageIdentityRef.current = stageIdentity;
  guideRef.current = guide.spoken;

  /** 予約中の成功遷移を破棄し、後から古い段階を進めない。 */
  const cancelPendingSuccess = useCallback((): void => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = null;
    pendingSuccessRef.current = null;
    setPendingSuccess(null);
  }, []);

  /** 現在の答えを短く祝った後、同じ段階なら一度だけ状態機械へ渡す。 */
  const beginSuccess = (event: LessonEvent, target: SuccessTarget): void => {
    if (pendingSuccessRef.current !== null) return;
    const pending = { stageIdentity, event, target };
    pendingSuccessRef.current = pending;
    setPendingSuccess(pending);
    onCelebrate?.();
    successTimerRef.current = window.setTimeout(() => {
      if (pendingSuccessRef.current !== pending || stageIdentityRef.current !== pending.stageIdentity) return;
      successTimerRef.current = null;
      pendingSuccessRef.current = null;
      setPendingSuccess(null);
      dispatch(event);
    }, SUCCESS_CELEBRATION_MS);
  };

  useEffect(() => {
    preloadLessonImages(state.currentKana);
  }, [state.currentKana]);

  useEffect(() => {
    replayRequestRef.current += 1;
    audio.cancel();
    if (!speechEnabled) return;
    void audio.speak(guide.spoken, { interrupt: true });
    return () => {
      replayRequestRef.current += 1;
      audio.cancel();
    };
  }, [audio, guide.spoken, speechEnabled, stageIdentity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => () => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = null;
    pendingSuccessRef.current = null;
  }, [stageIdentity]);

  const replayGuide = (): void => {
    if (!speechEnabled) return;
    const requestId = replayRequestRef.current + 1;
    const requestedStageIdentity = stageIdentity;
    const requestedGuide = guide.spoken;
    replayRequestRef.current = requestId;
    audio.cancel();
    const replay = async (): Promise<void> => {
      let status = audio.getStatus();
      if (status !== "ready") {
        try {
          status = await audio.unlock();
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
      if (status === "visual-only") return;
      await audio.speak(requestedGuide, { interrupt: true });
    };
    void replay();
  };

  const answer = (choice: LearningState["currentKana"]): void => {
    const correct = choice === entry.character;
    const event: LessonEvent = { type: "ANSWER_SHAPE", correct };
    if (correct) beginSuccess(event, { kind: "choice", choice });
    else dispatch(event);
  };

  const writing = (): React.JSX.Element | null => {
    const celebrating = visiblePendingSuccess?.target.kind === "writing";
    if (state.stage === "traceWide") return <WritingStep key={`${entry.character}-traceWide`} character={entry.character} mode="traceWide" celebrating={celebrating} onComplete={() => beginSuccess({ type: "COMPLETE_TRACE", width: "wide" }, { kind: "writing" })} onDefer={() => dispatch({ type: "DEFER_WRITING" })} />;
    if (state.stage === "traceNarrow") return <WritingStep key={`${entry.character}-traceNarrow`} character={entry.character} mode="traceNarrow" celebrating={celebrating} onComplete={() => beginSuccess({ type: "COMPLETE_TRACE", width: "narrow" }, { kind: "writing" })} onDefer={() => dispatch({ type: "DEFER_WRITING" })} />;
    if (state.stage === "copyWithModel") return <WritingStep key={`${entry.character}-copyWithModel`} character={entry.character} mode="copyWithModel" celebrating={celebrating} onComplete={() => beginSuccess({ type: "COMPLETE_COPY" }, { kind: "writing" })} onDefer={() => dispatch({ type: "DEFER_WRITING" })} />;
    if (state.stage === "freeWrite") return <WritingStep key={`${entry.character}-freeWrite`} character={entry.character} mode="freeWrite" celebrating={celebrating} onComplete={() => beginSuccess({ type: "COMPLETE_FREE_WRITE" }, { kind: "writing" })} onDefer={() => dispatch({ type: "DEFER_WRITING" })} />;
    return null;
  };

  return (
    <main className="lessonScreen" data-testid="lesson-stage" data-stage={state.stage} data-celebrating={visiblePendingSuccess ? "true" : undefined} data-reduced-motion={state.progress.settings.reducedMotion || undefined} style={{ backgroundImage: `url(${gardenBackground.src})` }}>
      <header className="lessonScreen__hud" data-layout="hud">
        <p aria-label="いまの もじ">{entry.character}</p>
        <button className="lessonScreen__speaker" type="button" aria-label="こえを もういちど きく" onClick={replayGuide}>
          <SpeakerIcon />
        </button>
        <button className="lessonScreen__home" type="button" aria-label="にわへ もどる" onClick={() => { cancelPendingSuccess(); onReturnToGarden(); }}>
          <HomeIcon />
        </button>
      </header>
      <p className="lessonScreen__guide" data-layout="guide">{guide.visible}</p>
      <div className="lessonScreen__body">
        <section className="lessonScreen__material" data-layout="lesson">
          {state.stage === "intro" ? <PromptCard entry={entry} showCharacter emphasized /> : null}
          {state.stage === "shapeMatch" ? <PromptCard entry={entry} showCharacter emphasized={stageAttempts >= 2} /> : null}
          {writing()}
          {state.stage === "reward" ? <RewardStep entry={entry} writingCompleted={currentProgress.writingCompleted} /> : null}
          {visiblePendingSuccess?.target.kind === "writing" ? <SuccessBloom character={entry.character} /> : null}
        </section>
        <section className="lessonScreen__actions" data-layout="actions">
          {state.stage === "intro" ? <button className="lessonButton" type="button" onClick={() => dispatch({ type: "CONTINUE" })}>はじめる</button> : null}
          {isChoiceStage ? <ChoiceGrid choices={choices} correct={entry.character} guideCount={stageAttempts} successChoice={visiblePendingSuccess?.target.kind === "choice" ? visiblePendingSuccess.target.choice : undefined} disabled={visiblePendingSuccess !== null} onChoose={answer} /> : null}
          {state.stage === "reward" ? <button className={`lessonButton${offersWriting ? "" : " lessonButton--watering"}`} type="button" onClick={() => dispatch({ type: "CONTINUE" })}>
            {offersWriting ? null : <img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} />}{offersWriting ? "かいてみよう" : "じょうろで つぎへ"}
          </button> : null}
        </section>
      </div>
    </main>
  );
}
