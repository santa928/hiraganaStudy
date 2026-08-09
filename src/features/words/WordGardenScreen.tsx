import { WORD_ENTRIES } from "../learning/content/words";
import type { WordStage } from "../learning/content/types";
import type { LearningProgress } from "../learning/model/types";
import "./WordLesson.css";

/** ことばの花壇へ渡す、保存進捗と開始・復習操作。 */
export interface WordGardenScreenProps {
  readonly progress: LearningProgress;
  readonly onStart: (wordId: string) => void;
  readonly onReview: (wordId: string) => void;
  readonly onBackToGarden: () => void;
}

const STAGES: readonly WordStage[] = ["W1", "W2", "W3", "W4", "W5"];
const STAGE_LABELS: Readonly<Record<WordStage, string>> = {
  W1: "はじめの はなだん",
  W2: "のびる はなだん",
  W3: "にぎやか はなだん",
  W4: "ちいさな もじの はなだん",
  W5: "おおきな ことばの はなだん",
};

/** 書字まで終えた語だけを、復習できる花として扱う。 */
function isComplete(progress: LearningProgress, wordId: string): boolean {
  const word = progress.words[wordId];
  return word?.selected === true && word.arranged === true && word.writingTried === true;
}

/** 本線を巻き戻さない最初の未完了語を返す。 */
export function findNextWordId(progress: LearningProgress): string | null {
  return WORD_ENTRIES.find((word) => !isComplete(progress, word.id))?.id ?? null;
}

/** 5段階のことばの花壇。数値スコアではなく、育った語だけを復習口にする。 */
export function WordGardenScreen({ progress, onStart, onReview, onBackToGarden }: WordGardenScreenProps): React.JSX.Element {
  const nextWordId = findNextWordId(progress);
  const nextWord = WORD_ENTRIES.find((word) => word.id === nextWordId);

  return <main className="wordGarden" data-testid="word-garden" data-layout="word-garden-root">
    <header className="wordGarden__header"><p>ことばの にわ</p><button className="wordGarden__back" type="button" onClick={onBackToGarden}>もじの にわへ</button></header>
    <section className="wordGarden__beds" data-layout="word-garden-beds" aria-label="5つの ことばの はなだん">
      {STAGES.map((stage) => <section className="wordGarden__bed" key={stage} data-current={nextWord?.stage === stage || undefined}>
        <h2>{STAGE_LABELS[stage]}</h2>
        <div>{WORD_ENTRIES.filter((word) => word.stage === stage).map((word) => isComplete(progress, word.id)
          ? <button type="button" className="wordGarden__flower" key={word.id} onClick={() => onReview(word.id)}>{word.text}</button>
          : <span className="wordGarden__seed" key={word.id} aria-label="これから そだつ ことば" />)}</div>
      </section>)}
    </section>
    <footer className="wordGarden__footer" data-layout="word-garden-cta">
      {nextWordId ? <button className="wordGarden__start" type="button" onClick={() => onStart(nextWordId)}>ことばを そだてよう</button> : <p className="wordGarden__complete">ことばの にわが さきました</p>}
    </footer>
  </main>;
}
