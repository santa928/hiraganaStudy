import type { JSX } from "react";

/** 初回音声確認から学習画面へ接続するアプリルート。 */
export function App(): JSX.Element {
  return (
    <main className="app-shell">
      <button className="sound-gate" aria-label="こえを きく" type="button">
        <span aria-hidden="true">🔊</span>
      </button>
    </main>
  );
}
