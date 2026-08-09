import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import { registerGameTextState } from "./gameTestHooks";
import { createBrowserRuntime, type GameRuntime } from "./GameRuntime";
import { createLessonChoices, LessonScreen } from "../features/lesson/LessonScreen";
import { findKana } from "../features/learning/content/kana";
import { getWorldIllustration } from "../features/learning/content/assetCatalog";
import { createInitialProgress, reduceLesson } from "../features/learning/model/reducer";
import { isWordGardenUnlocked, selectRoute } from "../features/learning/model/selectors";
import type { LearningState, LessonEvent } from "../features/learning/model/types";
import { BrowserSpeechGuide } from "../platform/audio/BrowserSpeechGuide";
import type { AudioGuide } from "../platform/audio/AudioGuide";

export interface AppProps {
  /** テストでIndexedDB実体へ依存しないためのランタイム差し替え口。 */
  readonly runtime?: GameRuntime;
  /** 音声不可・競合をテスト可能にするための案内差し替え口。 */
  readonly audio?: AudioGuide;
}

type EntryScreen = "soundGate" | "watering" | "lesson";

/** 初回か、保存済みのレッスンを再開すべきかを保存進捗だけから判定する。 */
function hasStartedLesson(state: LearningState): boolean {
  return Object.values(state.progress.kana).some((kana) => kana.seen);
}

/** 初回音声確認、端末保存、ひと文字レッスンを接続するアプリの実行ルート。 */
export function App({ runtime: suppliedRuntime, audio: suppliedAudio }: AppProps = {}): JSX.Element {
  const runtimeRef = useRef<GameRuntime | null>(null);
  if (runtimeRef.current === null) runtimeRef.current = suppliedRuntime ?? createBrowserRuntime();
  const audioRef = useRef<AudioGuide | null>(null);
  if (audioRef.current === null) audioRef.current = suppliedAudio ?? new BrowserSpeechGuide();
  const runtime = runtimeRef.current;
  const audio = audioRef.current;
  const [state, setState] = useState<LearningState>(() => reduceLesson(
    { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
    { type: "RESUME", progress: createInitialProgress() },
  ));
  const [screen, setScreen] = useState<EntryScreen>("soundGate");
  const [isLoading, setIsLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const skipInitialSaveRef = useRef(false);
  const snapshotRef = useRef("{}");
  const mountedRef = useRef(true);
  const route = selectRoute(state.progress);
  const entry = useMemo(() => findKana(state.currentKana), [state.currentKana]);

  const dispatch = useCallback((event: LessonEvent): void => {
    setState((current) => reduceLesson(current, event));
  }, []);

  useEffect(() => {
    let active = true;
    void runtime.progressRepository.load()
      .then((progress) => {
        if (!active) return;
        skipInitialSaveRef.current = true;
        const resumed = reduceLesson(
          { progress: createInitialProgress(), currentKana: "あ", stage: "intro" },
          { type: "RESUME", progress },
        );
        setState(resumed);
        if (hasStartedLesson(resumed)) setScreen("lesson");
      })
      .catch(() => {
        // 保存が壊れていても、初回の遊びを止めない。
      })
      .finally(() => {
        if (!active) return;
        setHasHydrated(true);
        setIsLoading(false);
      });
    return () => { active = false; };
  // runtimeはuseRefで起動中に固定するため、StrictModeでも同じ保存先を使う。
  }, [runtime]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }
    void runtime.progressRepository.save(state.progress).catch(() => undefined);
  }, [hasHydrated, runtime, state.progress]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audio.cancel();
    };
  }, [audio]);

  snapshotRef.current = JSON.stringify({
    coordinateSystem: "DOM viewport: origin top-left, x right, y down",
    route: route.kind,
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
      const message = "こえが きこえたら、じょうろを さわってね";
      void audio.speak(message, { interrupt: true });
    }).catch(() => {
      if (mountedRef.current) setScreen("watering");
    });
  };
  const startLesson = (): void => {
    audio.cancel();
    dispatch({ type: "START" });
    setScreen("lesson");
  };
  const wateringCan = getWorldIllustration("watering-can");
  const background = getWorldIllustration("garden-background");

  if (isLoading) return <main className="app-shell" data-testid="app-loading" aria-busy="true" />;
  if (screen === "lesson") return <LessonScreen state={state} dispatch={dispatch} audio={audio} />;
  if (screen === "watering") {
    return (
      <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}>
        <button className="watering-gate" type="button" aria-label="じょうろを さわる" onClick={startLesson}>
          <img src={wateringCan.src} alt="" width={wateringCan.width} height={wateringCan.height} />
        </button>
      </main>
    );
  }
  return (
    <main className="app-shell app-shell--garden" style={{ backgroundImage: `url(${background.src})` }}>
      <button className="sound-gate" aria-label="こえを きく" type="button" onClick={unlockAudio}>
        <svg className="sound-gate__speakerIcon" aria-hidden="true" viewBox="0 0 64 64" focusable="false">
          <path d="M10 26h12l16-13v38L22 38H10z" />
          <path d="M45 23c5 5 5 13 0 18M51 16c9 9 9 23 0 32" />
        </svg>
      </button>
    </main>
  );
}
