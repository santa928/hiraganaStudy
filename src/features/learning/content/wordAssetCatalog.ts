import { getIllustration, resolveAssetPath, type IllustrationAsset } from "./assetCatalog";

/** 単語カードが使う画像の固定metadata。 */
export const WORD_ASSET_MANIFEST = [
  {
    "key": "w1-01",
    "text": "いえ",
    "alt": "いえ",
    "kind": "word",
    "fileName": "w1-01.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-02",
    "text": "かお",
    "alt": "かお",
    "kind": "word",
    "fileName": "w1-02.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-03",
    "text": "かき",
    "alt": "くだものの かき",
    "kind": "word",
    "fileName": "w1-03.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-04",
    "text": "かさ",
    "alt": "かさ",
    "kind": "reuse",
    "sourceKey": "kana-ka-umbrella",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-05",
    "text": "くし",
    "alt": "くし",
    "kind": "word",
    "fileName": "w1-05.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-06",
    "text": "こま",
    "alt": "こま",
    "kind": "word",
    "fileName": "w1-06.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-07",
    "text": "さる",
    "alt": "さる",
    "kind": "word",
    "fileName": "w1-07.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-08",
    "text": "しか",
    "alt": "しか",
    "kind": "word",
    "fileName": "w1-08.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-09",
    "text": "すし",
    "alt": "すし",
    "kind": "word",
    "fileName": "w1-09.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-10",
    "text": "たこ",
    "alt": "うみの たこ",
    "kind": "word",
    "fileName": "w1-10.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-11",
    "text": "つき",
    "alt": "つき",
    "kind": "word",
    "fileName": "w1-11.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w1-12",
    "text": "なす",
    "alt": "なす",
    "kind": "reuse",
    "sourceKey": "kana-na-eggplant",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-01",
    "text": "あひる",
    "alt": "あひる",
    "kind": "reuse",
    "sourceKey": "kana-a-duck",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-02",
    "text": "いぬ",
    "alt": "いぬ",
    "kind": "reuse",
    "sourceKey": "kana-i-dog",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-03",
    "text": "うさぎ",
    "alt": "うさぎ",
    "kind": "reuse",
    "sourceKey": "kana-u-rabbit",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-04",
    "text": "えんぴつ",
    "alt": "えんぴつ",
    "kind": "reuse",
    "sourceKey": "kana-e-pencil",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-05",
    "text": "きりん",
    "alt": "きりん",
    "kind": "reuse",
    "sourceKey": "kana-ki-giraffe",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-06",
    "text": "くるま",
    "alt": "くるま",
    "kind": "reuse",
    "sourceKey": "kana-ku-car",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-07",
    "text": "こあら",
    "alt": "こあら",
    "kind": "reuse",
    "sourceKey": "kana-ko-koala",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-08",
    "text": "さかな",
    "alt": "さかな",
    "kind": "reuse",
    "sourceKey": "kana-sa-fish",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-09",
    "text": "しまうま",
    "alt": "しまうま",
    "kind": "reuse",
    "sourceKey": "kana-shi-zebra",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-10",
    "text": "すいか",
    "alt": "すいか",
    "kind": "reuse",
    "sourceKey": "kana-su-watermelon",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-11",
    "text": "たいこ",
    "alt": "たいこ",
    "kind": "reuse",
    "sourceKey": "kana-ta-drum",
    "width": 512,
    "height": 512
  },
  {
    "key": "w2-12",
    "text": "つみき",
    "alt": "つみき",
    "kind": "reuse",
    "sourceKey": "kana-tsu-blocks",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-01",
    "text": "かがみ",
    "alt": "かがみ",
    "kind": "word",
    "fileName": "w3-01.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-02",
    "text": "いちご",
    "alt": "いちご",
    "kind": "word",
    "fileName": "w3-02.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-03",
    "text": "ごりら",
    "alt": "ごりら",
    "kind": "word",
    "fileName": "w3-03.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-04",
    "text": "ぞう",
    "alt": "ぞう",
    "kind": "word",
    "fileName": "w3-04.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-05",
    "text": "ざりがに",
    "alt": "ざりがに",
    "kind": "word",
    "fileName": "w3-05.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-06",
    "text": "だるま",
    "alt": "だるま",
    "kind": "word",
    "fileName": "w3-06.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-07",
    "text": "でんしゃ",
    "alt": "でんしゃ",
    "kind": "word",
    "fileName": "w3-07.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-08",
    "text": "どうぶつ",
    "alt": "どうぶつの なかまたち",
    "kind": "word",
    "fileName": "w3-08.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-09",
    "text": "ばなな",
    "alt": "ばなな",
    "kind": "word",
    "fileName": "w3-09.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-10",
    "text": "ぶた",
    "alt": "ぶた",
    "kind": "word",
    "fileName": "w3-10.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-11",
    "text": "ぱんだ",
    "alt": "ぱんだ",
    "kind": "word",
    "fileName": "w3-11.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w3-12",
    "text": "ぴあの",
    "alt": "ぴあの",
    "kind": "word",
    "fileName": "w3-12.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-01",
    "text": "きって",
    "alt": "きって",
    "kind": "word",
    "fileName": "w4-01.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-02",
    "text": "こっぷ",
    "alt": "こっぷ",
    "kind": "word",
    "fileName": "w4-02.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-03",
    "text": "らっぱ",
    "alt": "らっぱ",
    "kind": "word",
    "fileName": "w4-03.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-04",
    "text": "きっぷ",
    "alt": "きっぷ",
    "kind": "word",
    "fileName": "w4-04.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-05",
    "text": "せっけん",
    "alt": "せっけん",
    "kind": "word",
    "fileName": "w4-05.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-06",
    "text": "はっぱ",
    "alt": "はっぱ",
    "kind": "word",
    "fileName": "w4-06.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-07",
    "text": "しっぽ",
    "alt": "しっぽ",
    "kind": "word",
    "fileName": "w4-07.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-08",
    "text": "べっど",
    "alt": "べっど",
    "kind": "word",
    "fileName": "w4-08.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-09",
    "text": "ろけっと",
    "alt": "ろけっと",
    "kind": "word",
    "fileName": "w4-09.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-10",
    "text": "ぽけっと",
    "alt": "ぽけっと",
    "kind": "word",
    "fileName": "w4-10.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-11",
    "text": "ざっし",
    "alt": "ざっし",
    "kind": "word",
    "fileName": "w4-11.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w4-12",
    "text": "がっき",
    "alt": "みぢかな がっき",
    "kind": "word",
    "fileName": "w4-12.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-01",
    "text": "きゃべつ",
    "alt": "きゃべつ",
    "kind": "word",
    "fileName": "w5-01.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-02",
    "text": "きゅうり",
    "alt": "きゅうり",
    "kind": "word",
    "fileName": "w5-02.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-03",
    "text": "きょうりゅう",
    "alt": "きょうりゅう",
    "kind": "word",
    "fileName": "w5-03.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-04",
    "text": "しゃしん",
    "alt": "しゃしん",
    "kind": "word",
    "fileName": "w5-04.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-05",
    "text": "しゅりけん",
    "alt": "しゅりけん",
    "kind": "word",
    "fileName": "w5-05.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-06",
    "text": "しょうぼうしゃ",
    "alt": "しょうぼうしゃ",
    "kind": "word",
    "fileName": "w5-06.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-07",
    "text": "ちゃわん",
    "alt": "ちゃわん",
    "kind": "word",
    "fileName": "w5-07.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-08",
    "text": "ちゅうりっぷ",
    "alt": "ちゅうりっぷ",
    "kind": "word",
    "fileName": "w5-08.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-09",
    "text": "ちょうちょ",
    "alt": "ちょうちょ",
    "kind": "reuse",
    "sourceKey": "kana-chi-butterfly",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-10",
    "text": "にんぎょう",
    "alt": "にんぎょう",
    "kind": "word",
    "fileName": "w5-10.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-11",
    "text": "りゅっく",
    "alt": "りゅっく",
    "kind": "word",
    "fileName": "w5-11.webp",
    "width": 512,
    "height": 512
  },
  {
    "key": "w5-12",
    "text": "ぎゅうにゅう",
    "alt": "ぎゅうにゅう",
    "kind": "word",
    "fileName": "w5-12.webp",
    "width": 512,
    "height": 512
  }
] as const;
export type WordIllustrationKey = (typeof WORD_ASSET_MANIFEST)[number]["key"];
/** 単語キーを既存kana再利用を含めた同一APIで解決する。 */
export function getWordIllustration(key: string): IllustrationAsset {
  const asset = WORD_ASSET_MANIFEST.find((entry) => entry.key === key);
  if (!asset) throw new Error(`Unknown word illustration: ${key}`);
  if (asset.kind === "reuse") return getIllustration(asset.sourceKey);
  return { src: resolveAssetPath(`assets/illustrations/words/${asset.fileName}`), width: asset.width, height: asset.height, alt: asset.alt };
}
