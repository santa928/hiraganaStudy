/* global process */

import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { collectContentInventory, findContentIssues } from "./verify-content.mjs";

const REPOSITORY_ROOT = resolve(process.cwd());

describe("完成教材content verifier", () => {
  it("実repositoryの46文字・60語・66書字・全公開assetと帰属を受理する", async () => {
    const inventory = await collectContentInventory(REPOSITORY_ROOT);

    expect(findContentIssues(inventory)).toEqual([]);
  });

  it("欠落した文字・単語画像・stroke・音・licenseの対象keyを列挙する", async () => {
    const inventory = await collectContentInventory(REPOSITORY_ROOT);
    const missingPath = "public/assets/illustrations/words/w5-11.webp";
    const incomplete = {
      ...inventory,
      kanaEntries: inventory.kanaEntries.slice(1),
      wordAssetEntries: inventory.wordAssetEntries.filter((entry) => entry.key !== "w5-12"),
      strokeTemplates: inventory.strokeTemplates.filter((entry) => entry.character !== "ぽ"),
      existingFiles: new Set([...inventory.existingFiles].filter((path) => (
        path !== missingPath
        && path !== "public/assets/sfx/success.wav"
        && path !== "public/licenses/fude-kana-data/LICENSE"
      ))),
    };

    const issues = findContentIssues(incomplete);

    expect(issues).toContain("ひらがな順欠落: あ");
    expect(issues).toContain("単語illustration定義欠落: w5-12");
    expect(issues).toContain(`公開asset欠落: ${missingPath}`);
    expect(issues).toContain("書字template欠落: ぽ");
    expect(issues).toContain("効果音欠落: public/assets/sfx/success.wav");
    expect(issues).toContain("第三者license欠落: public/licenses/fude-kana-data/LICENSE");
  });

  it("catalogと物理画像を同時に増やしても固定94枚として拒否する", async () => {
    const inventory = await collectContentInventory(REPOSITORY_ROOT);
    const extraPath = "public/assets/illustrations/kana/kana-extra.webp";
    const expanded = {
      ...inventory,
      catalogEntries: [
        ...inventory.catalogEntries,
        {
          key: "kana-extra",
          text: null,
          alt: "よぶんな え",
          kind: null,
          fileName: "kana-extra.webp",
          sourceKey: null,
        },
      ],
      existingFiles: new Set([...inventory.existingFiles, extraPath]),
    };

    const issues = findContentIssues(expanded);

    expect(issues).toContain("illustration定義対象外: kana-extra");
    expect(issues).toContain(`未定義illustration asset: ${extraPath}`);
    expect(issues).toContain("illustration asset数不一致: 95/94");
  });
});
