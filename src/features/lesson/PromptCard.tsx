import { useState } from "react";

import { getIllustration, type IllustrationAsset } from "../learning/content/assetCatalog";
import type { KanaEntry } from "../learning/content/types";

/** 問題カードへ必要な対象文字と、読み込み済みイラストをまとめる。 */
export interface PromptCardProps {
  readonly entry: KanaEntry;
  readonly showCharacter: boolean;
  readonly emphasized?: boolean;
}

/** 大きな文字を主役にして、イラストを音と意味の補助に置く教材カード。 */
export function PromptCard({ entry, showCharacter, emphasized = false }: PromptCardProps): React.JSX.Element {
  const [hasImageError, setHasImageError] = useState(false);
  const [retryIndex, setRetryIndex] = useState(0);
  const asset: IllustrationAsset = getIllustration(entry.illustrationKey);
  const imageSource = retryIndex === 0 ? asset.src : `${asset.src}?retry=${retryIndex}`;

  return (
    <section className={`promptCard ${showCharacter ? "" : "promptCard--illustrationOnly"}`} aria-label={`${entry.character} の おだい`}>
      {showCharacter ? (
        <p className={`promptCard__character ${emphasized ? "promptCard__character--guide" : ""}`} data-testid="prompt-character">
          {entry.character}
        </p>
      ) : null}
      <div className="promptCard__illustrationWrap">
        {hasImageError ? (
          <button
            className="promptCard__fallback"
            data-testid="illustration-fallback"
            type="button"
            aria-label="イラストを もういちど よみこむ"
            onClick={() => {
              setRetryIndex((value) => value + 1);
              setHasImageError(false);
            }}
          >
            {showCharacter ? <span>{entry.character}</span> : null}
          </button>
        ) : (
          <img
            className="promptCard__illustration"
            data-testid="prompt-illustration"
            src={imageSource}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            onError={() => setHasImageError(true)}
          />
        )}
      </div>
    </section>
  );
}
