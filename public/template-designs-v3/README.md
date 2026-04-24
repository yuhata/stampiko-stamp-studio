# テンプレートスタンプ画像ディレクトリ

> Stampiko が全カテゴリで使う**スタンプ台座**の画像一式。
> このディレクトリが**唯一のマスター置き場**。API側は GitHub raw URL でここを参照する。

## 📌 最終更新: 2026-04-24

---

## 全カテゴリ一覧（16種）

| category | 現状 | サイズ目安 | 備考 |
|---|---|---:|---|
| `shrine` | ✅ 本格 | ~1.3MB | Gemini生成（蘇芳 #9E3D3F） |
| `temple` | ✅ 本格 | ~1.0MB | Gemini生成（鶸茶 #8F8667） |
| `station` | ✅ 本格 | ~1.0MB | Gemini生成（#2B618F） |
| `castle` | ✅ 本格 | ~1.1MB | Gemini生成（#6C6A6C） |
| `lighthouse` | ✅ 本格 | ~1.2MB | Gemini生成（#2B4B6F） |
| `rest_area` | ✅ 本格 | ~1.1MB | Gemini生成（#769164） |
| `onsen` | ✅ 本格 | ~1.1MB | Gemini生成（#B4866B） |
| `museum` | ✅ 本格 | ~1.0MB | Gemini生成（#745399） |
| `zoo` | ✅ 本格 | ~1.2MB | Gemini生成（#5B8930） |
| `heritage` | 🟡 **暫定** | ~44KB | **SVG fallback**（#B8860B、要正式デザイン） |
| `historic_building` | 🟡 **暫定** | ~43KB | **SVG fallback**（#8B4513 saddlebrown） |
| `historic_site` | 🟡 **暫定** | ~36KB | **SVG fallback**（#696969 dimgray） |
| `theater` | 🟡 **暫定** | ~44KB | **SVG fallback**（#C71585 mediumvioletred） |
| `park_garden` | 🟡 **暫定** | ~41KB | **SVG fallback**（#1B5E20 darkgreen） |
| `sightseeing_spot` | 🟡 **暫定** | ~40KB | **SVG fallback**（#008B8B darkcyan） |
| `church` | 🟡 **暫定** | ~45KB | **SVG fallback**（#4682B4 steelblue） |

**🟡 暫定7カテゴリは全て同じ「建物シルエット+ラベル」で色だけ違う** — 本格デザイン差し替え推奨。

---

## 参照フロー（API側の挙動）

1. Stampiko Frontend が `image_url: https://stampiko-api.vercel.app/api/stamp-image/{category}/{spotName}` を指定
2. API側 `index.js:1517` のエンドポイントが動作
3. 内部で `TEMPLATE_BASE_URL` + `{category}.png` を GitHub raw から fetch してキャッシュ
4. satori で日本語スポット名をレンダリングして合成 → PNG応答

### TEMPLATE_BASE_URL の現状
```
const TEMPLATE_BASE_URL = 'https://raw.githubusercontent.com/yuhata/lbs-stamp-studio/main/public/template-designs-v3'
```
⚠️ **古いrepo名 `lbs-stamp-studio` を参照中**（現行repoは `stampiko-stamp-studio`）。
GitHub の自動リダイレクトで動作しているが、将来的には新repo参照に修正推奨（API index.js:1440）。

---

## 🛠 更新方法（3ルート）

### Method A: Gemini自動生成（推奨・統一感あり）
日本の伝統色パレットで全カテゴリを一気に再生成。

```bash
cd stamp-studio
# GEMINI_API_KEY を .env に設定済みであること
node scripts/regenerate-templates-nippon.mjs
```

**⚠️ 現状このスクリプトは9カテゴリ（shrine〜zoo）のみ定義**。
heritage + 新6カテゴリを含めるには `CATEGORIES` オブジェクトに追記が必要（未着手）。

### Method B: デザイナーが手動でPNG差し替え（即対応）
正式デザインPNGを作成して直接差し替え：

```bash
# 対象ファイル: stamp-studio/public/template-designs-v3/{category}.png
# 推奨仕様: 512x512 PNG、白背景、中央に絵柄、下部にカテゴリロゴ用余白
cp new_design.png public/template-designs-v3/historic_building.png
git add public/template-designs-v3/historic_building.png
git commit -m "design: historic_building テンプレ画像を正式版に差し替え"
git push
```

### Method C: Stamp Studio ローカルdevで即時プレビュー
```bash
cd stamp-studio
npm run dev
# ブラウザで http://localhost:5176/template-designs-v3/historic_building.png 等で確認可
```

---

## 🕐 反映タイミング

1. `git push` 後、GitHub raw URL 経由で数秒〜数分で反映
2. API側のメモリキャッシュ (`templateCache` in index.js:1441) があるため、**API再デプロイ**または**サーバー再起動**で確実にクリア
3. `Cache-Control: max-age=60` 設定なので、ブラウザ側の最大遅延は1分

### 反映確認 curl
```bash
curl -I https://raw.githubusercontent.com/yuhata/lbs-stamp-studio/main/public/template-designs-v3/historic_building.png
# HTTP/2 200 が返れば OK
```

---

## 📐 デザイン仕様（推奨）

- **サイズ**: 512x512 PNG
- **背景**: 白（#FFFFFF）または薄いグラデーション
- **中央絵柄**: カテゴリを象徴するシルエット（例：shrine=鳥居、theater=舞台/マイク、park_garden=木/池）
- **色調**: 日本の伝統色（蘇芳・鶸茶等）ベースだと既存9カテゴリと統一感
- **下部余白**: スポット名テキスト合成用に `height × 0.23` 程度の空白を確保（satoriがここに日本語を入れる）
- **色（アクセントカラー）**: 以下を推奨。API側 `CATEGORY_COLORS` と一致させること。

| category | HEX |
|---|---|
| heritage | #B8860B |
| historic_building | #8B4513 |
| historic_site | #696969 |
| theater | #C71585 |
| park_garden | #1B5E20 |
| sightseeing_spot | #008B8B |
| church | #4682B4 |

---

## 関連ファイル

- API側エンドポイント: `../../LBS_Stamp_API/index.js:1517` (`/api/stamp-image/:category/:spotName`)
- API側カラー定義: `../../LBS_Stamp_API/index.js:1443` (`CATEGORY_COLORS`)
- Gemini再生成スクリプト: `../../scripts/regenerate-templates-nippon.mjs`
- テキスト合成パイプライン: `../../scripts/generate-template-stamps.mjs`
- 実装仕様書: [Notion](https://www.notion.so/338689ab28fa8165a875c98a2449f270)

---

## 今後のTODO

- [ ] `regenerate-templates-nippon.mjs` に新7カテゴリ（heritage + 新6）を追加
- [ ] 新7カテゴリの正式デザイン発注（デザイナー作業）
- [ ] `TEMPLATE_BASE_URL` を `stampiko-stamp-studio` 新repoに更新
