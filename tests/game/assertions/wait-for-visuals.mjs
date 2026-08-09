/* global document, getComputedStyle, Image */

/** computed styleの単一background-imageから画像URLを取り出す。 */
export function backgroundImageUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^url\((?:"([^"]+)"|'([^']+)'|([^'")]+))\)$/);
  return (match?.[1] ?? match?.[2] ?? match?.[3]?.trim()) || null;
}

/** 通常画像とCSS背景をdecodeし、撮影時の未描画を防ぐ。 */
export async function waitForVisualAssets(page) {
  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    null,
    { timeout: 10_000 },
  );
  const imageCount = await page.evaluate(async () => {
    const images = [...document.images];
    await Promise.all(images.map((image) => image.decode?.()));
    return images.length;
  });
  const backgroundValues = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .map((element) => getComputedStyle(element).backgroundImage)
    .filter((value) => value !== "none"));
  const backgroundUrls = [...new Set(backgroundValues.map(backgroundImageUrl).filter(Boolean))];
  await page.evaluate(async (urls) => {
    await Promise.all(urls.map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.complete || image.naturalWidth <= 0) throw new Error(`CSS背景をdecodeできません: ${url}`);
    }));
  }, backgroundUrls);
  return { imageCount, backgroundUrls };
}
