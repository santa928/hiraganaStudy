import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrowserRuntime } from "../../app/GameRuntime";
import { KANA_ORDER } from "../../features/learning/content/kana";
import { createInitialProgress } from "../../features/learning/model/reducer";
import { progressWithCompletedCount } from "../../test/fixtures/progress";
import type { progressAt } from "../../test/fixtures/progress";
import {
  FALLBACK_PROGRESS_STORAGE_KEY,
  IndexedDbProgressRepository,
  type ProgressEnvelope,
} from "./IndexedDbProgressRepository";

const TEST_DATABASES: string[] = [];

/** 五十音順に先行文字を完了した、実際に再開可能な進捗を作る。 */
function resumableProgressAt(character: (typeof KANA_ORDER)[number], stage: ReturnType<typeof progressAt>["stage"]) {
  return {
    ...progressWithCompletedCount(KANA_ORDER.indexOf(character)),
    currentKanaIndex: KANA_ORDER.indexOf(character),
    stage,
  };
}

/** テスト用IndexedDBを、開いた接続を残さず削除する。 */
function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => resolve());
  });
}

/** 各テストで衝突しないDB名を作る。 */
function testDatabaseName(): string {
  const databaseName = `progress-test-${crypto.randomUUID()}`;
  TEST_DATABASES.push(databaseName);
  return databaseName;
}

afterEach(async () => {
  localStorage.clear();
  await Promise.all(TEST_DATABASES.splice(0).map(deleteDatabase));
});

