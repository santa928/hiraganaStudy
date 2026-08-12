import { useEffect, useState } from "react";

import { WritingCanvas, type WritingMode } from "../writing/WritingCanvas";
import { loadStrokeTemplate } from "../writing/data/types";
import type { KanaCharacter } from "../learning/content/types";

/** 書字段階と状態機械の完了操作を安全に接続する。 */
export interface WritingStepProps {
  readonly character: KanaCharacter;
  readonly mode: WritingMode;
  readonly onComplete: () => void;
  readonly onDefer: () => void;
  readonly celebrating?: boolean;
}

/** 一筆を確定するまで次段階を待機し、全書字段階から読み本線へ戻れるようにする。 */
export function WritingStep({ character, mode, onComplete, onDefer, celebrating = false }: WritingStepProps): React.JSX.Element {
  const [hasStroke, setHasStroke] = useState(false);
  const [isModelVisible, setIsModelVisible] = useState(false);
  const template = loadStrokeTemplate(character);
  const isCopy = mode === "copyWithModel";
  const isFree = mode === "freeWrite";

  useEffect(() => {
    setHasStroke(false);
    setIsModelVisible(false);
  }, [character, mode]);

  return (
    <section className="writingStep" data-testid="writing-step" data-writing-mode={mode} data-celebrating={celebrating || undefined}>
      {isCopy ? <p className="writingStep__model" aria-label="おてほん">{character}</p> : null}
      {isFree ? <button
        className="writingStep__smallModel"
        type="button"
        disabled={celebrating}
        aria-label={`${character} の おてほんを ${isModelVisible ? "かくす" : "みる"}`}
        onClick={() => setIsModelVisible((value) => !value)}
      >
        {isModelVisible ? character : null}
      </button> : null}
      <div className="writingStep__canvas">
        <WritingCanvas
          template={template}
          mode={mode}
          resetKey={`${character}-${mode}`}
          disabled={celebrating}
          onChange={(strokes) => setHasStroke(strokes.length > 0)}
        />
      </div>
      <div className="writingStep__actions">
        <button className="lessonButton lessonButton--secondary lessonButton--defer" data-layout="writing-defer" type="button" disabled={celebrating} onClick={onDefer}>あとで</button>
        <button className="lessonButton" type="button" disabled={!hasStroke || celebrating} onClick={onComplete}>つぎへ</button>
      </div>
    </section>
  );
}
