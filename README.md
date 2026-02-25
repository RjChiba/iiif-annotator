# IIIF Annotator

IIIF Presentation API v3 Manifest に対して文字起こしアノテーションを作成・編集する Next.js + TypeScript + Tailwind CSS v4 の Web アプリです。

## セットアップ

```bash
npm install
npm run dev
```

http://localhost:3000 を開いて利用してください。

## 主な機能

- Manifest URL / JSON ファイル / ドラッグ＆ドロップ読み込み
- Canvas サムネイル表示とページ移動（ボタン・キーボード左右キー）
- 画像上で矩形アノテーションの作成・移動・リサイズ
- テキスト編集・言語コード編集・削除
- LocalStorage 自動保存 / 復元 / クリア
- AnnotationPage JSON-LD エクスポート（現在ページ / 全ページZIP）