describe("IndexedDbProgressRepository", () => {
  it("新規利用者には初期進捗を返す", async () => {
    const repository = new IndexedDbProgressRepository(testDatabaseName());

    await expect(repository.load()).resolves.toEqual(createInitialProgress());
  });

  it("保存した現在文字indexと段階を再読込できる", async () => {
    const databaseName = testDatabaseName();
    const saved = resumableProgressAt("く", "traceNarrow");
    const repository = new IndexedDbProgressRepository(databaseName);

    await repository.save(saved);

    await expect(new IndexedDbProgressRepository(databaseName).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
    });
  });

  it("IndexedDBが使えないときは最小の進捗だけをfallbackへ保存して再読込する", async () => {
    const storage = new MapStorage();
    const databaseName = testDatabaseName();
    const repository = new IndexedDbProgressRepository(databaseName, { indexedDb: null, localStorage: storage });
    const progress = {
      ...resumableProgressAt("く", "traceNarrow"),
      name: "保存してはいけない名前",
      strokeHistory: [[{ x: 1, y: 2 }]],
    };

    await repository.save(progress);

    expect(repository.storageDegraded).toBe(true);
    expect(JSON.parse(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null")).toMatchObject({
      revision: expect.any(Number),
      progress: {
        currentKanaIndex: KANA_ORDER.indexOf("く"),
        words: createInitialProgress().words,
      },
    });
    expect(JSON.parse(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null").progress).not.toMatchObject({
      name: "保存してはいけない名前",
      strokeHistory: [[{ x: 1, y: 2 }]],
    });
    await expect(new IndexedDbProgressRepository(databaseName, { indexedDb: null, localStorage: storage }).load())
      .resolves.toMatchObject({ currentKanaIndex: KANA_ORDER.indexOf("く"), stage: "traceNarrow" });
  });

  it("primaryが空で有効なfallbackを採用した場合は保存劣化を通知する", async () => {
    const storage = new MapStorage();
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify({
      revision: 4,
      progress: resumableProgressAt("く", "traceNarrow"),
    }));
    const repository = new IndexedDbProgressRepository(testDatabaseName(), { localStorage: storage });

    await expect(repository.load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
    });
    expect(repository.storageDegraded).toBe(true);
  });

  it("上限revisionのprimaryを破損候補として置換し、安全な世代で再読込する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    await writePrimaryRecord(databaseName, envelope(
      Number.MAX_SAFE_INTEGER,
      100,
      "invalid-limit",
      resumableProgressAt("く", "traceNarrow"),
    ));
    const repository = new IndexedDbProgressRepository(databaseName, { localStorage: storage });

    await repository.save(resumableProgressAt("さ", "soundMatch"));

    expect(await readPrimaryRecord(databaseName)).toMatchObject({
      revision: 1,
      progress: { currentKanaIndex: KANA_ORDER.indexOf("さ"), stage: "soundMatch" },
    });
    await expect(new IndexedDbProgressRepository(databaseName, { localStorage: storage }).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
  });

  it("上限revisionのfallbackを破損候補として置換し、安全な世代で再読込する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(envelope(
      Number.MAX_SAFE_INTEGER,
      100,
      "invalid-limit",
      resumableProgressAt("く", "traceNarrow"),
    )));
    const repository = new IndexedDbProgressRepository(databaseName, { indexedDb: null, localStorage: storage });

    await repository.save(resumableProgressAt("さ", "soundMatch"));

    expect(JSON.parse(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null")).toMatchObject({
      revision: 1,
      progress: { currentKanaIndex: KANA_ORDER.indexOf("さ"), stage: "soundMatch" },
    });
    await expect(new IndexedDbProgressRepository(databaseName, { indexedDb: null, localStorage: storage }).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
  });

  it("同revisionではwrittenAtが新しいfallbackを採用して保存劣化を通知する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    await writePrimaryRecord(databaseName, envelope(8, 100, "primary", resumableProgressAt("く", "traceNarrow")));
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(
      envelope(8, 200, "fallback", resumableProgressAt("さ", "soundMatch")),
    ));
    const repository = new IndexedDbProgressRepository(databaseName, { localStorage: storage });

    await expect(repository.load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
    expect(repository.storageDegraded).toBe(true);
  });

  it("2 repositoryが同じseed revisionで保存しても新しいfallbackを落とさない", async () => {
    const databaseName = testDatabaseName();
    const primaryDraftStorage = new MapStorage();
    const fallbackDraftStorage = new MapStorage();
    const primaryWriter = new IndexedDbProgressRepository(databaseName, {
      indexedDb: null,
      localStorage: primaryDraftStorage,
      now: () => 100,
      createWriteId: () => "primary-writer",
    });
    const fallbackWriter = new IndexedDbProgressRepository(databaseName, {
      indexedDb: null,
      localStorage: fallbackDraftStorage,
      now: () => 200,
      createWriteId: () => "fallback-writer",
    });

    await Promise.all([
      primaryWriter.save(resumableProgressAt("く", "traceNarrow")),
      fallbackWriter.save(resumableProgressAt("さ", "soundMatch")),
    ]);

    const primaryEnvelope = JSON.parse(primaryDraftStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null") as ProgressEnvelope;
    const fallbackEnvelope = JSON.parse(fallbackDraftStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null") as ProgressEnvelope;
    expect(primaryEnvelope.revision).toBe(fallbackEnvelope.revision);
    expect(primaryEnvelope.writtenAt).toBeLessThan(fallbackEnvelope.writtenAt);
    await writePrimaryRecord(databaseName, primaryEnvelope);
    const sharedStorage = new MapStorage();
    sharedStorage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(fallbackEnvelope));
    const reader = new IndexedDbProgressRepository(databaseName, { localStorage: sharedStorage });

    await expect(reader.load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
    expect(reader.storageDegraded).toBe(true);
  });

  it("共有fallbackでは遅い低順位writerが先に保存された高順位Bを上書きしない", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    const delayedPrimary = new DeferredSecondOpenFactory();
    const lowWriter = new IndexedDbProgressRepository(databaseName, {
      indexedDb: delayedPrimary,
      localStorage: storage,
      now: () => 100,
      createWriteId: () => "a-low",
    });
    const lowSave = lowWriter.save(resumableProgressAt("く", "traceNarrow"));
    await delayedPrimary.waitForSecondOpen();

    await new IndexedDbProgressRepository(databaseName, {
      indexedDb: null,
      localStorage: storage,
      now: () => 200,
      createWriteId: () => "b-high",
    }).save(resumableProgressAt("さ", "soundMatch"));
    delayedPrimary.failSecondOpen();
    await lowSave;

    expect(JSON.parse(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null")).toMatchObject({
      progress: { currentKanaIndex: KANA_ORDER.indexOf("さ"), stage: "soundMatch" },
    });
  });

  it("primaryでは遅い低順位writerが先に保存された高順位Bを上書きしない", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    const delayedPrimary = new DeferredSecondOpenFactory();
    const lowWriter = new IndexedDbProgressRepository(databaseName, {
      indexedDb: delayedPrimary,
      localStorage: storage,
      now: () => 100,
      createWriteId: () => "a-low",
    });
    const lowSave = lowWriter.save(resumableProgressAt("く", "traceNarrow"));
    await delayedPrimary.waitForSecondOpen();

    await new IndexedDbProgressRepository(databaseName, {
      localStorage: storage,
      now: () => 200,
      createWriteId: () => "b-high",
    }).save(resumableProgressAt("さ", "soundMatch"));
    await delayedPrimary.succeedSecondOpen();
    await lowSave;

    await expect(new IndexedDbProgressRepository(databaseName, { localStorage: storage }).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
  });

  it("同revisionではwrittenAtが新しいprimaryを採用する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    await writePrimaryRecord(databaseName, envelope(8, 200, "primary", resumableProgressAt("く", "traceNarrow")));
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(
      envelope(8, 100, "fallback", resumableProgressAt("さ", "soundMatch")),
    ));
    const repository = new IndexedDbProgressRepository(databaseName, { localStorage: storage });

    await expect(repository.load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
    });
    expect(repository.storageDegraded).toBe(false);
  });

  it("同revision・同timestampではwriteIdが大きいfallbackを決定的に採用する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    await writePrimaryRecord(databaseName, envelope(8, 100, "a-primary", resumableProgressAt("く", "traceNarrow")));
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(
      envelope(8, 100, "z-fallback", resumableProgressAt("さ", "soundMatch")),
    ));

    await expect(new IndexedDbProgressRepository(databaseName, { localStorage: storage }).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
  });

  it("putだけが失敗しても新しいfallback世代を古いprimaryより優先して再開する", async () => {
    const databaseName = testDatabaseName();
    const storage = new MapStorage();
    const oldProgress = resumableProgressAt("く", "traceNarrow");
    const fallbackProgress = resumableProgressAt("さ", "soundMatch");
    const finalProgress = resumableProgressAt("た", "traceWide");

    await new IndexedDbProgressRepository(databaseName, { localStorage: storage }).save(oldProgress);
    await new IndexedDbProgressRepository(databaseName, {
      indexedDb: createPutFailingFactory(),
      localStorage: storage,
    }).save(fallbackProgress);

    const fallbackWinner = new IndexedDbProgressRepository(databaseName, { localStorage: storage });
    await expect(fallbackWinner.load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("さ"),
      stage: "soundMatch",
    });
    expect(fallbackWinner.storageDegraded).toBe(true);

    const primaryRecovery = new IndexedDbProgressRepository(databaseName, { localStorage: storage });
    await primaryRecovery.save(finalProgress);
    await expect(new IndexedDbProgressRepository(databaseName, { localStorage: storage }).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("た"),
      stage: "traceWide",
    });
    expect(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY)).toBeNull();
  });

  it("旧形式のraw v1 LearningProgressも再読込できる", async () => {
    const databaseName = testDatabaseName();
    await writePrimaryRecord(databaseName, resumableProgressAt("く", "traceNarrow"));

    await expect(new IndexedDbProgressRepository(databaseName).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
    });
  });

  it("壊れたfallback JSONでも例外を出さず初期進捗を返す", async () => {
    const storage = new MapStorage();
    storage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, "{");
    const repository = new IndexedDbProgressRepository(testDatabaseName(), { indexedDb: null, localStorage: storage });

    await expect(repository.load()).resolves.toEqual(createInitialProgress());
    expect(repository.storageDegraded).toBe(true);
  });

  it("resetはprimaryとfallbackの両方を消し、次回は新規進捗を返す", async () => {
    const databaseName = testDatabaseName();
    const repository = new IndexedDbProgressRepository(databaseName);
    await repository.save(resumableProgressAt("く", "traceNarrow"));
    localStorage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(resumableProgressAt("さ", "soundMatch")));

    await repository.reset();

    expect(localStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY)).toBeNull();
    await expect(new IndexedDbProgressRepository(databaseName).load()).resolves.toEqual(createInitialProgress());
  });

  it("resetで保存先の削除に失敗した時は、保護者画面が進捗を保持できるよう失敗を返す", async () => {
    const repository = new IndexedDbProgressRepository(testDatabaseName(), {
      indexedDb: null,
      localStorage: new ThrowingStorage(),
    });

    await expect(repository.reset()).rejects.toThrow("リセット");
    expect(repository.storageDegraded).toBe(true);
  });

  it("両保存先が失敗してもsaveは例外を出さず、ランタイムへ劣化状態を公開する", async () => {
    const runtime = createBrowserRuntime({
      databaseName: testDatabaseName(),
      indexedDb: null,
      localStorage: new ThrowingStorage(),
    });

    await expect(runtime.progressRepository.save(resumableProgressAt("く", "traceNarrow"))).resolves.toBeUndefined();
    expect(runtime.storageDegraded).toBe(true);
  });

  it("openDatabaseがblockedでも待ち続けず、遅れて開いた接続を閉じて初期進捗へ戻る", async () => {
    const request = new EventTarget() as IDBOpenDBRequest;
    const close = vi.fn();
    Object.defineProperty(request, "result", { value: { close } });
    const repository = new IndexedDbProgressRepository(testDatabaseName(), {
      indexedDb: { open: () => request } as unknown as IDBFactory,
      localStorage: null,
    });
    const loading = repository.load();

    request.dispatchEvent(new Event("blocked"));

    await expect(loading).resolves.toEqual(createInitialProgress());
    request.dispatchEvent(new Event("success"));
    expect(close).toHaveBeenCalledOnce();
    expect(repository.storageDegraded).toBe(true);
  });
});

