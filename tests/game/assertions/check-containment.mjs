/* global console, document, getComputedStyle, HTMLButtonElement, HTMLCanvasElement, HTMLElement, innerHeight, innerWidth, localStorage, performance, process, window */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

import { createProgressFixture } from "../run-scenarios.mjs";
import { waitForVisualAssets } from "./wait-for-visuals.mjs";

const FALLBACK_KEY = "hiragana-no-niwa:progress:v1";
const VIEWPORTS = [
  { name: "phone-portrait", width: 390, height: 844 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "tablet-portrait", width: 820, height: 1180 },
  { name: "tablet-landscape", width: 1180, height: 820 },
];

/** 小数誤差を読みやすい監査値へ丸める。 */
function rounded(value) {
  return Math.round(value * 100) / 100;
}

/** 連続して閾値を超えた最大sample数を返す。 */
function longestRunOver(values, threshold) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value > threshold ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** child矩形がparent矩形から出ているかを小数誤差込みで判定する。 */
function isOutside(child, parent, tolerance) {
  return child.left < parent.left - tolerance
    || child.top < parent.top - tolerance
    || child.right > parent.right + tolerance
    || child.bottom > parent.bottom + tolerance;
}

/** 書字開始後のpaintだけを抽出し、idle時間を遅延へ混ぜずに集計する。 */
export function analyzeWritingSamples(raw) {
  const firstPointerTime = raw.pointerTimes[0] ?? Number.POSITIVE_INFINITY;
  const uniquePaintTimes = raw.paintTimes
    .filter((time, index, values) => index === 0 || time - values[index - 1] > 2)
    .filter((time) => time >= firstPointerTime);
  const frameIntervals = uniquePaintTimes.slice(1).map((time, index) => time - uniquePaintTimes[index]);
  const monitoredFrameIntervals = frameIntervals.map((interval, index) => {
    const previousPaint = uniquePaintTimes[index];
    const continuousInput = raw.pointerTimes.some((pointerTime) => pointerTime > previousPaint && pointerTime <= previousPaint + 38);
    return continuousInput ? interval : 0;
  });
  const pointerPaintPairs = raw.pointerTimes.map((pointerTime) => {
    const paintTime = uniquePaintTimes.find((time) => time >= pointerTime);
    return { pointerTime, paintTime };
  });
  const pointerToPaint = pointerPaintPairs
    .filter((pair) => pair.paintTime !== undefined)
    .map((pair) => pair.paintTime - pair.pointerTime);
  const unpaintedPointerEvents = pointerPaintPairs.filter((pair) => pair.paintTime === undefined).length;
  return {
    pointerEvents: raw.pointerTimes.length,
    paintFrames: uniquePaintTimes.length,
    unpaintedPointerEvents,
    frameIntervalsMs: frameIntervals.map(rounded),
    activeFrameIntervalsMs: monitoredFrameIntervals.filter((interval) => interval > 0).map(rounded),
    pointerToPaintMs: pointerToPaint.map(rounded),
    maxFrameIntervalMs: rounded(Math.max(0, ...frameIntervals)),
    maxPointerToPaintMs: rounded(Math.max(0, ...pointerToPaint)),
    consecutiveFrameIntervalsOver38Ms: longestRunOver(monitoredFrameIntervals, 38),
    consecutivePointerLatencyOver50Ms: longestRunOver(pointerToPaint, 50),
    note: "Docker headless Chromiumの参考値であり、実機性能認証ではない",
  };
}

