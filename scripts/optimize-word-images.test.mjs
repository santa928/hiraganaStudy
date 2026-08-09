/* global process */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { WORD_ASSETS, optimizeWordImages } from "./optimize-word-images.mjs";
import { verifyWordImages } from "./verify-word-images.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories = [];

/** テストごとの隔離directoryを作成し、cleanup対象へ登録する。 */
async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "hiragana-word-image-pipeline-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** words管理対象45画像とcatalogの相対path別SHA-256を返す。 */
async function hashManagedWordArtifacts(rootDirectory) {
  const wordDirectory = join(rootDirectory, "public/assets/illustrations/words");
  const relativePaths = ["src/features/learning/content/wordAssetCatalog.ts"];
  const files = (await readdir(wordDirectory)).filter((file) => file.endsWith(".webp"));
  relativePaths.push(...files.map((file) => join("public/assets/illustrations/words", file)));

  const hashes = {};
  for (const relativePath of relativePaths.sort()) {
    const bytes = await readFile(join(rootDirectory, relativePath));
    hashes[relativePath] = createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}

afterEach(async () => {
  process.chdir(REPOSITORY_ROOT);
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("単語イラスト生成pipeline", () => {
  it("固定順45件だけをWebPとして管理する", () => {
    expect(WORD_ASSETS).toHaveLength(45);
    expect(new Set(WORD_ASSETS.map(({ key }) => key)).size).toBe(45);
    expect(WORD_ASSETS.map(({ fileName }) => fileName)).toHaveLength(45);
  });

  it("生成途中の失敗では既存45画像とcatalogを一切変更しない", async () => {
    const before = await hashManagedWordArtifacts(REPOSITORY_ROOT);
    expect(Object.keys(before)).toHaveLength(46);
    const temporaryDirectory = await createTemporaryDirectory();

    await expect(optimizeWordImages({
      destinationRoot: REPOSITORY_ROOT,
      contactSheetPath: join(temporaryDirectory, "contact.png"),
      failureAfterAssetKey: "w1-01",
    })).rejects.toThrow("Injected word image generation failure after w1-01");

    expect(await hashManagedWordArtifacts(REPOSITORY_ROOT)).toEqual(before);
  }, 30_000);

  it("repo外cwdでも隔離生成後にexact集合へ置換してstale WebPを残さない", async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const destinationRoot = join(temporaryDirectory, "published");
    const stalePath = join(destinationRoot, "public/assets/illustrations/words/stale.webp");
    await mkdir(dirname(stalePath), { recursive: true });
    await writeFile(stalePath, "stale", "utf8");
    process.chdir(temporaryDirectory);

    await optimizeWordImages({
      destinationRoot,
      contactSheetPath: join(temporaryDirectory, "contact.png"),
    });

    const wordFiles = await readdir(join(destinationRoot, "public/assets/illustrations/words"));
    expect(wordFiles.filter((file) => file.endsWith(".webp"))).toHaveLength(45);
    expect(wordFiles).not.toContain("stale.webp");
    expect(Object.keys(await hashManagedWordArtifacts(destinationRoot))).toHaveLength(46);
  }, 30_000);
});

describe("単語イラストverifier", () => {
  it("失敗後に同一processで再実行してもfailure状態を持ち越さない", async () => {
    const invalidRoot = await createTemporaryDirectory();
    const first = await verifyWordImages({
      repositoryRoot: invalidRoot,
      checkDeterminism: false,
      log: false,
    });
    const second = await verifyWordImages({ checkDeterminism: false, log: false });

    expect(first.ok).toBe(false);
    expect(first.failures).not.toHaveLength(0);
    expect(second).toEqual({ ok: true, failures: [] });
  });
});