/** 実際の読み取りは通しつつ、readwrite transactionのputだけを失敗させるIDB factoryを作る。 */
function createPutFailingFactory(): IDBFactory {
  return {
    open(...parameters: Parameters<IDBFactory["open"]>): IDBOpenDBRequest {
      const request = indexedDB.open(...parameters);

      request.addEventListener("success", () => {
        const database = request.result;
        const transaction = database.transaction.bind(database);
        Object.defineProperty(database, "transaction", {
          configurable: true,
          value: (storeNames: string | string[], mode?: IDBTransactionMode) => {
            const current = transaction(storeNames, mode);
            if (mode !== "readwrite") return current;

            const objectStore = current.objectStore.bind(current);
            Object.defineProperty(current, "objectStore", {
              configurable: true,
              value: (name: string) => {
                const store = objectStore(name);
                return new Proxy(store, {
                  get(target, property, receiver) {
                    if (property === "put") return () => { throw new Error("put failed"); };
                    return Reflect.get(target, property, receiver);
                  },
                });
              },
            });
            return current;
          },
        });
      });

      return request;
    },
  } as IDBFactory;
}

/** 旧形式との後方互換テスト用に、primaryへraw progressを直接書き込む。 */
function writePrimaryRecord(databaseName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.addEventListener("upgradeneeded", () => {
      if (!open.result.objectStoreNames.contains("progress")) open.result.createObjectStore("progress");
    });
    open.addEventListener("error", () => reject(open.error));
    open.addEventListener("success", () => {
      const database = open.result;
      const transaction = database.transaction("progress", "readwrite");
      transaction.objectStore("progress").put(value, "active");
      transaction.addEventListener("complete", () => {
        database.close();
        resolve();
      });
      transaction.addEventListener("error", () => reject(transaction.error));
    });
  });
}

