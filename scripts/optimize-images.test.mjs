/* global process */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { optimizeImages } from "./optimize-images.mjs";
import { verifyImages } from "./verify-images.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectories = [];

/** テストごとの隔離directoryを作成し、cleanup対象へ登録する。 */
async function createTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "hiragana-image-pipeline-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** runtime管理対象49画像とcatalogの相対path別SHA-256を返す。 */
async function hashManagedArtifacts(rootDirectory) {
  const directories = [
    "public/assets/illustrations/kana",
    "public/assets/illustrations/world",
  ];
  const relativePaths = ["src/features/learning/content/assetCatalog.ts"];
  for (const directory of directories) {
    const files = (await readdir(join(rootDirectory, directory)))
      .filter((file) => file.endsWith(".webp"));
    relativePaths.push(...files.map((file) => join(directory, file)));
  }

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

describe("画像生成pipeline", () => {
  it("生成途中の失敗では既存49画像とcatalogを一切変更しない", async () => {
    const before = await hashManagedArtifacts(REPOSITORY_ROOT);
    expect(Object.keys(before)).toHaveLength(50);
    const temporaryDirectory = await createTemporaryDirectory();

    await expect(optimizeImages({
      destinationRoot: REPOSITORY_ROOT,
      contactSheetPath: join(temporaryDirectory, "contact.png"),
      failureAfterAssetKey: "kana-a-duck",
    })).rejects.toThrow("Injected image generation failure after kana-a-duck");

    expect(await hashManagedArtifacts(REPOSITORY_ROOT)).toEqual(before);
    expect((await readdir(REPOSITORY_ROOT)).some((entry) => (
      entry.startsWith(".hiragana-image-build-")
    ))).toBe(false);
  }, 30_000);

  it("repo外cwdでも隔離生成後にexact集合へ置換してstale WebPを残さない", async () => {
    const before = await hashManagedArtifacts(REPOSITORY_ROOT);
    const temporaryDirectory = await createTemporaryDirectory();
    const destinationRoot = join(temporaryDirectory, "published");
    const stalePath = join(destinationRoot, "public/assets/illustrations/kana/stale.webp");
    await mkdir(dirname(stalePath), { recursive: true });
    await writeFile(stalePath, "stale", "utf8");
    process.chdir(temporaryDirectory);

    await optimizeImages({
      destinationRoot,
      contactSheetPath: join(temporaryDirectory, "contact.png"),
    });

    const kanaFiles = await readdir(join(destinationRoot, "public/assets/illustrations/kana"));
    const worldFiles = await readdir(join(destinationRoot, "public/assets/illustrations/world"));
    expect(kanaFiles.filter((file) => file.endsWith(".webp"))).toHaveLength(46);
    expect(worldFiles.filter((file) => file.endsWith(".webp"))).toHaveLength(3);
    expect(kanaFiles).not.toContain("stale.webp");
    expect(Object.keys(await hashManagedArtifacts(destinationRoot))).toHaveLength(50);
    expect(await hashManagedArtifacts(REPOSITORY_ROOT)).toEqual(before);
    expect((await readdir(destinationRoot)).some((entry) => (
      entry.startsWith(".hiragana-image-build-")
    ))).toBe(false);
  }, 30_000);
});

describe("画像verifier", () => {
  it("失敗後に同一processで再実行してもfailure状態を持ち越さない", async () => {
    const invalidRoot = await createTemporaryDirectory();
    const first = await verifyImages({
      repositoryRoot: invalidRoot,
      checkDeterminism: false,
      log: false,
    });
    const second = await verifyImages({ checkDeterminism: false, log: false });

    expect(first.ok).toBe(false);
    expect(first.failures).not.toHaveLength(0);
    expect(second).toEqual({ ok: true, failures: [] });
  });
});
