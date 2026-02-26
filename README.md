# IIIF Annotator

IIIF Presentation API v3 Manifest に対してテキスト文字起こしアノテーションを作成・編集する Web アプリです。
`npx` でローカル起動し、ブラウザ上で操作できます。

## 使い方（npx）

Node.js 18 以上が必要です。

```bash
npx iiif-annotator
```

ブラウザで http://localhost:3000 を開いて利用してください。

### オプション

| オプション | 説明 | デフォルト |
|---|---|---|
| `--port=<n>` | ポート番号 | `3000` |
| `--data=<dir>` | データ保存ディレクトリ | `~/.iiif-annotator` |
| `--open` | ブラウザを自動で開く | — |
| `--help` | ヘルプを表示 | — |

```bash
# ポートとデータディレクトリを指定してブラウザも自動オープン
npx iiif-annotator --port=3001 --data=/path/to/data --open
```

## 機能

### プロジェクト管理

- プロジェクト一覧の表示（作成日時・最終更新日時）
- プロジェクトの再開・削除（削除前に確認ダイアログ）
- 新規プロジェクト作成（以下の入力経路から選択）

### コンテンツ読み込み

- **IIIF Manifest URL** — リモートの manifest を URL 指定で読み込む
- **Manifest JSON ファイル** — ローカルの `manifest.json` をアップロード
- **画像・PDF ファイルのアップロード** — JPEG・PNG・PDF を複数選択してアップロードすると IIIF manifest を自動生成
  - PDF はサーバーサイドで各ページを PNG 画像に変換（PDFium 使用）
  - Canvas の画像 URI はローカルサーバーのパスを使用

### 画像表示・アノテーション編集

- OpenSeadragon によるディープズームビューア（マウスホイール・ドラッグ対応）
- マウスドラッグで矩形アノテーションを作成
- 矩形の移動・リサイズ（8 方向ハンドル）
- テキスト入力・言語コード（`xml:lang`）の設定
- アノテーション一覧（Y 座標順、テキストプレビュー付き）
- アノテーション操作後に自動保存

### ページナビゲーション

- サムネイル一覧パネル（現在 Canvas をハイライト）
- 前後ページボタン・キーボードショートカット（← →）
- 現在ページ数 / 総ページ数の表示

### NDL OCR 読み込み

- 国立国会図書館（NDL）の NDLOCR-Liteで出力されるJSONからアノテーションを一括インポート

### エクスポート

- アノテーション埋め込み済み IIIF Presentation API v3 準拠 manifest を JSON-LD 形式でダウンロード
- 各 Canvas の `AnnotationPage` を `annotations` フィールドに埋め込んだ単一 JSON ファイルとして出力

## データ保存先

デフォルトのデータ保存先は `~/.iiif-annotator` です。`--data` オプションまたは環境変数 `IIIF_DATA_DIR` で変更できます。

```
~/.iiif-annotator/
  projects/
    [project-uuid]/
      meta.json          # プロジェクトメタ情報
      manifest.json      # IIIF manifest
      annotations/
        [canvas-index].json  # Canvas ごとの AnnotationPage
  uploads/
    [project-uuid]/
      [filename]         # アップロード・変換された画像ファイル
```

## 注意事項

- 画像ファイルアップロードで生成した manifest に含まれる画像 URI はローカルサーバーのパスを使用するため、エクスポートした manifest は別環境では画像を参照できません。
