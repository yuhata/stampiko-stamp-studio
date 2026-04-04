# Stampiko (LBS Stamp Collection)

## ⚠️ Security Rules (MUST READ FIRST)
- GEMINI_API_KEY, FIREBASE_* をフロントエンドに露出させない（VITE_接頭辞のみクライアント許可）
- Firestoreルールで認証チェック必須（allow read/write: if true は公開データのみ例外）
- ユーザー入力は必ずサニタイズしてからFirestoreに保存
- Firebase Storage: ファイルサイズ・MIME type を制限
- APIエンドポイントにレート制限（特に /api/generate-stamp, /api/auto-generate-spot）
- Gemini APIプロンプトにユーザー入力を直接結合しない（プロンプトインジェクション防止）

## Code Conventions (非標準ルール)
- Firestore: snake_case for collections, camelCase for fields
- Timestamps: serverTimestamp() on write, toDate() on read
- GPS: always Haversine before AI verify
- Images: always removeWhiteBackground() before Storage upload
- Rank: always call checkRankUp() after stamp acquisition
- Template stamps: SVG/Canvas composition, NO Gemini API
- Spot types: 'landmark' | 'data_spot' | 'generic'

## Architecture
- Two-Layer: Landmark (60 curated) + Data Spot (154K+ from OSM, 9 categories)
- Frontend: Vite + React + Leaflet
- API: Express.js + Vercel (GPS verify, Gemini, Firebase)
- Backend: Vite + React (admin)
- DB: Firebase (Firestore + Storage + Auth)
- AI: Gemini 2.5 Flash Image (stamp gen), Gemini 2.0 Flash (photo verify)

## Specs
Notionがマスター。specs/は同期コピー。仕様書にない機能は追加禁止。
- specs/requirements.md — サービス全体設計
- specs/design.md — UI・画面設計書
- specs/implementation.md — 実装仕様書
- specs/stamp-designs.md — スタンプデザイン
- specs/quality-management.md — 品質管理フロー
- specs/branding.md — ブランディングガイド

更新: `node scripts/export-specs-from-notion.mjs`

## Task Guidelines
- 1タスク7〜10関数以内。1PR1機能。
- 既存コードを読んで理解してから実装。
- Firestoreの新フィールドは既存データ互換のデフォルト値を設定。
- テストなしのコードをmainにマージしない。

### セッション分離ルール
コンテキスト汚染を防ぐため、タスク種別ごとにセッションを分ける:
- UI実装とAPI実装は別セッション
- 実装とデバッグは別セッション
- 全仕様書を一度に渡さない。該当Sprint+該当画面のspecsのみ参照

### モデル使い分け
- ルーティン実装（CRUD, UI調整）→ Sonnet / Flash
- 設計判断・リファクタ → Opus
- ドキュメント生成・定型作業 → Haiku / Flash

### フェーズゲートレビュー
Sprint境界でレビュー。Sprint内は基本ノータッチ。
- Sprint完了 → テスト項目を実行 → PR → レビュー → マージ
- Sprint途中でのレビュー依頼は原則なし（ブロッカーのみ例外）

### PR毎セキュリティチェック
- [ ] 環境変数がクライアントコードに含まれていないか
- [ ] Firestoreルールで適切なauthチェックがあるか
- [ ] 外部入力のバリデーションがあるか
- [ ] エラーメッセージに内部情報が含まれていないか
- [ ] 新APIエンドポイントにレート制限があるか

## Environment Variables
- GEMINI_API_KEY / FIREBASE_* (API) / VITE_FIREBASE_* (Frontend)

## Testing
- Tokyo Tower (35.6586, 139.7454), 洗足池 (35.5727, 139.7108)
- GPS: 100m default, 200m for stations. Welcome stamp: spotId='welcome'
- Dev GPS: Chrome DevTools → Sensors → Location
