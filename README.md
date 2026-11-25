# ごはん記録（食事記録・おすすめ PWA）

iPhone のホーム画面に追加して使う Web アプリです。ビルド不要（素の HTML / CSS / JavaScript）、追加費用 0 円で動きます。

- 記録はすべて iPhone の中（IndexedDB）に保存され、GitHub には送られません。
- GitHub に置くのは、アプリ本体と Mensa のメニューデータだけです。

## 初回セットアップ（1 回だけ）

1. GitHub で **Public** のリポジトリを作成します（例: `meal-app`）。
2. このフォルダの中身をすべて push します（`.github` フォルダも含めます）。
   ```sh
   cd meal-app
   git init && git add . && git commit -m "first version"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/meal-app.git
   git push -u origin main
   ```
3. GitHub のリポジトリで **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
4. **Actions** タブ → 「Mensa menu & deploy」→ **Run workflow** を押します（初回のメニュー取得と公開）。
5. 完了後、iPhone の Safari で `https://<ユーザー名>.github.io/meal-app/` を開き、共有ボタン →「ホーム画面に追加」を選びます。

以降は、平日の朝と昼前に GitHub Actions が Mensa のメニューを自動で取得・蓄積し、アプリを開いたときに端末へ取り込みます。

## アプリを更新したとき

`sw.js` の `VERSION` と `js/version.js` の `APP_VERSION` を上げてから push します。次にアプリを開いたときに新しい版へ切り替わります。

## 普段よく食べるものの取り込み

設定 →「取り込み用テンプレート CSV」で列の形式を確認し、同じ形式で作った CSV を「普段よく食べるものを CSV から取り込む」で読み込みます。

| 列 | 内容 |
|---|---|
| 種別 | `市販品` または `自作料理` |
| 商品名・販売者名 | 市販品の場合 |
| 料理名・献立名 | 自作料理の場合（料理名はパスタ・ラーメンなどの品目） |
| 量の選択肢 | `100g\|150g\|200g`、`1袋\|2袋`、`0.5人前\|1人前` など |
| 栄養の基準 | 栄養の値が何あたりか（`100g`、`1袋`、`1人前` など） |
| 栄養の列 | 空欄可。自作料理で空欄なら料理名の既定値、市販品で空欄なら記録時に Open Food Facts で補完 |

## 構成

```
index.html, css/, js/          アプリ本体
js/logic/                      計算処理（DOM を使わない。tests/ で単体テスト）
js/views/                      各画面
data/dishes.json               自作料理の栄養の目安
data/foods.json                汎用の食品データ
data/recipes.json              おすすめ用レシピ
data/mensa/                    GitHub Actions が蓄積する Mensa メニュー（週ごとの JSON）
scripts/fetch-mensa.mjs        Mensa 取得スクリプト
.github/workflows/mensa.yml    定期取得と GitHub Pages への公開
```

Mensa のデータ源: `https://www.stwdo.de/api/v2/speiseplan/naechste-2-wochen?verbrauchsortnr=341`（Hauptmensa の 2 週間分。英語名と学生価格を使用）

## テスト

```sh
npm test   # Node.js 22 以上。js/logic と scripts の単体テストのみ
```