/** primaryの保存値をpublic loadとは独立して検査する。 */
function readPrimaryRecord(databaseName: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.addEventListener("error", () => reject(open.error));
    open.addEventListener("success", () => {
      const database = open.result;
      const transaction = database.transaction("progress", "readonly");
      const request = transaction.objectStore("progress").get("active");
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
      transaction.addEventListener("complete", () => database.close());
    });
  });
}

/** 比較順テスト用に、保存メタデータを明示したenvelopeを作る。 */
function envelope(
  revision: number,
  writtenAt: number,
  writeId: string,
  progress: ReturnType<typeof resumableProgressAt>,
): ProgressEnvelope {
  return { revision, writtenAt, writeId, progress };
}

/** 1回目だけ実IndexedDBを開き、2回目のopenをテストが成功・失敗へ制御できるfactory。 */
class DeferredSecondOpenFactory implements IDBFactory {
  private readonly secondOpenReady: Promise<void>;
  private resolveSecondOpenReady: (() => void) | null = null;
  private openParameters: Parameters<IDBFactory["open"]> | null = null;
  private secondOpenRequest: IDBOpenDBRequest | null = null;
  private openCount = 0;

  public constructor() {
    this.secondOpenReady = new Promise((resolve) => {
      this.resolveSecondOpenReady = resolve;
    });
  }

