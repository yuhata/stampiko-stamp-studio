# Stamp Studio (LBS Stamp Studio)
Stampikoのスタンプを生成・管理する管理ツール。

## ⚠️ Quality Gate (MUST FOLLOW — 違反した場合は手を止めて報告)

このセクションは memory より優先される。事故再発防止のため、以下のルールを Claude は無条件で遵守する。
詳細議論: https://www.notion.so/346689ab28fa81eca827df9a4ee4dd3e （Stamp Studio 品質運用ルール検討）
本体の品質運用ルール: https://www.notion.so/346689ab28fa8102ad5bff85951996d3

### β. テスト1件でも fail なら "completed" 宣言禁止
- Vitest / Playwright / **実Firebaseスモーク** (smoke-*.mjs) で 1件でも fail があれば、タスクを完了扱いにしない
- "n/m passed" を OK 扱いしない。残り件の重要度を必ず判定し、ユーザーに報告
- 「想定内」「無関係」等の理由で skip するなら、明示的に skip 設定して再実行し pass を確認してから completed

### θ. 完了宣言テンプレート（実施テストを必ず列挙）
完了報告時は以下を明示する。曖昧な「テスト済み」「動作確認済み」禁止:
1. 実施したテスト名（例: `npm test`, `npx playwright test`, **`node scripts/smoke-designer-workflow.mjs`**）
2. 結果サマリー（n/m passed、失敗があれば内容）
3. **実Firebase スモーク実施有無**（永続化/外部連携変更時は必須）
4. 実画面で確認したフロー（UIが絡む場合）
5. **デプロイ後の本番 runtime 反映確認**（ρ: GitHub Pages/Vercel のデプロイ完了 + 本番で新コードが効いていることを実挙動で確認）
6. 残課題・既知の制約

### ο. 外部依存URL（Storage / Signed URL / CDN）は実到達性まで smoke する
- 画像/ファイルURLを扱うフローは smoke に「**生成URLを実際に curl 200 まで確認**」を含める
- upload成功 / metadata書込成功だけでは不十分。**ブラウザが取得する形式**のURLが実際に200を返すか検証
- 外部依存（Firebase Storage バケット移行 / 署名仕様変更 / CDN ポリシー）は**コード変更ゼロでも破壊される**前提
- 理由: 2026-04-18 Stampiko本体の PhotoGallery事故（v4署名が本番で `SignatureDoesNotMatch`）の再発防止

### π. 手動テスト依頼の前に Claude 側で自己完結検証を試みる
- デザイナー/秦さんに画面操作を依頼する前に、**Claude側で同等検証が可能か必ず自問**する
- 使える検証手段: Firebase Admin SDK + custom token、Playwright headless、smoke-*.mjs、`firebase rules:test`、直接 REST 叩き等
- 「これ自分でAPIを叩けば分かるのでは？」と一度止まる
- 理由: 2026-04-18 Stampiko本体の4時間DevTools依頼事故。Studio はユーザーがデザイナー1人なので依頼負荷がさらに重い

### δ. 事故ログ運用
- 想定外の事故（バグ・データ消失・UXブロッカー等）が発生したら、改善ログ Notion に必ず記録
  - 改善ログ: https://www.notion.so/340689ab28fa81fb86b7c239008c3b8e
  - 記載項目: 何が起きたか / 原因 / 対応 / 再発防止策
- 同じ問題が再発したら、品質運用ルール（上記Notion）と照合して何が不足しているかを議論

## ⚠️ Security Rules
- GEMINI_API_KEY, FIREBASE_* をフロントエンドに露出させない（VITE_接頭辞のみクライアント許可）
- Gemini APIプロンプトにユーザー入力を直接結合しない（プロンプトインジェクション防止）
- Firebase Storage: ファイルサイズ・MIME type を制限

## Code Conventions
- Images: always removeWhiteBackground() before Storage upload
- Template stamps: SVG/Canvas composition, NO Gemini API
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
- 最低限の検証項目（デザイナー操作マトリクスに対し「ローカル反映 / 別コンテキスト同期 / ハードリロード復元 / Firestore実データ」の4観点）:
  1. ライフサイクル: N件保存 → セッション切替（別ブラウザコンテキスト）→ N件復元
  2. 冪等性: リロード3〜5回で件数不変
  3. 障害耐性: upload失敗時にデータが消えないこと
  4. 削除: deleteDoc が manifest/Firestore 由来スタンプでも復活しない
  5. 並行編集: 複数コンテキストの同時setDoc で merge:true が効く
- スモークスクリプト: `scripts/smoke-storage-upload.mjs`, `scripts/smoke-data-integrity.mjs`, **`scripts/smoke-designer-workflow.mjs`（ver2以降はこれが網羅版、29ケース）**
- Vitest + Build OK だけで「テスト済み」と報告しない
- **「入念にテスト」依頼にはまず操作マトリクスを棚卸しし、網羅率（N/M）を宣言してから着手**。実装中に宣言基準を緩めない

### 現行アーキテクチャ（ver2 — 2026-04-17 studio_stamps 統一）
- **全スタンプ: `studio_stamps/{stampId}`** 個別ドキュメント方式（manifest / Firestore spots / custom をすべて統合）
  - `source` フィールドで `'manifest' | 'firestore' | 'custom' | 'ugc'` を識別
  - 書き込み経路は `src/config/studioStamps.js` の統一API のみ: `upsertStamp` / `upsertStampsMany` / `deleteStamp` / `deleteStampsMany` / `replaceStampImage` / `createStampWithImage`
  - 読み込みは `subscribeStamps(onSnapshot)` でリアクティブ同期。別タブ変更が3秒以内に反映される
  - `setStamps` の直接呼び出しは楽観的UI更新のみ。Firestore 反映は必ず上記 API 経由
- **画像**: Firebase Storage `studio_stamps/{stampId}_{version}.png` (replaceStampImage はバージョン付与でキャッシュバスター)
- **設定（areaConfig / criteria / ngReasons）**: `studio_settings/global`（頻度低・件数少のため配列方式を許容）。AdminPanel のエリア編集も `saveAreaConfig` 経由で同期
- **旧コレクション**: `studio_custom_stamps/*` と `studio_settings/global.stampOverrides` はロールバック用に30日保持。**2026-05-17 以降にクリーンアップ予定**

### ver2 解消済みバグクラス（再発させない）
- updateStamp 迂回の setStamps 直呼びによる Firestore 未反映
- stampOverrides 配列全量上書きによる並行編集消失・削除トゥームストーン不在
- saveCustomStamps の uploadedImageIds ガードによる画像再アップロード漏れ
- onSnapshot 不在による別タブ同期欠如
- AdminPanel の localStorage 直書き（saveAreaConfig 経由に統一済み）

## Testing
- Tokyo Tower (35.6586, 139.7454), 洗足池 (35.5727, 139.7108)
- GPS: 100m default, 200m for stations
