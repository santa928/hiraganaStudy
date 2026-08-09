import { createInitialProgress } from "../../features/learning/model/reducer";
import type { LearningProgress } from "../../features/learning/model/types";
import type { ProgressRepository } from "./ProgressRepository";
import { repairProgress } from "./repairProgress";

/** ブラウザ標準の主保存先に使うIndexedDB名。 */
export const PROGRESS_DATABASE_NAME = "hiragana-no-niwa";
/** IndexedDBの進捗object store名。 */
export const PROGRESS_OBJECT_STORE_NAME = "progress";
/** IndexedDB内のアクティブ進捗キー。 */
export const PROGRESS_RECORD_KEY = "active";
/** IndexedDB障害時に使う小さなlocalStorageキー。 */
export const FALLBACK_PROGRESS_STORAGE_KEY = "hiragana-no-niwa:progress:v1";

/** テストまたは埋め込み環境でブラウザ保存APIを差し替える依存。 */
export interface ProgressRepositoryDependencies {
  readonly indexedDb?: IDBFactory | null;
  readonly localStorage?: Storage | null;
}

/** IndexedDBを開く処理をPromiseへ変換する。 */
function openDatabase(indexedDb: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;

    try {
      request = indexedDb.open(databaseName, 1);
    } catch (error) {
      reject(error);
      return;
    }

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROGRESS_OBJECT_STORE_NAME)) {
        database.createObjectStore(PROGRESS_OBJECT_STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDBを開けませんでした。")));
  });
}

/** IndexedDBリクエストの成功・失敗をPromiseへ変換する。 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB操作に失敗しました。")));
  });
}

/** transactionの完了を待ち、abortを保存失敗として扱う。 */
function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transactionが中断されました。")));
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transactionに失敗しました。")));
  });
}

/** ブラウザのStorage取得自体が例外になる環境を安全に扱う。 */
function getBrowserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** IndexedDBを主保存先、localStorageを障害時の代替先として扱う進捗リポジトリ。 */
export class IndexedDbProgressRepository implements ProgressRepository {
  private readonly databaseName: string;
  private readonly indexedDb: IDBFactory | null;
  private readonly fallbackStorage: Storage | null;
  private isStorageDegraded = false;

  /** テスト用DB名・依存差し替えを許可しつつ、通常はブラウザ既定の保存APIを使う。 */
  public constructor(
    databaseName = PROGRESS_DATABASE_NAME,
    dependencies: ProgressRepositoryDependencies = {},
  ) {
    this.databaseName = databaseName;
    this.indexedDb = "indexedDb" in dependencies ? dependencies.indexedDb ?? null : globalThis.indexedDB ?? null;
    this.fallbackStorage = "localStorage" in dependencies ? dependencies.localStorage ?? null : getBrowserLocalStorage();
  }

  /** 主保存先または代替保存先で障害が起きたかを返す。現在セッション中はtrueを維持する。 */
  public get storageDegraded(): boolean {
    return this.isStorageDegraded;
  }

  /** 主保存を読み、保存がない場合または障害時は代替保存から安全に復元する。 */
  public async load(): Promise<LearningProgress> {
    try {
      const saved = await this.readPrimary();
      if (saved !== undefined) return repairProgress(saved);
    } catch {
      this.markStorageDegraded();
    }

    return this.readFallback();
  }

  /** 主保存に書き込み、失敗した場合だけ代替保存へ既知の最小進捗を書き込む。 */
  public async save(progress: LearningProgress): Promise<void> {
    const repaired = repairProgress(progress);

    try {
      await this.writePrimary(repaired);
      return;
    } catch {
      this.markStorageDegraded();
    }

    try {
      if (!this.fallbackStorage) throw new Error("localStorageを利用できません。");
      this.fallbackStorage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(repaired));
    } catch {
      this.markStorageDegraded();
    }
  }

  /** 主保存と代替保存を独立して削除し、片方の失敗で残りの削除を止めない。 */
  public async reset(): Promise<void> {
    const results = await Promise.allSettled([this.deletePrimary(), this.deleteFallback()]);

    if (results.some((result) => result.status === "rejected")) this.markStorageDegraded();
  }

  /** IndexedDBのアクティブレコードを読み出す。 */
  private async readPrimary(): Promise<unknown | undefined> {
    const database = await this.requireDatabase();

    try {
      const transaction = database.transaction(PROGRESS_OBJECT_STORE_NAME, "readonly");
      const completed = transactionResult(transaction);
      const request = transaction.objectStore(PROGRESS_OBJECT_STORE_NAME).get(PROGRESS_RECORD_KEY);
      const [value] = await Promise.all([requestResult(request), completed]);
      return value;
    } finally {
      database.close();
    }
  }

  /** IndexedDBのアクティブレコードを安全な保存形式で書き込む。 */
  private async writePrimary(progress: LearningProgress): Promise<void> {
    const database = await this.requireDatabase();

    try {
      const transaction = database.transaction(PROGRESS_OBJECT_STORE_NAME, "readwrite");
      const completed = transactionResult(transaction);
      const request = transaction.objectStore(PROGRESS_OBJECT_STORE_NAME).put(progress, PROGRESS_RECORD_KEY);
      await Promise.all([requestResult(request), completed]);
    } finally {
      database.close();
    }
  }

  /** IndexedDBのアクティブレコードを削除する。 */
  private async deletePrimary(): Promise<void> {
    const database = await this.requireDatabase();

    try {
      const transaction = database.transaction(PROGRESS_OBJECT_STORE_NAME, "readwrite");
      const completed = transactionResult(transaction);
      const request = transaction.objectStore(PROGRESS_OBJECT_STORE_NAME).delete(PROGRESS_RECORD_KEY);
      await Promise.all([requestResult(request), completed]);
    } finally {
      database.close();
    }
  }

  /** 代替JSONを読み、破損・容量制限などの失敗を初期状態へ閉じ込める。 */
  private readFallback(): LearningProgress {
    try {
      if (!this.fallbackStorage) throw new Error("localStorageを利用できません。");
      const raw = this.fallbackStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY);
      return raw === null ? createInitialProgress() : repairProgress(JSON.parse(raw) as unknown);
    } catch {
      this.markStorageDegraded();
      return createInitialProgress();
    }
  }

  /** 代替保存を削除する。 */
  private async deleteFallback(): Promise<void> {
    if (!this.fallbackStorage) throw new Error("localStorageを利用できません。");
    this.fallbackStorage.removeItem(FALLBACK_PROGRESS_STORAGE_KEY);
  }

  /** 利用可能なIndexedDBを返し、未対応環境は保存失敗として扱う。 */
  private async requireDatabase(): Promise<IDBDatabase> {
    if (!this.indexedDb) throw new Error("IndexedDBを利用できません。");
    return openDatabase(this.indexedDb, this.databaseName);
  }

  /** 保護者UI用の劣化状態を一度だけ有効にする。 */
  private markStorageDegraded(): void {
    this.isStorageDegraded = true;
  }
}
