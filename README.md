# ひらがなのにわ

文字をまだ読めない3歳ごろの子どもが、絵と音声を手がかりに、ひらがなの形・音・書字を五十音順で育てる静的Webゲームです。基本46文字を一文字ずつ終えると、固定60語の「ことばのにわ」が開きます。

アカウント、広告、課金、分析基盤、外部サーバーはありません。学習記録と設定は遊ぶ端末内だけへ保存します。

## 収録内容

- 基本46文字: 絵付き導入、同じ形、読めた花、任意の太いなぞり・細いなぞり・お手本書き・自由書き
- 行ごとの形と任意の音復習（あ行は2択、以後は3択）
- 60語: 絵と音声から選ぶ、文字タイルを並べる、読めた花、任意の一文字書き
- 46文字の画像、45枚の単語専用画像と15枚の再利用画像、66文字分の書字template
- 読み上げ、効果音、庭のBGM、端末保存、保護者画面、PWA、オフライン再起動

点数、時間制限、ゲームオーバー、赤い失敗表示はありません。

## Dockerで起動

ホストへNode.js依存を入れず、Docker内で実行します。

```bash
docker compose run --rm app npm ci
docker compose up app
```

ブラウザで `http://localhost:5173` を開きます。

## 遊び方

1. 最初のスピーカーを触り、音声が使える状態にします。
2. じょうろを触ると「あ」から始まります。
3. 絵付きの導入と形合わせでは、「あひるの あ」のように絵・文字・読み上げを一緒に結び付けます。同じ形を選ぶと、まず「読めた」花が咲きます。
4. 「よむ・かく」では花の後に、太いなぞり、細いなぞり、お手本書き、自由書きへ進めます。どの段階にも64px以上の「あとで」があり、書けなくても読めた花を保って次へ進めます。なぞり見本は枠から余白を空け、指やペンを動かしやすくしています。4段階を体験した花には、上手さの点数ではなく「書く練習もした」鉛筆印が付きます。
5. 行を一通り終えた後だけ任意の「こえで おさらい」を出し、あ行は2択、以後は3択にします。「つぎへ」で飛ばせ、音声が使えない時は自動で飛ばします。
6. 46文字後は「ことばのにわ」で、60語を順に選び、並べます。並べ終えると単語の花が咲き、次の単語へ進めます。「よむ・かく」では単語書字も選べますが、「あとで」にしても読みの進行は止まりません。

単文字レッスンと行復習は、右上の家ボタンでいつでも庭へ戻れます。庭の「つづきを あそぶ」を押すと、同じ文字・同じ段階から再開します。

庭の右上にある「おとなの せってい」は、2秒長押しすると開きます。「よむ（おすすめ）」と「よむ・かく」の学び方、読み／書字それぞれの学習状況、音声・音楽・効果音・動きを減らす設定、保存・PWA状態を確認できます。途中で学び方を変えても、花や書字途中の記録は失われません。全リセットは3枚の葉を左から順に触れ、最後の確認を押した時だけ実行されます。

途中の花の演出は効果音設定に従い、「動きを減らす」がONの時は動かない花印だけを表示します。

## 保存・音声・オフライン

- 進捗はIndexedDBへ保存し、使えない場合はlocalStorageへ退避します。旧保存データはschema v2へ自動移行し、既存利用者は従来どおり「よむ・かく」、新規利用者は「よむ」から始まります。端末間同期やクラウドbackupはありません。
- 読み上げは端末に入っている日本語音声へ依存します。音声が使えない端末でも、絵と視覚案内だけで進められます。日本語音声の利用可否は端末やブラウザにより、オフライン時も異なります。
- 一度オンラインで読み込み、保護者画面のPWA表示が「オフラインで使えます」になった後は、アプリ本体・画像・効果音を通信なしで再起動できます。
- 更新が見つかった時は、いま遊んでいる画面をその版のまま保ち、次回のアプリ起動で画面と教材cacheをまとめて切り替えます。

## 検証

```bash
docker compose run --rm app npm test -- --run --maxWorkers=1
docker compose run --rm app npm run typecheck
docker compose run --rm app npm run lint
docker compose run --rm app npm run verify:content
docker compose run --rm app npm run verify:images
docker compose run --rm app npm run build:pages
```

完成導線と4代表viewportをproduction buildで再確認する場合は、一時previewを起動したまま別terminalでPlaywright検証を実行します。`npm ci` が固定するPlaywright 1.62.0と同じ公式imageには対応browserとOS依存が収録されているため、空のbrowser volumeやホスト側installには依存しません。Playwright containerはpreviewと同じnetworkへ入り、Service Workerや古いcacheを持ち越さない独立contextを使います。

```bash
docker compose run --rm -e BASE_PATH=/ app npm run build
docker compose run --rm --name hiragana-final-preview -p 4176:4173 -e BASE_PATH=/ app npm run preview -- --host 0.0.0.0

docker run --rm --network container:hiragana-final-preview \
  -v "$PWD:/workspace" \
  -v hiraganastudy_node_modules:/workspace/node_modules:ro \
  -w /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.0-noble npm run verify:game

docker run --rm --network container:hiragana-final-preview \
  -v "$PWD:/workspace" \
  -v hiraganastudy_node_modules:/workspace/node_modules:ro \
  -w /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.0-noble npm run verify:layout
```

結果は `test-results/game/` に保存されます。`verify:game` は初回「あ」・庭への状態保持往復・行復習への状態保持往復・4書字段階・45/46文字境界を、`verify:layout` は390×844、844×390、820×1180、1180×820の境界・主要64px／補助48px操作領域・画像読込・書字paintを確認します。Docker内の性能値は実機性能認証ではなく、継続的な大幅遅延がないかを見る参考値です。

PWA iconを基準画像から再生成する場合:

```bash
docker compose run --rm app npm run generate:pwa-icons
```

## GitHub Pages

`.github/workflows/deploy-pages.yml` は `main` へのpush時に、テスト・型・lint・repository名のsubpath buildを通してからPages artifactを公開します。GitHub repositoryの **Settings → Pages → Build and deployment** は **GitHub Actions** を選びます。

実際のpushと公開は、完成監査後に明示確認してから行います。

## 第三者ライセンス

書き順データは `public/licenses/fude-kana-data/` の `LICENSE` と `NOTICE` を参照してください。収録画像・音声の帰属情報は `THIRD_PARTY_NOTICES.md` に記載しています。