/** 親境界・安全gap・touch寸法のpure検査。 */
export function findContainmentIssues(metrics) {
  const issues = [];
  const tolerance = 0.5;
  if (metrics.root.left < -tolerance) issues.push(`root左端overflow: ${rounded(metrics.root.left)} < 0`);
  if (metrics.root.top < -tolerance) issues.push(`root上端overflow: ${rounded(metrics.root.top)} < 0`);
  if (metrics.root.right > metrics.viewport.width + tolerance) issues.push(`root右端overflow: ${rounded(metrics.root.right)} > ${metrics.viewport.width}`);
  if (metrics.root.bottom > metrics.viewport.height + tolerance) issues.push(`root下端overflow: ${rounded(metrics.root.bottom)} > ${metrics.viewport.height}`);
  for (const child of metrics.children) {
    if (isOutside(child.rect, metrics.card, tolerance)) issues.push(`card内overflow: ${child.name}`);
  }
  const viewportRect = { left: 0, top: 0, right: metrics.viewport.width, bottom: metrics.viewport.height };
  for (const region of metrics.regions ?? []) {
    if (isOutside(region.rect, region.parentRect, tolerance)) issues.push(`layout親境界外: ${region.name}`);
    if (isOutside(region.rect, viewportRect, tolerance)) issues.push(`layout viewport外: ${region.name}`);
  }
  const gap = metrics.materialTop - metrics.hudBottom;
  if (gap < 8 - tolerance) issues.push(`HUDと教材のgap不足: ${rounded(gap)}px`);
  for (const target of metrics.targets) {
    const minimumSize = target.primary ? 64 : 48;
    if (target.rect.width < minimumSize - tolerance || target.rect.height < minimumSize - tolerance) {
      const requirement = target.primary ? " (64px必要)" : "";
      issues.push(`touch target不足: ${target.name} ${rounded(target.rect.width)}x${rounded(target.rect.height)}${requirement}`);
    }
    if (isOutside(target.rect, target.parentRect ?? metrics.root, tolerance)) issues.push(`touch target親境界外: ${target.name}`);
    if (isOutside(target.rect, viewportRect, tolerance)) issues.push(`touch target viewport外: ${target.name}`);
  }
  return issues;
}

/** 成功レイヤーが対象へ結び付き、主要操作を遮らないことを検査する。 */
export function findSuccessOverlayIssues(metrics) {
  const issues = [];
  const tolerance = 0.5;
  const viewportRect = { left: 0, top: 0, right: metrics.viewport.width, bottom: metrics.viewport.height };
  if (isOutside(metrics.rect, metrics.parentRect, tolerance)) issues.push("成功表示が対象外");
  if (isOutside(metrics.rect, viewportRect, tolerance)) issues.push("成功表示がviewport外");
  if (metrics.pointerEvents !== "none") issues.push(`成功表示が操作を遮断: ${metrics.pointerEvents}`);
  if (metrics.homeDisabled) issues.push("成功中に家が無効");
  return issues;
}

/** browserのcomputed rgb/rgba表記をcontrast計算用の色へ変換する。 */
function parseComputedColor(value) {
  const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (channels.some((channel) => !Number.isFinite(channel)) || !Number.isFinite(alpha)) return null;
  return { red: channels[0], green: channels[1], blue: channels[2], alpha };
}

/** sRGB色の相対輝度を返す。 */
function relativeLuminance(color) {
  const linear = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

/** 問題案内が背景から分離し、小さい画面でも読める実測styleかを検査する。 */
export function findGuideReadabilityIssues(metrics) {
  const issues = [];
  const background = parseComputedColor(metrics.backgroundColor);
  const foreground = parseComputedColor(metrics.color);
  if (!background || background.alpha < 0.95) {
    issues.push(`案内札の背景が不透明でない: ${metrics.backgroundColor}`);
  }
  if (!background || !foreground) {
    issues.push("案内札の文字contrastを計算できない");
  } else {
    const brighter = Math.max(relativeLuminance(background), relativeLuminance(foreground));
    const darker = Math.min(relativeLuminance(background), relativeLuminance(foreground));
    if ((brighter + 0.05) / (darker + 0.05) < 4.5) issues.push("案内札の文字contrast不足");
  }
  if (Math.min(metrics.paddingBlockStart, metrics.paddingBlockEnd) < 4) {
    issues.push(`案内札の上下padding不足: ${metrics.paddingBlockStart}px/${metrics.paddingBlockEnd}px`);
  }
  if (metrics.lineHeight < metrics.fontSize * 1.2) {
    issues.push(`案内札の行間不足: ${metrics.lineHeight}px/${metrics.fontSize}px`);
  }
  return issues;
}

/** CLI引数を4 viewport監査設定へ変換する。 */
function parseArguments(argv) {
  const options = {
    url: "http://127.0.0.1:4173",
    outputDirectory: "test-results/game/containment",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/ms-playwright/chromium-1234/chrome-linux/chrome",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--url" && value) options.url = value;
    else if (argv[index] === "--output-dir" && value) options.outputDirectory = value;
    else if (argv[index] === "--executable-path" && value) options.executablePath = value;
    else continue;
    index += 1;
  }
  return options;
}

