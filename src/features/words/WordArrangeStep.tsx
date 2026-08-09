import { useMemo, useState } from "react";

/** 一文字タイルを順に置く、単語並べ替えの公開入力。 */
export interface WordArrangeStepProps {
  readonly word: string;
  readonly onComplete: () => void;
  readonly onGuide?: () => void;
  readonly reducedMotion?: boolean;
}

interface CharacterTile { readonly id: string; readonly character: string; }

/** 同じ文字もindex付きIDにし、重複文字を失わずに並べる。 */
function createTiles(word: string): readonly CharacterTile[] {
  const tiles = [...word].map((character, index) => ({ id: `${character}-${index}`, character }));
  if (tiles.length < 2) return tiles;
  const seed = [...word].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0);
  const shift = (seed % (tiles.length - 1)) + 1;
  return [...tiles.slice(shift), ...tiles.slice(0, shift)];
}

/** 指定順を一文字ずつ完成する、穏やかな単語タイル面。 */
export function WordArrangeStep({ word, onComplete, onGuide, reducedMotion = false }: WordArrangeStepProps): React.JSX.Element {
  const tiles = useMemo(() => createTiles(word), [word]);
  const [placed, setPlaced] = useState<readonly CharacterTile[]>([]);
  const [available, setAvailable] = useState(tiles);
  const [guideKey, setGuideKey] = useState(0);
  const nextCharacter = [...word][placed.length];

  const pick = (tile: CharacterTile): void => {
    if (tile.character !== nextCharacter) {
      setGuideKey((current) => current + 1);
      onGuide?.();
      return;
    }
    const nextPlaced = [...placed, tile];
    setPlaced(nextPlaced);
    setAvailable((current) => current.filter((candidate) => candidate.id !== tile.id));
    if (nextPlaced.length === tiles.length) onComplete();
  };

  return <section className="wordLesson__arrange" data-testid="word-arrange" data-reduced-motion={reducedMotion || undefined}>
    <p>もじを ならべよう</p>
    <div className="wordLesson__placed" key={guideKey} aria-label="ならべた ことば" data-guide={guideKey || undefined}>{placed.map((tile) => <span key={tile.id}>{tile.character}</span>)}</div>
    <div className="wordLesson__tiles" data-layout="word-tiles" aria-label="もじの タイル">
      {available.map((tile) => <button className="wordLesson__tile" type="button" key={tile.id} aria-label={tile.character} data-tile-id={tile.id} onClick={() => pick(tile)}>{tile.character}</button>)}
    </div>
  </section>;
}
