# Task 5 実装レポート: 日本語音声案内と効果音

## 実装内容

- `AudioGuide` の公開契約（`unlock` / `speak` / `cancel` / `getStatus`）を追加した。
- `BrowserSpeechGuide` は利用者操作でのunlock、`ja-JP` 完全一致→`ja` prefix→端末default→先頭音声の順の選択、`voiceschanged` の遅延到着、timeout/listenerの後始末、割込み・cancel・stale eventの安全なPromise解決を扱う。
- 音声API・音声一覧・発話失敗は例外にせず、視覚案内を継続する。`isSpeechEnabled` と `onSpeakingChange` の注入により、独立した設定とducking接続を可能にした。
- `SoundEffects` は同梱の`tap`、`success`、`sprout`、`garden-loop`だけを定義し、BGM・効果音・読み上げの設定を別々に保持する。音声中はeffect gainを0.35、BGM gainを0.2に下げ、終了時は1へ戻す。
- `scripts/generate-sfx.mjs` は決定的なmono 16-bit PCM WAVを生成し、header、sample rate、channel、bit depth、frame数、peak、先頭末尾sampleを生成時と`--verify`時に機械検査する。

## RED / GREEN

1. RED: `docker compose run --rm app npm test -- --run src/platform/audio` を、テスト先行追加直後に実行した。`BrowserSpeechGuide` と `SoundEffects` が未作成のため、両importを解決できずexit 1となった。
2. GREEN: 実装後、対象2 suite / 12 tests がPASSした。lock解除、voice優先、`voiceschanged`、idempotent unlock、visual-only、interrupt/cancel/stale event、rate clamp、speech設定、独立設定、ducking、base URL、AudioContext/fetch/decode/play失敗を検証した。

## WAV 検証値

| ファイル | sample rate | channel / bit depth | frame数 | peak |
|---|---:|---|---:|---:|
| `tap.wav` | 44,100Hz | mono / 16-bit PCM | 1,985 | 0.24000 |
| `success.wav` | 44,100Hz | mono / 16-bit PCM | 18,522 | 0.22001 |
| `sprout.wav` | 44,100Hz | mono / 16-bit PCM | 12,348 | 0.22999 |
| `garden-loop.wav` | 22,050Hz | mono / 16-bit PCM | 264,600 | 0.22999 |

全ファイルはpeak <= -12dBFS（0.25119）であり、先頭・末尾sampleは0。Docker内で同じgeneratorを連続実行し、4ファイルのSHA-256が不変であることを確認した。

## 全検証

- `docker compose run --rm app npm test -- --run src/platform/audio` — 2 suites / 12 tests passed
- `docker compose run --rm app npm test -- --run` — 7 suites / 97 tests passed
- `docker compose run --rm app npm run typecheck` — passed
- `docker compose run --rm app npm run lint` — passed
- `docker compose run --rm app npm run build` — passed
- `docker compose run --rm app node scripts/generate-sfx.mjs` — 4 WAV生成・機械検査 passed
- `docker compose run --rm app node scripts/generate-sfx.mjs --verify` — 4 WAV検証 passed
- `git diff --cached --check` — whitespace errorなし

## 自己レビュー

- browser constructor、speech synthesis、utterance、AudioContext、fetchを全て注入可能にし、テストがglobalを変更しない構造にした。
- 発話ごとに単調増加IDを持たせ、旧utteranceの`end`/`error`が新しい発話のPromiseやducking状態を変更しないことを確認した。
- asset URLは`/assets`固定ではなく`document.baseURI`または注入`baseUrl`基準なので、GitHub Pagesのサブパスで維持される。
- 生成器が書き込む対象は`public/assets/sfx`配下の4ファイルだけで、外部音源・ネットワーク取得を使わない。

## 懸念

- 実際に使える日本語システム音声は端末・OSに依存する。音声一覧がtimeoutまでに得られない端末では`visual-only`になり、保護者UIから状態を案内する前提である。
- Web Audioは自動再生制限により`source.start()`が失敗する場合がある。その場合も例外を出さず、効果音だけを省略して学習を続ける。

## コミット

- `d1f9ed0ef361174a14fabd4b67d5aa07266715dd` — `日本語音声案内と効果音制御を追加`