/** localStorage fallbackへ、独立browser session用の保存値を注入する。 */
async function seedProgress(page, progress, id) {
  await page.addInitScript(({ key, envelope }) => localStorage.setItem(key, JSON.stringify(envelope)), {
    key: FALLBACK_KEY,
    envelope: { revision: 1, writtenAt: 1, writeId: id, progress },
  });
}

/** cacheを持ち越さずproduction画面を開く。 */
async function openAuditPage(page, url, id) {
  const separator = url.includes("?") ? "&" : "?";
  await page.goto(`${url}${separator}layout-audit=${encodeURIComponent(`${id}-${Date.now()}`)}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("app-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
}

/** 形合わせ画面のDOM境界・画像readiness・配置関係を採取する。 */
async function measureViewport(browser, options, viewport, errors) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${viewport.name}: console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`${viewport.name}: pageerror: ${String(error)}`));
  const progress = createProgressFixture({ completedKanaCount: 0, currentKana: "あ", stage: "shapeMatch" });
  await seedProgress(page, { ...progress, settings: { ...progress.settings, speech: true } }, `containment-${viewport.name}`);
  await openAuditPage(page, options.url, viewport.name);
  await page.getByRole("button", { name: "つづきを あそぶ", exact: true }).click();
  await page.getByTestId("lesson-stage").waitFor({ state: "visible" });
  const visualAssets = await waitForVisualAssets(page);

  const metrics = await page.evaluate(() => {
    const toRect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const required = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`layout対象がありません: ${selector}`);
      return element;
    };
    const root = required(".lessonScreen");
    const hud = required(".lessonScreen__hud");
    const guide = required(".lessonScreen__guide");
    const body = required(".lessonScreen__body");
    const material = required(".lessonScreen__material");
    const actions = required(".lessonScreen__actions");
    const card = required(".promptCard");
    const character = required(".promptCard__character");
    const illustration = required(".promptCard__illustration");
    const children = [character, required(".promptCard__illustrationWrap")].map((element) => ({
      name: element.className,
      rect: toRect(element),
    }));
    const targets = [...root.querySelectorAll("button")].filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }).map((element) => ({
      name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.className,
      rect: toRect(element),
      parentRect: toRect(element.parentElement ?? root),
      primary: element.matches(".choiceGrid__choice, .lessonButton:not(.lessonButton--secondary)"),
    }));
    const rootRect = toRect(root);
    const bodyRect = toRect(body);
    const guideStyle = getComputedStyle(guide);
    const regions = [
      { name: "hud", rect: toRect(hud), parentRect: rootRect },
      { name: "guide", rect: toRect(guide), parentRect: rootRect },
      { name: "body", rect: bodyRect, parentRect: rootRect },
      { name: "material", rect: toRect(material), parentRect: bodyRect },
      { name: "card", rect: toRect(card), parentRect: toRect(material) },
      { name: "actions", rect: toRect(actions), parentRect: bodyRect },
    ];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      root: rootRect,
      hud: toRect(hud),
      guide: toRect(guide),
      guideStyle: {
        backgroundColor: guideStyle.backgroundColor,
        color: guideStyle.color,
        paddingBlockStart: Number.parseFloat(guideStyle.paddingBlockStart),
        paddingBlockEnd: Number.parseFloat(guideStyle.paddingBlockEnd),
        lineHeight: Number.parseFloat(guideStyle.lineHeight),
        fontSize: Number.parseFloat(guideStyle.fontSize),
      },
      body: toRect(body),
      material: toRect(material),
      actions: toRect(actions),
      card: toRect(card),
      character: toRect(character),
      illustration: toRect(illustration),
      children,
      regions,
      targets,
      hudBottom: hud.getBoundingClientRect().bottom,
      materialTop: guide.getBoundingClientRect().top,
      guideToBodyGap: body.getBoundingClientRect().top - guide.getBoundingClientRect().bottom,
      choiceImageCount: actions.querySelectorAll("img").length,
      imagesReady: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    };
  });

  const issues = findContainmentIssues(metrics);
  issues.push(...findGuideReadabilityIssues(metrics.guideStyle));
  if (metrics.guideToBodyGap < 8 - 0.5) issues.push(`案内と教材のgap不足: ${rounded(metrics.guideToBodyGap)}px`);
  if (!metrics.imagesReady) issues.push("画像decode未完了");
  if (visualAssets.backgroundUrls.length === 0) issues.push("CSS背景画像がありません");
  if (metrics.choiceImageCount !== 0) issues.push(`文字選択肢内の画像: ${metrics.choiceImageCount}`);
  if (metrics.character.height <= metrics.illustration.height) {
    issues.push(`問題文字がillustration以下: ${rounded(metrics.character.height)} <= ${rounded(metrics.illustration.height)}`);
  }
  if (viewport.width > viewport.height) {
    const gap = metrics.actions.left - metrics.material.right;
    if (gap < 8 - 0.5) issues.push(`横画面の左右gap不足: ${rounded(gap)}px`);
  } else {
    const gap = metrics.actions.top - metrics.material.bottom;
    if (gap < -0.5) issues.push(`縦画面の操作重なり: ${rounded(gap)}px`);
  }
  await page.screenshot({ path: join(options.outputDirectory, `${viewport.name}.png`), fullPage: false });
  await page.getByRole("button", { name: "もじ あ", exact: true }).click();
  await page.getByTestId("success-bloom").waitFor({ state: "visible" });
  const success = await page.evaluate(() => {
    const bloom = document.querySelector(".successBloom");
    const home = document.querySelector(".lessonScreen__home");
    if (!(bloom instanceof HTMLElement) || !(bloom.parentElement instanceof HTMLElement)) throw new Error("成功表示の親境界がありません");
    if (!(home instanceof HTMLButtonElement)) throw new Error("庭へ戻る家がありません");
    const toRect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rect: toRect(bloom),
      parentRect: toRect(bloom.parentElement),
      pointerEvents: getComputedStyle(bloom).pointerEvents,
      homeDisabled: home.disabled,
    };
  });
  issues.push(...findSuccessOverlayIssues(success));
  await page.screenshot({ path: join(options.outputDirectory, `${viewport.name}-success.png`), fullPage: false });
  await page.waitForFunction(() => {
    const stage = document.querySelector('[data-testid="lesson-stage"]');
    return stage instanceof HTMLElement && stage.dataset.stage === "soundMatch";
  });
  const soundGuide = await page.evaluate(() => {
    const root = document.querySelector(".lessonScreen");
    const guide = document.querySelector(".lessonScreen__guide");
    const body = document.querySelector(".lessonScreen__body");
    if (!(root instanceof HTMLElement) || !(guide instanceof HTMLElement) || !(body instanceof HTMLElement)) {
      throw new Error("音問題の案内境界がありません");
    }
    const toRect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const style = getComputedStyle(guide);
    return {
      text: guide.textContent,
      rect: toRect(guide),
      rootRect: toRect(root),
      bodyTop: body.getBoundingClientRect().top,
      style: {
        backgroundColor: style.backgroundColor,
        color: style.color,
        paddingBlockStart: Number.parseFloat(style.paddingBlockStart),
        paddingBlockEnd: Number.parseFloat(style.paddingBlockEnd),
        lineHeight: Number.parseFloat(style.lineHeight),
        fontSize: Number.parseFloat(style.fontSize),
      },
    };
  });
  if (soundGuide.text !== "こえを きいて\nおなじ もじを さがそう") issues.push(`音問題の画面案内が不正: ${JSON.stringify(soundGuide.text)}`);
  if (soundGuide.text.includes("あひる") || soundGuide.text.includes("あひるの あ")) issues.push("音問題の画面に正解語が露出");
  if (isOutside(soundGuide.rect, soundGuide.rootRect, 0.5)) issues.push("音問題の案内札がviewport外");
  if (soundGuide.bodyTop - soundGuide.rect.bottom < 8 - 0.5) issues.push(`音問題の案内と教材のgap不足: ${rounded(soundGuide.bodyTop - soundGuide.rect.bottom)}px`);
  issues.push(...findGuideReadabilityIssues(soundGuide.style).map((issue) => `音問題: ${issue}`));
  await page.screenshot({ path: join(options.outputDirectory, `${viewport.name}-sound.png`), fullPage: false });
  await context.close();
  return { name: viewport.name, metrics: { ...metrics, success, soundGuide }, issues };
}

/** 書字中のpaint間隔とpointer-to-paint遅延をDocker内の参考値として測る。 */
async function measureWritingPerformance(browser, options, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(`writing-performance: console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`writing-performance: pageerror: ${String(error)}`));
  await seedProgress(page, createProgressFixture({ completedKanaCount: 1, currentKana: "い", stage: "traceWide" }), "writing-performance");
  await openAuditPage(page, options.url, "writing-performance");
  await page.getByRole("button", { name: "つづきを あそぶ", exact: true }).click();
  const canvas = page.locator("canvas").last();
  await canvas.waitFor({ state: "visible" });
  await waitForVisualAssets(page);
  await page.evaluate(() => {
    const target = document.querySelector("canvas");
    if (!(target instanceof HTMLCanvasElement)) throw new Error("書字canvasがありません");
    const context2d = target.getContext("2d");
    if (!context2d) throw new Error("CanvasRenderingContext2Dがありません");
    const samples = { pointerTimes: [], paintTimes: [] };
    let pointerActive = false;
    let strokeRevision = 0;
    let paintedPointerCount = 0;
    globalThis.__writingAuditSamples = samples;
    target.addEventListener("pointerdown", () => { pointerActive = true; }, { capture: true });
    target.addEventListener("pointerup", () => { pointerActive = false; }, { capture: true });
    target.addEventListener("pointercancel", () => { pointerActive = false; }, { capture: true });
    target.addEventListener("pointermove", () => {
      if (pointerActive) samples.pointerTimes.push(performance.now());
    }, { capture: true });
    const originalStroke = context2d.stroke.bind(context2d);
    context2d.stroke = (...args) => {
      strokeRevision += 1;
      return originalStroke(...args);
    };
    const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => originalRequestAnimationFrame((timestamp) => {
      const revisionBeforeFrame = strokeRevision;
      callback(timestamp);
      if (strokeRevision > revisionBeforeFrame && paintedPointerCount < samples.pointerTimes.length) {
        samples.paintTimes.push(performance.now());
        paintedPointerCount = samples.pointerTimes.length;
      }
    });
  });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("書字canvasの境界を取得できません");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.75, { steps: 40 });
  await page.mouse.up();
  await page.waitForTimeout(450);
  const raw = await page.evaluate(() => globalThis.__writingAuditSamples);
  const metrics = analyzeWritingSamples(raw);
  const issues = [];
  if (metrics.pointerEvents === 0 || metrics.paintFrames < 2) issues.push("書字performance sample不足");
  if (metrics.unpaintedPointerEvents > 0) issues.push(`描画frame未対応pointer: ${metrics.unpaintedPointerEvents}`);
  if (metrics.consecutiveFrameIntervalsOver38Ms >= 3) issues.push(`30fps paint遅延が3回以上継続: ${metrics.consecutiveFrameIntervalsOver38Ms}`);
  if (metrics.consecutivePointerLatencyOver50Ms >= 3) issues.push(`pointer-to-paint 50ms超が3回以上継続: ${metrics.consecutivePointerLatencyOver50Ms}`);
  await page.screenshot({ path: join(options.outputDirectory, "writing-performance.png"), fullPage: false });
  await context.close();
  return { metrics, issues };
}

/** 4代表viewportと書字performanceを採取し、違反時に非0終了する。 */
export async function checkContainment(options) {
  await mkdir(resolve(options.outputDirectory), { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: options.executablePath,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const browserErrors = [];
  let layouts;
  let writingPerformance;
  try {
    layouts = [];
    for (const viewport of VIEWPORTS) layouts.push(await measureViewport(browser, options, viewport, browserErrors));
    writingPerformance = await measureWritingPerformance(browser, options, browserErrors);
  } finally {
    await browser.close();
  }
  const report = { layouts, writingPerformance, browserErrors };
  await writeFile(resolve(options.outputDirectory, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const issues = [
    ...layouts.flatMap((layout) => layout.issues.map((issue) => `${layout.name}: ${issue}`)),
    ...writingPerformance.issues.map((issue) => `writing-performance: ${issue}`),
    ...browserErrors,
  ];
  if (issues.length > 0) throw new Error(`Containment verification failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  console.info("Containment verification passed: 4 viewports, decoded images, 64px primary/48px secondary targets, writing paint samples, browser errors 0.");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await checkContainment(parseArguments(process.argv));
