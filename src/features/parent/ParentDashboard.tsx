import { useEffect, useRef, useState } from "react";

import { KANA_ENTRIES } from "../learning/content/kana";
import type { LearningProgress, LearningSettings } from "../learning/model/types";
import type { AudioGuideStatus } from "../../platform/audio/AudioGuide";
import "./ParentDashboard.css";

/** 保護者へ実装済み状態だけを示す、拡張可能な端末環境情報。 */
export interface ParentEnvironment {
  readonly audioStatus: AudioGuideStatus;
  readonly storage: "normal" | "fallback";
  readonly displayMode: "browser" | "standalone";
  readonly pwaStatus: string;
}

/** 保護者画面の保存・設定・閉じる操作を分離した入力。 */
export interface ParentDashboardProps {
  readonly progress: LearningProgress;
  readonly environment: ParentEnvironment;
  readonly onSettingsChange: (settings: LearningSettings) => void;
  readonly onReset: () => Promise<void>;
  readonly onClose: () => void;
}

const LEAVES = ["left", "center", "right"] as const;
const STATUS_FIELDS = [
  ["seen", "みた"], ["shapeMatched", "かたち"], ["soundMatched", "おと"], ["traceWideTried", "ふとい なぞり"], ["traceNarrowTried", "ほそい なぞり"], ["copyTried", "おてほん"], ["freeWriteTried", "じぶんで かく"], ["completedOnce", "さいた"],
] as const satisfies ReadonlyArray<readonly [keyof LearningProgress["kana"][typeof KANA_ENTRIES[number]["character"]], string]>;

/** 生の端末statusを、保護者に読める日本語へ変換する。 */
function audioStatusLabel(status: AudioGuideStatus): string {
  return status === "ready" ? "つかえます" : status === "locked" ? "タップすると つかえます" : "画面だけで あそべます";
}

/** 内部の表示modeを、画面で使う日本語へ変換する。 */
function displayModeLabel(mode: ParentEnvironment["displayMode"]): string {
  return mode === "standalone" ? "アプリのように ひらいています" : "ブラウザで ひらいています";
}

/** 3枚の葉と最終確認を通して、意図的な初期化だけを実行する。 */
export function ParentDashboard({ progress, environment, onSettingsChange, onReset, onClose }: ParentDashboardProps): React.JSX.Element {
  const [leafIndex, setLeafIndex] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const settings = progress.settings;
  const changeSetting = (key: keyof LearningSettings): void => onSettingsChange({ ...settings, [key]: !settings[key] });
  const touchLeaf = (leaf: typeof LEAVES[number]): void => {
    setResetError(null);
    setLeafIndex((current) => LEAVES[current] === leaf ? current + 1 : 0);
  };
  const reset = (): void => {
    if (resetting) return;
    setResetting(true);
    setResetError(null);
    void onReset().then(() => {
      if (mountedRef.current) setLeafIndex(0);
    }).catch(() => {
      if (mountedRef.current) setResetError("リセットできませんでした。もういちど ためしてね。");
    }).finally(() => {
      if (mountedRef.current) setResetting(false);
    });
  };

  return <main className="parentDashboard" aria-label="おとなの せってい">
    <header className="parentDashboard__header"><h1>おとなの せってい</h1><button type="button" aria-label="にわへ もどる" onClick={onClose}>にわへ もどる</button></header>
    <section><h2>いまの きろく</h2><p>いまは「{KANA_ENTRIES[progress.currentKanaIndex]?.character ?? "あ"}」の ところです。</p>
      <div className="parentDashboard__tableWrap"><table><thead><tr><th>もじ</th>{STATUS_FIELDS.map(([field, label]) => <th key={field}>{label}</th>)}<th>もういちど案内した文字</th></tr></thead><tbody>{KANA_ENTRIES.map((entry) => {
        const item = progress.kana[entry.character];
        return <tr key={entry.character}><th>{entry.character}</th>{STATUS_FIELDS.map(([field]) => <td key={field}>{item[field] ? "✓" : "—"}</td>)}<td>{item.guideCount}</td></tr>;
      })}</tbody></table></div>
    </section>
    <section><h2>おとと うごき</h2>{([ ["speech", "こえ"], ["music", "おんがく"], ["effects", "こうかおん"], ["reducedMotion", "うごきを へらす"] ] as const).map(([key, label]) => <label className="parentDashboard__setting" key={key}><input type="checkbox" aria-label={label} checked={settings[key]} onChange={() => changeSetting(key)} />{label}</label>)}</section>
    <section><h2>この たんまつ</h2><p>音声: {audioStatusLabel(environment.audioStatus)}</p><p>保存: {environment.storage === "normal" ? "通常" : "代替"}</p><p>表示: {displayModeLabel(environment.displayMode)}</p><p>PWA: {environment.pwaStatus}</p></section>
    <section className="parentDashboard__reset"><h2>はじめからに する</h2><p>{leafIndex === 0 ? "ひだりの はから さわってね" : leafIndex === 1 ? "まんなかの はを さわってね" : leafIndex === 2 ? "みぎの はを さわってね" : "さいごに かくにんしてね"}</p><div>{LEAVES.map((leaf) => <button type="button" className="parentDashboard__leaf" key={leaf} aria-label={`${leaf === "left" ? "ひだり" : leaf === "center" ? "まんなか" : "みぎ"}の は`} onClick={() => touchLeaf(leaf)}><span aria-hidden="true" /></button>)}</div>{leafIndex === LEAVES.length ? <button type="button" disabled={resetting} onClick={reset}>ほんとうに はじめからにする</button> : null}{resetError ? <p role="alert">{resetError}</p> : null}</section>
  </main>;
}
