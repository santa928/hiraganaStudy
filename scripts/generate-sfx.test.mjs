/* global Buffer, process */

import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const ROOT_DIRECTORY = process.cwd();
const SOURCE_DIRECTORY = resolve(ROOT_DIRECTORY, "public/assets/sfx");
const NAMES = ["tap.wav", "success.wav", "sprout.wav", "garden-loop.wav"];

/** 指定一時ディレクトリへ完成版音源をコピーする。 */
async function copySfx(directory) {
  await Promise.all(NAMES.map((name) => copyFile(resolve(SOURCE_DIRECTORY, name), resolve(directory, name))));
}

/** 指定ディレクトリを対象にgeneratorのread-only verifyを実行する。 */
function verify(directory) {
  return execFile("node", ["scripts/generate-sfx.mjs", "--verify"], {
    cwd: ROOT_DIRECTORY,
    env: { ...process.env, SFX_VERIFY_DIRECTORY: directory },
  });
}

describe("generate-sfx --verify", () => {
  it("全zeroと1sample改ざんをbyte比較で検出する", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "hiragana-sfx-"));
    try {
      await copySfx(directory);
      await expect(verify(directory)).resolves.toBeDefined();

      const tapPath = resolve(directory, "tap.wav");
      await writeFile(tapPath, Buffer.alloc((await readFile(tapPath)).length));
      await expect(verify(directory)).rejects.toBeDefined();

      await copySfx(directory);
      const successPath = resolve(directory, "success.wav");
      const success = await readFile(successPath);
      success[100] ^= 1;
      await writeFile(successPath, success);
      await expect(verify(directory)).rejects.toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
