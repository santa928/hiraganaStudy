import { SpeakerIcon } from "./SpeakerIcon";

/** 行を一通り習った後の任意復習で、再生操作だけを大きく示すカード。 */
export function SoundPrompt({ onReplay }: { readonly onReplay: () => void }): React.JSX.Element {
  return (
    <button className="soundPrompt" type="button" aria-label="こえを きく" onClick={onReplay}>
      <SpeakerIcon />
      <span>こえを きく</span>
    </button>
  );
}
