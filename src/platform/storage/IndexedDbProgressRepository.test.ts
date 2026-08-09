import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { createBrowserRuntime } from "../../app/GameRuntime";
import { KANA_ORDER } from "../../features/learning/content/kana";
import { createInitialProgress } from "../../features/learning/model/reducer";
import { progressAt } from "../../test/fixtures/progress";
import {
  FALLBACK_PROGRESS_STORAGE_KEY,
  IndexedDbProgressRepository,
} from "./IndexedDbProgressRepository";

const TEST_DATABASES: string[] = [];

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
    const saved = progressAt("く", "traceNarrow");
    const repository = new IndexedDbProgressRepository(databaseName);

    await repository.save(saved);

    await expect(new IndexedDbProgressRepository(databaseName).load()).resolves.toMatchObject({
      currentKanaIndex: KANA_ORDER.indexOf("く"),
      stage: "traceNarrow",
    });
  });

  it("IndexedDBが使えないときは最小の進捗だけをfallbackへ保存して再読込する", async () => {
    const storage = new MapStorage();
    const repository = new IndexedDbProgressRepository(testDatabaseName(), { indexedDb: null, localStorage: storage });
    const progress = {
      ...progressAt("く", "traceNarrow"),
      name: "保存してはいけない名前",
      strokeHistory: [[{ x: 1, y: 2 }]],
    };

    await repository.save(progress);

    expect(repository.storageDegraded).toBe(true);
    expect(JSON.parse(storage.getItem(FALLBACK_PROGRESS_STORAGE_KEY) ?? "null")).not.toMatchObject({
      name: "保存してはいけない名前",
      strokeHistory: [[{ x: 1, y: 2 }]],
    });
    await expect(new IndexedDbProgressRepository(testDatabaseName(), { indexedDb: null, localStorage: storage }).load())
      .resolves.toMatchObject({ currentKanaIndex: KANA_ORDER.indexOf("く"), stage: "traceNarrow" });
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
    await repository.save(progressAt("く", "traceNarrow"));
    localStorage.setItem(FALLBACK_PROGRESS_STORAGE_KEY, JSON.stringify(progressAt("さ", "soundMatch")));

    await repository.reset();

    expect(localStorage.getItem(FALLBACK_PROGRESS_STORAGE_KEY)).toBeNull();
    await expect(new IndexedDbProgressRepository(databaseName).load()).resolves.toEqual(createInitialProgress());
  });

  it("両保存先が失敗してもsaveは例外を出さず、ランタイムへ劣化状態を公開する", async () => {
    const runtime = createBrowserRuntime({
      databaseName: testDatabaseName(),
      indexedDb: null,
      localStorage: new ThrowingStorage(),
    });

    await expect(runtime.progressRepository.save(progressAt("く", "traceNarrow"))).resolves.toBeUndefined();
    expect(runtime.storageDegraded).toBe(true);
  });
});

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
