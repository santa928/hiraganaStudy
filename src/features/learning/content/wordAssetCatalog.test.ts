import { describe, expect, it } from "vitest";

import {
  WORD_ASSET_MANIFEST,
  getWordIllustration,
  type WordIllustrationKey,
} from "./wordAssetCatalog";

describe("単語イラストカタログ", () => {
  it("w1-01からw5-12まで60件を固定順に公開する", () => {
    expect(WORD_ASSET_MANIFEST).toHaveLength(60);
    expect(WORD_ASSET_MANIFEST.map(({ key }) => key)).toEqual([
      ...Array.from({ length: 12 }, (_, index) => `w1-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w2-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w3-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w4-${String(index + 1).padStart(2, "0")}`),
      ...Array.from({ length: 12 }, (_, index) => `w5-${String(index + 1).padStart(2, "0")}`),
    ]);
  });

  it("15件は既存kana画像を同じruntime APIで再利用する", () => {
    const reused = WORD_ASSET_MANIFEST.filter(({ kind }) => kind === "reuse");
    expect(reused).toHaveLength(15);
    expect(reused.find(({ key }) => key === "w1-04")).toMatchObject({
      sourceKey: "kana-ka-umbrella",
      text: "かさ",
    });
    expect(getWordIllustration("w2-01" satisfies WordIllustrationKey).src)
      .toContain("assets/illustrations/kana/kana-a-duck.webp");
  });

  it("45件は512pxの単語用WebPを参照する", () => {
    const generated = WORD_ASSET_MANIFEST.filter((asset) => asset.kind === "word");
    expect(generated).toHaveLength(45);
    for (const asset of generated) {
      expect(asset).toMatchObject({ width: 512, height: 512 });
      if (asset.kind !== "word") throw new Error("generated asset must be a word image");
      expect(getWordIllustration(asset.key).src).toContain(`assets/illustrations/words/${asset.fileName}`);
    }
  });

  it("意味を取り違えやすい4語は教材のspokenLabelと同じ代替文を持つ", () => {
    expect(WORD_ASSET_MANIFEST.filter(({ text }) => ["かき", "たこ", "どうぶつ", "がっき"].includes(text)))
      .toMatchObject([
        { text: "かき", alt: "くだものの かき" },
        { text: "たこ", alt: "うみの たこ" },
        { text: "どうぶつ", alt: "どうぶつの なかまたち" },
        { text: "がっき", alt: "みぢかな がっき" },
      ]);
  });
});
