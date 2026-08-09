import {
  IndexedDbProgressRepository,
  type ProgressRepositoryDependencies,
} from "../platform/storage/IndexedDbProgressRepository";
import type { ProgressRepository } from "../platform/storage/ProgressRepository";

/** 画面層へ渡す、ブラウザ依存を閉じ込めた実行時サービス。 */
export interface GameRuntime {
  readonly progressRepository: ProgressRepository;
  readonly storageDegraded: boolean;
}

/** ブラウザ用ランタイムを組み立てる際の、テスト可能な保存依存設定。 */
export interface BrowserRuntimeOptions extends ProgressRepositoryDependencies {
  readonly databaseName?: string;
}

/** ブラウザ保存を組み立て、保存劣化を保護者UIへ公開するランタイムを作る。 */
export function createBrowserRuntime(options: BrowserRuntimeOptions = {}): GameRuntime {
  const repository = new IndexedDbProgressRepository(options.databaseName, options);

  return {
    progressRepository: repository,
    get storageDegraded(): boolean {
      return repository.storageDegraded;
    },
  };
}
