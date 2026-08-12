import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import { registerGameTextState } from "./gameTestHooks";
import { createBrowserRuntime, type GameRuntime } from "./GameRuntime";
import { GardenScreen } from "../features/garden/GardenScreen";
import { RowReviewScreen } from "../features/garden/RowReviewScreen";
import { KANA_ORDER, findKana } from "../features/learning/content/kana";
import { WORD_ENTRIES } from "../features/learning/content/words";
import { getWorldIllustration } from "../features/learning/content/assetCatalog";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import { isWordGardenUnlocked, selectRoute } from "../features/learning/model/selectors";
import { isWritingStage, mergeKanaWritingPractice, selectKanaReviewStage } from "../features/learning/model/writingProgress";
import type { KanaCharacter } from "../features/learning/content/types";
import type { LearningRoute, LearningSettings, LearningState, LessonEvent } from "../features/learning/model/types";
import { LessonScreen, createLessonChoices } from "../features/lesson/LessonScreen";
import { ParentDashboard, type ParentEnvironment } from "../features/parent/ParentDashboard";
import { WordGardenScreen } from "../features/words/WordGardenScreen";
import { WordLessonScreen } from "../features/words/WordLessonScreen";
import { BrowserSpeechGuide } from "../platform/audio/BrowserSpeechGuide";
import type { AudioGuide } from "../platform/audio/AudioGuide";
import { SoundEffects } from "../platform/audio/SoundEffects";
import { usePwaStatusLabel } from "../platform/pwa/PwaStatus";

/** SoundEffectsの実装をブラウザAudioContextから切り離す最小の注入口。 */
export interface AppSoundEffects {
  applySettings(settings: Pick<LearningSettings, "speech" | "music" | "effects">): void;
  setSpeechActive?(active: boolean): void;
  startGardenLoop(): Promise<void>;
  stopGardenLoop(): void;
  play(name: "tap" | "success" | "sprout"): Promise<void>;
}

/** Appへ注入できる、保存と音声・効果音のテスト用依存。 */
export interface AppProps {
  readonly runtime?: GameRuntime;
  readonly audio?: AudioGuide;
  readonly effects?: AppSoundEffects;
  /** URL復元などが要求した画面。進捗上の到達条件を満たす場合だけ採用する。 */
  readonly requestedRoute?: LearningRoute["kind"];
}

type EntryScreen = "soundGate" | "watering" | "garden" | "lesson" | "rowReview" | "parent" | "wordGarden" | "wordLesson";

/** 読み上げ中だけ、対応する効果音実装へducking状態を伝える。 */
export function createSpeechDuckingHandler(effects: AppSoundEffects): (active: boolean) => void {
  return (active) => effects.setSpeechActive?.(active);
}

/** 初回を除き、再起動時にまず庭へ戻すべき進捗かを判定する。 */
function hasStartedLesson(state: LearningState): boolean {
  return Object.values(state.progress.kana).some((kana) => kana.seen);
}

/** 現在端末の表示modeを、未実装PWA成功と混同せずに返す。 */
function getDisplayMode(): ParentEnvironment["displayMode"] {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return navigatorWithStandalone.standalone || globalThis.matchMedia?.("(display-mode: standalone)").matches ? "standalone" : "browser";
}

/** 通常導線の次画面を、保存済みrouteから一貫して選ぶ。 */
function screenForRoute(state: LearningState): EntryScreen {
  return selectRoute(state.progress).kind === "rowReview" ? "rowReview" : "garden";
}

