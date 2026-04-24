# Stamp Studio (LBS Stamp Studio)
Stampikoのスタンプを生成・管理する管理ツール。

## ⚠️ Security Rules
- GEMINI_API_KEY, FIREBASE_* をフロントエンドに露出させない（VITE_接頭辞のみクライアント許可）
- Gemini APIプロンプトにユーザー入力を直接結合しない（プロンプトインジェクション防止）
- Firebase Storage: ファイルサイズ・MIME type を制限

## Code Conventions
- Images: always removeWhiteBackground() before Storage upload
- Spot type template stamps (API側 satori 合成): SVG/Canvas composition, NO Gemini API
- 管理ツール側 `stamp_templates/{category}` の差し替え: Gemini 生成を許容（暫定→本格置き換え用、16カテゴリ）
- Spot types: 'landmark' | 'data_spot' | 'generic'

## Specs
Notionがマスター。specs/は同期コピー。仕様書にない機能は追加禁止。
更新: `node scripts/export-specs-from-notion.mjs`

## Task Guidelines
- 1タスク7〜10関数以内。1PR1機能。
- 既存コードを読んで理解してから実装。
- Firestoreの新フィールドは既存データ互換のデフォルト値を設定。

## ⚠️ Data Integrity Rules（2026-04-17 事故教訓）
Firestoreの配列全量上書きでデザイナーの作業データ400件超が消失した。二度と起こさないための絶対ルール:

### 設計原則
- **Firestoreの配列フィールドでデータベースを再現しない**。ユーザーが作成するデータは必ず個別ドキュメント（1件1doc）方式にする
- **`setDoc` で配列を丸ごと上書きする設計は禁止**。`arrayUnion` / `arrayRemove` か個別ドキュメントを使う
- **エラー時にデータを捨てない**。`return null` + `filter(Boolean)` は「失敗=消失」パターン。失敗してもメタデータは残すこと
- **非同期ロード完了前の `setState` 上書きに注意**。functional update (`prev => ...`) で既存データを保持する

### テスト義務
- 永続化・データ同期の変更は、**実Firebase環境でのスモークテストを必ず通してからデプロイ**する
- 最低限の検証項目:
  1. ライフサイクル: N件保存 → セッション切替（別ブラウザコンテキスト）→ N件復元
  2. 冪等性: リロード3回で件数不変
  3. 障害耐性: upload失敗時にデータが消えないこと
- スモークスクリプト: `scripts/smoke-storage-upload.mjs`, `scripts/smoke-data-integrity.mjs`, `scripts/smoke-template-management.mjs`, `scripts/smoke-template-write.mjs`
- Vitest + Build OK だけで「テスト済み」と報告しない

### 現行アーキテクチャ
- customStamps: `studio_custom_stamps/{stampId}` 個別ドキュメント（2026-04-17移行済）
- stampTemplates: `stamp_templates/{category}` 個別ドキュメント（2026-04-24追加、16カテゴリ分のテンプレート画像管理）
- 画像: Firebase Storage `studio_custom_stamps/{stampId}.png`, `stamp_templates/{category}_{timestamp}.png`
- 設定（areaConfig/criteria/stampOverrides/ngReasons）: `studio_settings/global`（配列だが頻度低・件数少のため許容）

## Testing
- Tokyo Tower (35.6586, 139.7454), 洗足池 (35.5727, 139.7108)
- GPS: 100m default, 200m for stations
