# Stampiko (LBS Stamp Collection)

## Project Structure
- /frontend — Vite + React + Leaflet (user-facing)
- /api — Express.js + Vercel (GPS verify, AI, Firebase)
- /backend — Vite + React (admin panel)

## Specs
仕様書は specs/ ディレクトリにあります。Notionがマスターで、mdは同期コピーです。
- specs/requirements.md — サービス全体設計（戦略・設計・プロモ・コスト）
- specs/design.md — UI・画面設計書
- specs/implementation.md — 実装仕様書（コード・データモデル・API）
- specs/stamp-designs.md — スタンプデザイン方針
- specs/quality-management.md — 品質管理フロー
- specs/branding.md — ブランディングガイド

## Key Dependencies
- Firebase SDK 10.x (Firestore, Storage, Auth)
- Gemini API (@google/generative-ai) — model: gemini-2.5-flash-image
- Leaflet 1.9.x + react-leaflet
- sharp (image processing in API)
- html2canvas (share card / certificate generation)
- satori + @vercel/og (OGP image generation)
- react-i18next (i18n)

## Environment Variables
- GEMINI_API_KEY
- FIREBASE_* (serviceAccount for API)
- VITE_FIREBASE_* (client config for frontend)

## Code Conventions
- Firestore: snake_case for collection names, camelCase for fields
- All timestamps: serverTimestamp() on write, toDate() on read
- GPS validation: always use Haversine before AI verify
- Images: always process through removeWhiteBackground() before Storage upload
- Spot types: 'landmark' (curated), 'data_spot' (auto-registered), 'generic' (category-only)
- Rank check: always call checkRankUp() after stamp acquisition
- Template stamps: SVG/Canvas composition, NO Gemini API usage

## Two-Layer Spot Architecture
- Landmark layer: 60 spots (3 areas × 20), unique AI-generated stamps, designer-curated
- Data spot layer: 154K+ POIs from OSM (9 categories), template stamps with name overlay

## Testing
- Test spots: Tokyo Tower (35.6586, 139.7454), 洗足池 (35.5727, 139.7108)
- GPS radius: 100m default (200m for stations)
- Welcome stamp: spotId = 'welcome'
- Dev GPS override: Chrome DevTools → Sensors → Location
