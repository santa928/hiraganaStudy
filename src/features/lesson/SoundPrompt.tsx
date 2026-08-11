import { SpeakerIcon } from "./SpeakerIcon";

/** 画像名称を推測させず、再生操作だけを大きく示す音合わせカード。 */
export function SoundPrompt({ onReplay }: { readonly onReplay: () => void }): React.JSX.Element {
  return (
    <button className="soundPrompt" type="button" aria-label="こえを きく" onClick={onReplay}>
      <SpeakerIcon />
      <span>こえを きく</span>
    </button>
  );
}
