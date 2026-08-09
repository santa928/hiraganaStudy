/* global process */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeWritingSamples, findContainmentIssues } from "./assertions/check-containment.mjs";
import { createProgressFixture, loadScenario } from "./run-scenarios.mjs";

const REPOSITORY_ROOT = resolve(process.cwd());

describe("完成版browser監査の固定scenario", () => {
  it("初回・書字・45/46解放の3 scenarioを機械読取できる", async () => {
    const scenarios = await Promise.all([
      "first-kana.json",
      "writing.json",
      "word-unlock.json",
    ].map((name) => loadScenario(resolve(REPOSITORY_ROOT, "tests/game/scenarios", name))));

    expect(scenarios.map((scenario) => scenario.id)).toEqual(["first-kana", "writing", "word-unlock"]);
    expect(scenarios[0].flow.some((step) => step.action === "clickWrongKana")).toBe(true);
    expect(scenarios[1].flow.filter((step) => step.action === "drawAndContinue")).toHaveLength(4);
    expect(scenarios[2].sessions).toHaveLength(2);
  });

  it("test-only保存fixtureは45文字と46文字の境界だけを変える", () => {
    const locked = createProgressFixture({ completedKanaCount: 45, currentKana: "ん", stage: "intro" });
    const unlocked = createProgressFixture({ completedKanaCount: 46, currentKana: "ん", stage: "reward" });

    expect(Object.values(locked.kana).filter((entry) => entry.completedOnce)).toHaveLength(45);
    expect(locked.kana.ん.completedOnce).toBe(false);
    expect(Object.values(unlocked.kana).filter((entry) => entry.completedOnce)).toHaveLength(46);
    expect(Object.keys(unlocked.words)).toHaveLength(60);
  });

  it("親境界・8px gap・48px touch targetの違反を対象名付きで返す", () => {
    const issues = findContainmentIssues({
      viewport: { width: 390, height: 844 },
      root: { left: 0, top: 0, right: 391, bottom: 844, width: 391, height: 844 },
      card: { left: 10, top: 100, right: 380, bottom: 700, width: 370, height: 600 },
      children: [{ name: "illustration", rect: { left: 20, top: 120, right: 381, bottom: 200, width: 361, height: 80 } }],
      hudBottom: 80,
      materialTop: 84,
      targets: [{ name: "choice-a", rect: { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 } }],
    });

    expect(issues).toContain("root右端overflow: 391 > 390");
    expect(issues).toContain("card内overflow: illustration");
    expect(issues).toContain("HUDと教材のgap不足: 4px");
    expect(issues).toContain("touch target不足: choice-a 40x40");
  });

  it("書字開始前のidle paintを30fps連続遅延へ数えない", () => {
    const metrics = analyzeWritingSamples({
      pointerTimes: [100, 110, 120],
      paintTimes: [0, 50, 90, 105, 125, 145],
    });

    expect(metrics.frameIntervalsMs).toEqual([20, 20]);
    expect(metrics.maxPointerToPaintMs).toBe(15);
    expect(metrics.consecutiveFrameIntervalsOver38Ms).toBe(0);
  });

  it("主要選択肢の64px不足と親・viewport外配置を同時に拒否する", () => {
    const root = { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 };
    const issues = findContainmentIssues({
      viewport: { width: 390, height: 844 },
      root,
      card: { left: 10, top: 100, right: 410, bottom: 700, width: 400, height: 600 },
      children: [],
      regions: [
        {
          name: "card",
          rect: { left: 10, top: 100, right: 410, bottom: 700, width: 400, height: 600 },
          parentRect: { left: 20, top: 90, right: 370, bottom: 710, width: 350, height: 620 },
        },
        {
          name: "actions",
          rect: { left: 380, top: 90, right: 430, bottom: 200, width: 50, height: 110 },
          parentRect: root,
        },
      ],
      hudBottom: 80,
      materialTop: 100,
      targets: [{
        name: "choice-outside",
        primary: true,
        rect: { left: 400, top: 100, right: 450, bottom: 150, width: 50, height: 50 },
        parentRect: root,
      }],
    });

    expect(issues).toContain("touch target不足: choice-outside 50x50 (64px必要)");
    expect(issues).toContain("touch target親境界外: choice-outside");
    expect(issues).toContain("touch target viewport外: choice-outside");
    expect(issues).toContain("layout親境界外: card");
    expect(issues).toContain("layout viewport外: card");
    expect(issues).toContain("layout親境界外: actions");
    expect(issues).toContain("layout viewport外: actions");
  });

  it("次の描画frameへ対応しなかったpointerを欠落として数える", () => {
    const metrics = analyzeWritingSamples({
      pointerTimes: [100, 110, 120],
      paintTimes: [105],
    });

    expect(metrics.unpaintedPointerEvents).toBe(2);
  });

  it("READMEの公式Playwright imageをlockfileと同じ版にして空volumeへ依存しない", async () => {
    const [readme, lockSource] = await Promise.all([
      readFile(resolve(REPOSITORY_ROOT, "README.md"), "utf8"),
      readFile(resolve(REPOSITORY_ROOT, "package-lock.json"), "utf8"),
    ]);
    const lock = JSON.parse(lockSource);
    const playwrightVersion = lock.packages["node_modules/playwright"].version;

    expect(readme).toContain(`mcr.microsoft.com/playwright:v${playwrightVersion}-noble`);
    expect(readme).not.toContain("hiraganastudy_playwright_browsers:/ms-playwright:ro");
  });
});