/** 初回音声確認、庭、行復習、保護者画面を純粋な学習進捗へ接続する。 */
export function App({ runtime: suppliedRuntime, audio: suppliedAudio, effects: suppliedEffects, requestedRoute }: AppProps = {}): JSX.Element {
  const runtimeRef = useRef<GameRuntime | null>(null);
  if (runtimeRef.current === null) runtimeRef.current = suppliedRuntime ?? createBrowserRuntime();
  const effectsRef = useRef<AppSoundEffects | null>(null);
  if (effectsRef.current === null) effectsRef.current = suppliedEffects ?? new SoundEffects();
  const effects = effectsRef.current;
  const audioRef = useRef<AudioGuide | null>(null);
  if (audioRef.current === null) audioRef.current = suppliedAudio ?? new BrowserSpeechGuide({ onSpeakingChange: createSpeechDuckingHandler(effects) });
  const runtime = runtimeRef.current;
  const audio = audioRef.current;
  const [state, setState] = useState<LearningState>(() => reduceLesson(
    { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
    { type: "RESUME", progress: createInitialProgress() },
  ));
  const [reviewState, setReviewState] = useState<LearningState | null>(null);
  const [screen, setScreen] = useState<EntryScreen>("soundGate");
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [wordReviewMode, setWordReviewMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const skipInitialSaveRef = useRef(false);
  const snapshotRef = useRef("{}");
  const mountedRef = useRef(true);
  const resetInFlightRef = useRef(false);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceGenerationRef = useRef(0);
  const route = selectRoute(state.progress);
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);
  const pwaStatus = usePwaStatusLabel();

  const dispatch = useCallback((event: LessonEvent): void => {
    setState((current) => reduceLesson(current, event));
  }, []);

  /** 一文字レッスンの花が開く時に、設定を尊重する既存成功音を要求する。 */
  const playLessonSuccess = useCallback((): void => {
    void effects.play("success");
  }, [effects]);

  /** saveとresetを一列にし、古いsaveがreset済みの進捗を復活させない。 */
  const queuePersistence = useCallback((operation: () => Promise<void>): Promise<void> => {
    const queued = persistenceQueueRef.current.then(operation, operation);
    persistenceQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, []);

  useEffect(() => {
    let active = true;
    void runtime.progressRepository.load().then((progress) => {
      if (!active) return;
      skipInitialSaveRef.current = true;
      const resumed = reduceLesson({ progress: createInitialProgress(), currentKana: "あ", stage: "intro" }, { type: "RESUME", progress });
      setState(resumed);
      if (hasStartedLesson(resumed)) {
        const canOpenRequestedWordGarden = requestedRoute === "wordGarden" && selectRoute(resumed.progress).kind === "wordGarden";
        setScreen(canOpenRequestedWordGarden ? "wordGarden" : "garden");
      }
    }).catch(() => {
      // 保存を読めない端末でも、初回導線は継続する。
    }).finally(() => {
      if (!active) return;
      setHasHydrated(true);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [requestedRoute, runtime]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    const generation = persistenceGenerationRef.current;
    void queuePersistence(async () => {
      if (generation !== persistenceGenerationRef.current) return;
      await runtime.progressRepository.save(state.progress);
    }).catch(() => undefined);
  }, [hasHydrated, queuePersistence, runtime, state.progress]);

  useEffect(() => {
    effects.applySettings(state.progress.settings);
  }, [effects, state.progress.settings]);
  useEffect(() => {
    if ((screen === "garden" || screen === "wordGarden") && state.progress.settings.music) void effects.startGardenLoop();
    else effects.stopGardenLoop();
    return () => effects.stopGardenLoop();
  }, [effects, screen, state.progress.settings.music]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audio.cancel();
      effects.stopGardenLoop();
    };
  }, [audio, effects]);

  snapshotRef.current = JSON.stringify({
    coordinateSystem: "DOM viewport: origin top-left, x right, y down",
    route: route.kind,
    screen,
    kana: state.currentKana,
    stage: state.stage,
    promptHasIllustration: state.stage === "shapeMatch",
    choices: state.stage === "shapeMatch" ? createLessonChoices(entry.character) : [],
    guideCount: state.progress.kana[state.currentKana].guideCount,
    wordsUnlocked: isWordGardenUnlocked(state.progress),
  });
  useEffect(() => registerGameTextState(() => snapshotRef.current), []);

  const unlockAudio = (): void => {
    void audio.unlock().then(() => {
      if (!mountedRef.current) return;
      setScreen("watering");
      if (state.progress.settings.speech) void audio.speak("こえが きこえたら、じょうろを さわってね", { interrupt: true });
    }).catch(() => {
      if (mountedRef.current) setScreen("watering");
    });
  };
  const startFirstLesson = (): void => {
    audio.cancel();
    void effects.play("tap");
    dispatch({ type: "START" });
    setScreen("lesson");
  };
  const continueFromGarden = (): void => {
    void effects.play("tap");
    if (route.kind === "rowReview") {
      setScreen("rowReview");
      return;
    }
    if (route.kind === "wordGarden") {
      setScreen("wordGarden");
      return;
    }
    if (!state.progress.kana[state.currentKana].seen) dispatch({ type: "START" });
    setScreen("lesson");
  };
  const handleMainDispatch = (event: LessonEvent): void => {
    const next = reduceLesson(state, event);
    setState(next);
    const completesRowReview = state.progress.rowReview?.step === "sound"
      && ((event.type === "ANSWER_SOUND" && event.correct) || event.type === "SKIP_SOUND_MATCH");
    const continuesRewardIntoWriting = event.type === "CONTINUE"
      && state.stage === "reward"
      && next.currentKana === state.currentKana
      && isWritingStage(next.stage);
    if (((event.type === "CONTINUE" && state.stage === "reward" && !continuesRewardIntoWriting)) || completesRowReview) {
      setScreen(screenForRoute(next));
    }
  };
  const beginReview = (character: KanaCharacter): void => {
    const index = KANA_ORDER.indexOf(character);
    const stage = selectKanaReviewStage(state.progress, character);
    const progress = { ...state.progress, currentKanaIndex: index, stage, rowReview: null, lessonAttempt: null };
    setReviewState({ progress, currentKana: character, stage });
    setScreen("lesson");
  };
  /** 読み上げを止め、通常進捗を変えずに単文字レッスンから庭へ戻る。 */
  const returnFromLesson = (): void => {
    audio.cancel();
    if (reviewState) setReviewState(null);
    setScreen("garden");
  };
  /** 読み上げを止め、行復習の保存stepを変えずに庭へ戻る。 */
  const returnFromRowReview = (): void => {
    audio.cancel();
    setScreen("garden");
  };
  const handleReviewDispatch = (event: LessonEvent): void => {
    if (!reviewState) return;
    const reviewedCharacter = reviewState.currentKana;
    const next = reduceLesson(reviewState, event);
    const updatesWriting = event.type === "COMPLETE_TRACE"
      || event.type === "COMPLETE_COPY"
      || event.type === "COMPLETE_FREE_WRITE"
      || event.type === "SKIP_FREE_WRITE"
      || event.type === "DEFER_WRITING";
    if (updatesWriting) {
      setState((current) => ({
        ...current,
        progress: mergeKanaWritingPractice(
          current.progress,
          reviewedCharacter,
          next.progress.kana[reviewedCharacter],
        ),
      }));
    }
    if (event.type === "SKIP_FREE_WRITE" || event.type === "DEFER_WRITING") {
      setReviewState(null);
      setScreen("garden");
      return;
    }
    if (event.type === "CONTINUE" && reviewState.stage === "reward") {
      if (next.currentKana === reviewedCharacter && isWritingStage(next.stage)) {
        setReviewState(next);
        return;
      }
      setReviewState(null);
      setActiveWordId(null);
      setWordReviewMode(false);
      setScreen("garden");
      return;
    }
    setReviewState(next);
  };
  const changeSettings = (settings: LearningSettings): void => {
    if (resetInFlightRef.current) return;
    setState((current) => {
      const modeAdjusted = current.progress.settings.learningMode === settings.learningMode
        ? current
        : reduceLesson(current, { type: "CHANGE_LEARNING_MODE", mode: settings.learningMode });
      return { ...modeAdjusted, progress: { ...modeAdjusted.progress, settings } };
    });
  };
  /** 書字まで終えた語は同じ花壇の次語へ進み、段階境界だけ庭へ戻す。 */
  const completeWordWriting = (wordId: string): void => {
    dispatch({ type: "COMPLETE_WORD_WRITING", wordId });
    const index = WORD_ENTRIES.findIndex((word) => word.id === wordId);
    const currentWord = WORD_ENTRIES[index];
    const nextWord = WORD_ENTRIES[index + 1];
    if (!currentWord || !nextWord || nextWord.stage !== currentWord.stage) {
      setActiveWordId(null);
      setScreen("wordGarden");
      return;
    }
    setActiveWordId(nextWord.id);
  };
  const reset = async (): Promise<void> => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    persistenceGenerationRef.current += 1;
    try {
      await queuePersistence(() => runtime.progressRepository.reset());
      if (!mountedRef.current) return;
      skipInitialSaveRef.current = true;
      setState({ progress: createInitialProgress(), currentKana: "あ", stage: "intro" });
      setReviewState(null);
      audio.cancel();
      effects.stopGardenLoop();
      setScreen("soundGate");
    } catch (error) {
      const recoveryGeneration = persistenceGenerationRef.current;
      const recoveryProgress = state.progress;
      // reset失敗時はgenerationで除外した最新状態を、同世代で保存し直す。
      void queuePersistence(async () => {
        if (recoveryGeneration !== persistenceGenerationRef.current) return;
        await runtime.progressRepository.save(recoveryProgress);
      }).catch(() => undefined);
      throw error;
    } finally {
      resetInFlightRef.current = false;
    }
  };
  const environment: ParentEnvironment = {
    audioStatus: audio.getStatus(),
    storage: runtime.storageDegraded ? "fallback" : "normal",
    displayMode: getDisplayMode(),
    pwaStatus,
  };
  const wateringCan = getWorldIllustration("watering-can");
  const background = getWorldIllustration("garden-background");

  if (isLoading) return <main className="app-shell" data-testid="app-loading" aria-busy="true" />;
  if (screen === "parent") return <ParentDashboard progress={state.progress} environment={environment} onSettingsChange={changeSettings} onReset={reset} onClose={() => setScreen("garden")} />;
  if (screen === "wordGarden") return <WordGardenScreen progress={state.progress} audio={audio} onStart={(wordId) => { setWordReviewMode(false); setActiveWordId(wordId); setScreen("wordLesson"); }} onReview={(wordId) => { setWordReviewMode(true); setActiveWordId(wordId); setScreen("wordLesson"); }} onBackToGarden={() => { setActiveWordId(null); setWordReviewMode(false); setScreen("garden"); }} />;
  if (screen === "wordLesson" && activeWordId) return <WordLessonScreen progress={state.progress} wordId={activeWordId} audio={audio} reviewMode={wordReviewMode} onSelected={(wordId) => dispatch({ type: "COMPLETE_WORD_SELECTION", wordId })} onArranged={(wordId) => dispatch({ type: "COMPLETE_WORD_ARRANGE", wordId })} onWritten={completeWordWriting} onReturnToGarden={() => { audio.cancel(); setActiveWordId(null); setWordReviewMode(false); setScreen("wordGarden"); }} />;
  if (screen === "rowReview") return <RowReviewScreen state={state} dispatch={handleMainDispatch} audio={audio} onReturnToGarden={returnFromRowReview} />;
  if (screen === "garden") return <GardenScreen progress={state.progress} resumeRoute={route} onContinue={continueFromGarden} onReview={beginReview} onOpenParent={() => setScreen("parent")} />;
  if (screen === "lesson") {
    const displayedState = reviewState ?? state;
    return <LessonScreen state={displayedState} dispatch={reviewState ? handleReviewDispatch : handleMainDispatch} audio={audio} speechEnabled={displayedState.progress.settings.speech} onCelebrate={playLessonSuccess} onReturnToGarden={returnFromLesson} />;
  }
  if (screen === "watering") return <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}><button className="watering-gate" type="button" aria-label="じょうろを さわる" onClick={startFirstLesson}><img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} /></button></main>;
  return <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}><button className="sound-gate" aria-label="こえを きく" type="button" onClick={unlockAudio}><svg className="sound-gate__speakerIcon" aria-hidden="true" viewBox="0 0 64 64" focusable="false"><path d="M10 26h12l16-13v38L22 38H10z" /><path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" /></svg></button></main>;
}
