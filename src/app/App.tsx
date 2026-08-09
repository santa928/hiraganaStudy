import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import { registerGameTextState } from "./gameTestHooks";
import { createBrowserRuntime, type GameRuntime } from "./GameRuntime";
import { GardenScreen } from "../features/garden/GardenScreen";
import { RowReviewScreen } from "../features/garden/RowReviewScreen";
import { KANA_ORDER, findKana } from "../features/learning/content/kana";
import { getWorldIllustration } from "../features/learning/content/assetCatalog";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import { isWordGardenUnlocked, selectRoute } from "../features/learning/model/selectors";
import type { KanaCharacter } from "../features/learning/content/types";
import type { LearningSettings, LearningState, LessonEvent } from "../features/learning/model/types";
import { LessonScreen, createLessonChoices } from "../features/lesson/LessonScreen";
import { ParentDashboard, type ParentEnvironment } from "../features/parent/ParentDashboard";
import { BrowserSpeechGuide } from "../platform/audio/BrowserSpeechGuide";
import type { AudioGuide } from "../platform/audio/AudioGuide";
import { SoundEffects } from "../platform/audio/SoundEffects";

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
}

type EntryScreen = "soundGate" | "watering" | "garden" | "lesson" | "rowReview" | "parent";

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
export function App({ runtime: suppliedRuntime, audio: suppliedAudio, effects: suppliedEffects }: AppProps = {}): JSX.Element {
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

  const dispatch = useCallback((event: LessonEvent): void => {
    setState((current) => reduceLesson(current, event));
  }, []);

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
      if (hasStartedLesson(resumed)) setScreen("garden");
    }).catch(() => {
      // 保存を読めない端末でも、初回導線は継続する。
    }).finally(() => {
      if (!active) return;
      setHasHydrated(true);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [runtime]);

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
    if (screen === "garden" && state.progress.settings.music) void effects.startGardenLoop();
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
    promptHasIllustration: state.stage === "shapeMatch" || state.stage === "soundMatch",
    choices: state.stage === "shapeMatch" || state.stage === "soundMatch" ? createLessonChoices(entry.character) : [],
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
    if (route.kind === "wordGarden") return;
    if (!state.progress.kana[state.currentKana].seen) dispatch({ type: "START" });
    setScreen("lesson");
  };
  const handleMainDispatch = (event: LessonEvent): void => {
    const next = reduceLesson(state, event);
    setState(next);
    if ((event.type === "CONTINUE" && state.stage === "reward") || (event.type === "ANSWER_SOUND" && event.correct && state.progress.rowReview?.step === "sound")) {
      setScreen(screenForRoute(next));
    }
    if ((event.type === "ANSWER_SHAPE" || event.type === "ANSWER_SOUND") && event.correct) void effects.play("success");
  };
  const beginReview = (character: KanaCharacter): void => {
    const index = KANA_ORDER.indexOf(character);
    const progress = { ...state.progress, currentKanaIndex: index, stage: "intro" as const, rowReview: null, lessonAttempt: null };
    setReviewState({ progress, currentKana: character, stage: "intro" });
    setScreen("lesson");
  };
  const handleReviewDispatch = (event: LessonEvent): void => {
    if (!reviewState) return;
    if (event.type === "CONTINUE" && reviewState.stage === "reward") {
      setReviewState(null);
      setScreen("garden");
      return;
    }
    setReviewState(reduceLesson(reviewState, event));
  };
  const changeSettings = (settings: LearningSettings): void => {
    if (resetInFlightRef.current) return;
    setState((current) => ({ ...current, progress: { ...current.progress, settings } }));
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
    pwaStatus: "未確認",
  };
  const wateringCan = getWorldIllustration("watering-can");
  const background = getWorldIllustration("garden-background");

  if (isLoading) return <main className="app-shell" data-testid="app-loading" aria-busy="true" />;
  if (screen === "parent") return <ParentDashboard progress={state.progress} environment={environment} onSettingsChange={changeSettings} onReset={reset} onClose={() => setScreen("garden")} />;
  if (screen === "rowReview") return <RowReviewScreen state={state} dispatch={handleMainDispatch} audio={audio} />;
  if (screen === "garden") return <GardenScreen progress={state.progress} resumeRoute={route} onContinue={continueFromGarden} onReview={beginReview} onOpenParent={() => setScreen("parent")} />;
  if (screen === "lesson") {
    const displayedState = reviewState ?? state;
    return <LessonScreen state={displayedState} dispatch={reviewState ? handleReviewDispatch : handleMainDispatch} audio={audio} speechEnabled={displayedState.progress.settings.speech} onReturnToGarden={reviewState ? () => { setReviewState(null); setScreen("garden"); } : undefined} />;
  }
  if (screen === "watering") return <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}><button className="watering-gate" type="button" aria-label="じょうろを さわる" onClick={startFirstLesson}><img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} /></button></main>;
  return <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}><button className="sound-gate" aria-label="こえを きく" type="button" onClick={unlockAudio}><svg className="sound-gate__speakerIcon" aria-hidden="true" viewBox="0 0 64 64" focusable="false"><path d="M10 26h12l16-13v38L22 38H10z" /><path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" /></svg></button></main>;
}
