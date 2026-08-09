/** render_game_to_textを複数mountと既存hookを壊さず提供するための購読元。 */
type TextStateSource = () => string;

declare global {
  interface Window {
    render_game_to_text?: () => string;
  }
}

const sources = new Map<symbol, TextStateSource>();
let savedRenderGameToText: Window["render_game_to_text"] | undefined;
let registered = false;

/** 現在のゲーム状態を返すtest hookを登録し、最後のunmountで元のhookを復元する。 */
export function registerGameTextState(source: TextStateSource): () => void {
  const token = Symbol("game-text-state");
  if (!registered) {
    savedRenderGameToText = window.render_game_to_text;
    window.render_game_to_text = (): string => {
      const latest = Array.from(sources.values()).at(-1);
      return latest ? latest() : "{}";
    };
    registered = true;
  }
  sources.set(token, source);

  return () => {
    sources.delete(token);
    if (sources.size !== 0 || !registered) return;
    window.render_game_to_text = savedRenderGameToText;
    savedRenderGameToText = undefined;
    registered = false;
  };
}
