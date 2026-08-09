import { describe, expect, it } from "vitest";

import {
  ASSET_CATALOG,
  KANA_ASSET_MANIFEST,
  WORLD_ASSET_CATALOG,
  WORLD_ASSET_MANIFEST,
  getIllustration,
  getWorldIllustration,
  resolveAssetPath,
} from "./assetCatalog";
import { KANA_ENTRIES } from "./kana";

const EXPECTED_KANA_ASSETS = [
  ["kana-a-duck", "あひる"],
  ["kana-i-dog", "いぬ"],
  ["kana-u-rabbit", "うさぎ"],
  ["kana-e-pencil", "えんぴつ"],
  ["kana-o-rice-ball", "おにぎり"],
  ["kana-ka-umbrella", "かさ"],
  ["kana-ki-giraffe", "きりん"],
  ["kana-ku-car", "くるま"],
  ["kana-ke-yarn", "けいと"],
  ["kana-ko-koala", "こあら"],
  ["kana-sa-fish", "さかな"],
  ["kana-shi-zebra", "しまうま"],
  ["kana-su-watermelon", "すいか"],
  ["kana-se-cicada", "せみ"],
  ["kana-so-sky", "そら"],
  ["kana-ta-drum", "たいこ"],
  ["kana-chi-butterfly", "ちょうちょ"],
  ["kana-tsu-blocks", "つみき"],
  ["kana-te-gloves", "てぶくろ"],
  ["kana-to-tomato", "とまと"],
  ["kana-na-eggplant", "なす"],
  ["kana-ni-carrot", "にんじん"],
  ["kana-nu-stuffed-toy", "ぬいぐるみ"],
  ["kana-ne-cat", "ねこ"],
  ["kana-no-vehicles", "のりもの"],
  ["kana-ha-flower", "はな"],
  ["kana-hi-chick", "ひよこ"],
  ["kana-fu-balloon", "ふうせん"],
  ["kana-he-snake", "へび"],
  ["kana-ho-star", "ほし"],
  ["kana-ma-pillow", "まくら"],
  ["kana-mi-mandarin", "みかん"],
  ["kana-mu-insect", "むし"],
  ["kana-me-glasses", "めがね"],
  ["kana-mo-peach", "もも"],
  ["kana-ya-mountain", "やま"],
  ["kana-yu-snowman", "ゆきだるま"],
  ["kana-yo-yacht", "よっと"],
  ["kana-ra-lion", "らいおん"],
  ["kana-ri-apple", "りんご"],
  ["kana-ru-roulette", "るーれっと"],
  ["kana-re-lemon", "れもん"],
  ["kana-ro-candle", "ろうそく"],
  ["kana-wa-crocodile", "わに"],
  ["kana-wo-apple-eating", "りんごを たべる"],
  ["kana-n-bread-ending", "ぱん"],
] as const;

describe("教材イラストカタログ", () => {
  it("教材定義と同じ固定順で46文字のキーとaltを持つ", () => {
    expect(KANA_ASSET_MANIFEST.map(({ key, alt }) => [key, alt])).toEqual(EXPECTED_KANA_ASSETS);
    expect(KANA_ASSET_MANIFEST.map(({ key }) => key)).toEqual(
      KANA_ENTRIES.map(({ illustrationKey }) => illustrationKey),
    );
  });

  it("46文字をexact 512pxの安定したWebP名で公開する", () => {
    expect(KANA_ASSET_MANIFEST).toHaveLength(46);

    for (const { key, fileName, width, height } of KANA_ASSET_MANIFEST) {
      expect({ fileName, width, height }).toEqual({
        fileName: `${key}.webp`,
        width: 512,
        height: 512,
      });
      expect(getIllustration(key).src).toBe(
        resolveAssetPath(`assets/illustrations/kana/${key}.webp`),
      );
    }
  });

  it("manifestとruntime catalogが同じメタデータを返す", () => {
    expect(Object.keys(ASSET_CATALOG)).toEqual(EXPECTED_KANA_ASSETS.map(([key]) => key));

    for (const entry of KANA_ASSET_MANIFEST) {
      expect(getIllustration(entry.key)).toEqual({
        src: resolveAssetPath(`assets/illustrations/kana/${entry.fileName}`),
        width: entry.width,
        height: entry.height,
        alt: entry.alt,
      });
    }
  });

  it("GitHub Pagesの末尾slash有無に依存せずsubpathを保つ", () => {
    expect(resolveAssetPath("assets/illustrations/kana/kana-a-duck.webp", "/hiraganaStudy")).toBe(
      "/hiraganaStudy/assets/illustrations/kana/kana-a-duck.webp",
    );
    expect(resolveAssetPath("/assets/illustrations/kana/kana-a-duck.webp", "/hiraganaStudy/")).toBe(
      "/hiraganaStudy/assets/illustrations/kana/kana-a-duck.webp",
    );
  });

  it("未知の教材キーを代替画像へ黙って置換しない", () => {
    expect(() => getIllustration("kana-unknown")).toThrowError(
      "Unknown kana illustration: kana-unknown",
    );
  });
});

describe("世界観イラストカタログ", () => {
  it("背景・こえのことり・じょうろを用途別寸法で持つ", () => {
    expect(WORLD_ASSET_MANIFEST).toEqual([
      {
        key: "garden-background",
        fileName: "garden-background.webp",
        width: 1024,
        height: 1536,
        alt: "朝のひらがなの庭",
      },
      {
        key: "voice-bird",
        fileName: "voice-bird.webp",
        width: 512,
        height: 512,
        alt: "こえのことり",
      },
      {
        key: "watering-can",
        fileName: "watering-can.webp",
        width: 512,
        height: 512,
        alt: "みどりのじょうろ",
      },
    ]);

    expect(Object.keys(WORLD_ASSET_CATALOG)).toEqual([
      "garden-background",
      "voice-bird",
      "watering-can",
    ]);
    expect(getWorldIllustration("voice-bird")).toEqual({
      src: resolveAssetPath("assets/illustrations/world/voice-bird.webp"),
      width: 512,
      height: 512,
      alt: "こえのことり",
    });
  });

  it("未知の世界観キーを代替画像へ黙って置換しない", () => {
    expect(() => getWorldIllustration("unknown-world")).toThrowError(
      "Unknown world illustration: unknown-world",
    );
  });
});
