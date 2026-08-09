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

/** 保存先の世代逆転を防ぐ、後方互換な進捗レコード。 */
export interface ProgressEnvelope {
  readonly revision: number;
  readonly progress: LearningProgress;
}

/** テストまたは埋め込み環境でブラウザ保存APIを差し替える依存。 */
export interface ProgressRepositoryDependencies {
  readonly indexedDb?: IDBFactory | null;
  readonly localStorage?: Storage | null;
}

interface ProgressCandidate {
  readonly revision: number;
  readonly progress: unknown;
}

interface ReadOutcome {
  readonly candidate: ProgressCandidate | null;
  readonly failed: boolean;
}

/** 保存値の型境界で、配列を除くオブジェクトかを判定する。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 旧形式の生進捗とrevision付きレコードを同じ候補表現へ変換する。 */
function toCandidate(value: unknown): ProgressCandidate | null {
  if (value === undefined) return null;

  if (
    isRecord(value)
    && typeof value.revision === "number"
    && Number.isSafeInteger(value.revision)
    && value.revision > 0
    && Object.hasOwn(value, "progress")
  ) {
    return { revision: value.revision, progress: value.progress };
  }

  return { revision: 0, progress: value };
}

/** IndexedDBを開く処理をPromiseへ変換し、blocked時に遅延接続を閉じる。 */
function openDatabase(indexedDb: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;

    const rejectOnce = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      reject(reason);
    };

    try {
      request = indexedDb.open(databaseName, 1);
    } catch (error) {
      rejectOnce(error);
      return;
    }

    request.addEventListener("upgradeneeded", () => {
      if (settled) return;
      const database = request.result;
      if (!database.objectStoreNames.contains(PROGRESS_OBJECT_STORE_NAME)) {
        database.createObjectStore(PROGRESS_OBJECT_STORE_NAME);
      }
    });
    request.addEventListener("blocked", () => {
      rejectOnce(new Error("IndexedDBを開けませんでした。ほかの画面を閉じてください。"));
    });
    request.addEventListener("success", () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    });
    request.addEventListener("error", () => rejectOnce(request.error ?? new Error("IndexedDBを開けませんでした。")));
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
  private latestRevision = 0;

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

  /** 両保存先を比較し、より新しい進捗を安全に復元する。 */
  public async load(): Promise<LearningProgress> {
    const [primary, fallback] = await Promise.all([this.readPrimaryOutcome(), this.readFallbackOutcome()]);
    const selected = this.selectNewest(primary.candidate, fallback.candidate);

    if (!selected) {
      if (primary.failed || fallback.failed) this.markStorageDegraded();
      return createInitialProgress();
    }

    if (selected === fallback.candidate) this.markStorageDegraded();
    return repairProgress(selected.progress);
  }

  /** 主保存に書き込み、失敗時は同一世代の進捗を代替保存へ書き込む。 */
  public async save(progress: LearningProgress): Promise<void> {
    const envelope = await this.createNextEnvelope(progress);

    try {
      await this.writePrimary(envelope);
      await this.deleteFallbackBestEffort();
      return;
    } catch {
      this.markStorageDegraded();
    }

    try {
      if (!this.fallbackStorage) throw new Error("localStorageを利用できません。");
      this.fallbackStorage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      this.markStorageDegraded();
    }
  }

  /** 主保存と代替保存を独立して削除し、片方の失敗で残りの削除を止めない。 */
  public async reset(): Promise<void> {
    const results = await Promise.allSettled([this.deletePrimary(), this.deleteFallback()]);

    if (results.some((result) => result.status === "rejected")) this.markStorageDegraded();
  }

  /** 既存世代をseedし、時計に依存しない単調増加revisionを割り当てる。 */
  private async createNextEnvelope(progress: LearningProgress): Promise<ProgressEnvelope> {
    const [primary, fallback] = await Promise.all([this.readPrimaryOutcome(), this.readFallbackOutcome()]);
    const previousRevision = Math.max(
      this.latestRevision,
      primary.candidate?.revision ?? 0,
      fallback.candidate?.revision ?? 0,
    );
    this.latestRevision = previousRevision + 1;

    if (primary.failed) this.markStorageDegraded();

    return { revision: this.latestRevision, progress: repairProgress(progress) };
  }

  /** 新旧候補のうちrevisionが大きい方を選び、同値ではprimaryを優先する。 */
  private selectNewest(primary: ProgressCandidate | null, fallback: ProgressCandidate | null): ProgressCandidate | null {
    if (!primary) return fallback;
    if (!fallback || primary.revision >= fallback.revision) return primary;
    return fallback;
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

  /** 主保存の読み取り失敗をload/save内部で扱える結果へ変換する。 */
  private async readPrimaryOutcome(): Promise<ReadOutcome> {
    try {
      return { candidate: toCandidate(await this.readPrimary()), failed: false };
    } catch {
      return { candidate: null, failed: true };
    }
  }

  /** IndexedDBのアクティブレコードを安全な保存形式で書き込む。 */
  private async writePrimary(envelope: ProgressEnvelope): Promise<void> {
    const database = await this.requireDatabase();

    try {
      const transaction = database.transaction(PROGRESS_OBJECT_STORE_NAME, "readwrite");
      const completed = transactionResult(transaction);
      const request = transaction.objectStore(PROGRESS_OBJECT_STORE_NAME).put(envelope, PROGRESS_RECORD_KEY);
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

  /** localStorageの生値を旧形式・envelope両対応の候補へ変換する。 */
  private readFallbackOutcome(): ReadOutcome {
    try {
      if (!this.fallbackStorage) throw new Error("localStorageを利用できません。");
      const raw = this.fallbackStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY);
      return { candidate: raw === null ? null : toCandidate(JSON.parse(raw) as unknown), failed: false };
    } catch {
      return { candidate: null, failed: true };
    }
  }

  /** primary成功後に古い代替保存を削除する。失敗しても新しいprimaryは有効なままにする。 */
  private async deleteFallbackBestEffort(): Promise<void> {
    try {
      await this.deleteFallback();
    } catch {
      // primaryの新しいrevisionを優先できるため、ここではセッションを劣化扱いにしない。
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
