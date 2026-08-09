# ひらがなのにわ

文字をまだ読めない3歳ごろの子どもが、絵と音声を手がかりに、ひらがなの形・音・書字を五十音順で育てる静的Webゲームです。基本46文字を一文字ずつ終えると、固定60語の「ことばのにわ」が開きます。

アカウント、広告、課金、分析基盤、外部サーバーはありません。学習記録と設定は遊ぶ端末内だけへ保存します。

## 収録内容

- 基本46文字: 導入、同じ形、同じ音、太いなぞり、細いなぞり、お手本を見て書く、自分で書く、花の報酬
- 行ごとの形・音の復習
- 60語: 絵と音声から選ぶ、文字タイルを並べる、一文字ずつ書く
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
3. 大きな対象文字と同じ形を選び、音を聞き、指やペンで書きます。
4. 一文字が終わると庭に花が増えます。五十音順に46文字を進めます。
5. 46文字後は「ことばのにわ」で、60語を順に選び、並べ、書きます。

庭の右上にある「おとなの せってい」は、2秒長押しすると開きます。学習状況、音声・音楽・効果音・動きを減らす設定、保存・PWA状態を確認できます。全リセットは3枚の葉を左から順に触れ、最後の確認を押した時だけ実行されます。

## 保存・音声・オフライン

- 進捗はIndexedDBへ保存し、使えない場合はlocalStorageへ退避します。端末間同期やクラウドbackupはありません。
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

完成導線と4代表viewportをproduction buildで再確認する場合は、一時previewを起動したまま別terminalでPlaywright検証を実行します。Playwright containerはpreviewと同じnetworkへ入り、Service Workerや古いcacheを持ち越さない独立contextを使います。

```bash
docker compose run --rm -e BASE_PATH=/ app npm run build
docker compose run --rm --name hiragana-final-preview -p 4176:4173 -e BASE_PATH=/ app npm run preview -- --host 0.0.0.0

docker run --rm --network container:hiragana-final-preview \
  -v "$PWD:/workspace" \
  -v hiraganastudy_node_modules:/workspace/node_modules:ro \
  -v hiraganastudy_playwright_browsers:/ms-playwright:ro \
  -w /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.60.0-noble npm run verify:game

docker run --rm --network container:hiragana-final-preview \
  -v "$PWD:/workspace" \
  -v hiraganastudy_node_modules:/workspace/node_modules:ro \
  -v hiraganastudy_playwright_browsers:/ms-playwright:ro \
  -w /workspace -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.60.0-noble npm run verify:layout
```

結果は `test-results/game/` に保存されます。`verify:game` は初回「あ」・4書字段階・45/46文字境界を、`verify:layout` は390×844、844×390、820×1180、1180×820の境界・48px操作領域・画像読込・書字paintを確認します。Docker内の性能値は実機性能認証ではなく、継続的な大幅遅延がないかを見る参考値です。

PWA iconを基準画像から再生成する場合:

```bash
docker compose run --rm app npm run generate:pwa-icons
```

## GitHub Pages

`.github/workflows/deploy-pages.yml` は `main` へのpush時に、テスト・型・lint・repository名のsubpath buildを通してからPages artifactを公開します。GitHub repositoryの **Settings → Pages → Build and deployment** は **GitHub Actions** を選びます。

実際のpushと公開は、完成監査後に明示確認してから行います。

## 第三者ライセンス

書き順データは `public/licenses/fude-kana-data/` の `LICENSE` と `NOTICE` を参照してください。収録画像・音声の帰属情報は `THIRD_PARTY_NOTICES.md` に記載しています。