  public open(...parameters: Parameters<IDBFactory["open"]>): IDBOpenDBRequest {
    this.openCount += 1;
    if (this.openCount !== 2) return indexedDB.open(...parameters);

    this.openParameters = parameters;
    this.secondOpenRequest = new EventTarget() as IDBOpenDBRequest;
    this.resolveSecondOpenReady?.();
    return this.secondOpenRequest;
  }

  public async waitForSecondOpen(): Promise<void> {
    await this.secondOpenReady;
  }

  public failSecondOpen(): void {
    const request = this.requireSecondOpenRequest();
    request.dispatchEvent(new Event("error"));
  }

  public async succeedSecondOpen(): Promise<void> {
    const request = this.requireSecondOpenRequest();
    const parameters = this.openParameters;
    if (!parameters) throw new Error("Delayed open parameters are missing.");
    const nativeRequest = indexedDB.open(...parameters);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      nativeRequest.addEventListener("success", () => resolve(nativeRequest.result));
      nativeRequest.addEventListener("error", () => reject(nativeRequest.error));
    });

    Object.defineProperty(request, "result", { value: database });
    request.dispatchEvent(new Event("success"));
  }

  public cmp(): number { return 0; }
  public deleteDatabase(): IDBOpenDBRequest { throw new Error("Not implemented for this test factory."); }
  public databases(): Promise<IDBDatabaseInfo[]> { return Promise.resolve([]); }

  private requireSecondOpenRequest(): IDBOpenDBRequest {
    if (!this.secondOpenRequest) throw new Error("Delayed open request is missing.");
    return this.secondOpenRequest;
  }
}

/** ブラウザStorageと同じ振る舞いを持つ、テスト専用の小さなメモリ実装。 */
class MapStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

/** 容量超過など、どの操作でも失敗するStorageを表すテスト用実装。 */
class ThrowingStorage implements Storage {
  public get length(): number {
    return 0;
  }

  public clear(): void {
    throw new Error("Storage is unavailable");
  }

  public getItem(): string | null {
    throw new Error("Storage is unavailable");
  }

  public key(): string | null {
    throw new Error("Storage is unavailable");
  }

  public removeItem(): void {
    throw new Error("Storage is unavailable");
  }

  public setItem(): void {
    throw new Error("Storage is unavailable");
  }
}
