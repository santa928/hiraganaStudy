import { render } from "@testing-library/react";
import { vi } from "vitest";

import { App, type AppSoundEffects } from "../app/App";
import type { GameRuntime } from "../app/GameRuntime";
import type { LearningProgress } from "../features/learning/model/types";
import type { LearningRoute } from "../features/learning/model/types";
import type { AudioGuide } from "../platform/audio/AudioGuide";

/**
 * 保存済み進捗を注入して、アプリ全体の経路を描画するテスト補助。
 *
 * requestedRouteはURL復元を模した入力で、Appが学習進捗の到達条件と照合して採否を決める。
 */
export function renderApp({ progress, requestedRoute }: { readonly progress: LearningProgress; readonly requestedRoute?: LearningRoute["kind"] }) {
  const runtime: GameRuntime = {
    progressRepository: { load: vi.fn().mockResolvedValue(progress), save: vi.fn().mockResolvedValue(undefined), reset: vi.fn().mockResolvedValue(undefined) },
    storageDegraded: false,
  };
  const audio: AudioGuide = { cancel: vi.fn(), getStatus: () => "visual-only", unlock: vi.fn().mockResolvedValue("visual-only"), speak: vi.fn().mockResolvedValue(undefined) };
  const effects: AppSoundEffects = { applySettings: vi.fn(), startGardenLoop: vi.fn().mockResolvedValue(undefined), stopGardenLoop: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
  return render(<App runtime={runtime} audio={audio} effects={effects} requestedRoute={requestedRoute} />);
}
