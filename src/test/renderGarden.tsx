import { render } from "@testing-library/react";

import { App, type AppSoundEffects } from "../app/App";
import type { GameRuntime } from "../app/GameRuntime";
import type { LearningProgress } from "../features/learning/model/types";
import type { AudioGuide } from "../platform/audio/AudioGuide";
import type { ProgressRepository } from "../platform/storage/ProgressRepository";

/** 庭統合テストで保存・音声・効果音をブラウザ実装から隔離した描画結果。 */
export interface RenderGardenResult {
  readonly runtime: GameRuntime;
  readonly repository: ProgressRepository;
  readonly audio: AudioGuide;
  readonly effects: AppSoundEffects;
}

/** 指定進捗をmemory保存と安全な音声・効果音で庭へ描画する。 */
export function renderGarden(progress: LearningProgress): RenderGardenResult {
  let stored = progress;
  const repository: ProgressRepository = {
    load: vi.fn().mockResolvedValue(progress),
    save: vi.fn().mockImplementation(async (next: LearningProgress) => { stored = next; }),
    reset: vi.fn().mockImplementation(async () => { stored = progress; }),
  };
  const runtime: GameRuntime = { progressRepository: repository, storageDegraded: false };
  const audio: AudioGuide = { unlock: vi.fn().mockResolvedValue("ready"), speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(), getStatus: () => "ready" };
  const effects: AppSoundEffects = { applySettings: vi.fn(), startGardenLoop: vi.fn().mockResolvedValue(undefined), stopGardenLoop: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
  render(<App runtime={runtime} audio={audio} effects={effects} />);
  void stored;
  return { runtime, repository, audio, effects };
}
