# IIIF Annotator

IIIF Presentation API v3 Manifest に対して文字起こしアノテーションを作成・編集する Next.js + TypeScript + Tailwind CSS v4 の Web アプリです。

## セットアップ

```bash
npm install
npm run dev
```

http://localhost:3000 を開いて利用してください。

## 主な機能（v0.3 実装）

- プロジェクト一覧画面（作成日・更新日表示、再開、削除）
- IIIF Manifest URL / JSON ファイルから新規プロジェクト作成
- 画像ファイルの複数アップロードから IIIF Manifest 自動生成
- Canvas 単位のアノテーション自動保存（サーバー側 `/data/projects`）
- プロジェクトごとのアップロード画像保存（`/public/uploads/[project-id]`）
- Canvas サムネイル表示とページ移動（ボタン・キーボード左右キー）
- 画像上で矩形アノテーションの作成・移動・リサイズ
- テキスト編集・言語コード編集・削除
- アノテーション埋め込み Manifest JSON-LD エクスポート

## 注意

- PDF から画像への自動変換は未実装です（アップロード時にエラー表示）。
