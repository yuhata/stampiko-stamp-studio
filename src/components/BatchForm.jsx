import { useState } from 'react'

const STYLES = [
  { value: 'circular', label: '円形スタンプ（駅スタンプ風）' },
  { value: 'square', label: '方形スタンプ' },
  { value: 'freeform', label: 'フリーフォーム' },
]

const PRESET_PALETTES = [
  { name: '浅草（赤系）', colors: ['#C0392B', '#8B4513'] },
  { name: '渋谷（紫系）', colors: ['#6A1B9A', '#1A237E'] },
  { name: '新宿（橙系）', colors: ['#BF360C', '#F57F17'] },
  { name: '自然（緑系）', colors: ['#1B5E20', '#3E2723'] },
  { name: '海（青系）', colors: ['#0D47A1', '#546E7A'] },
]

export default function BatchForm({ stamps, setStamps, ngReasons }) {
  const [spotName, setSpotName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [area, setArea] = useState('asakusa')
  const [palette, setPalette] = useState(['#C0392B', '#8B4513'])
  const [style, setStyle] = useState('circular')
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)

  const DEFAULT_PROMPT = `Japanese station stamp — a rubber ink impression.
No letters, kanji, kana, numbers, dates, labels, or symbols — anywhere in the image.
{SPOT_NAME} is a SHAPE REFERENCE only. Render its silhouette. NEVER write its name.

--- STAMP FORMAT ---
CIRCULAR ink stamp, fills ~90% canvas height. Flat off-white background (#FFFFFF) outside circle.
NO rectangular frames. NOT a postage stamp. Ink impression has slightly uneven pressure.

--- INSIDE THE STAMP ---
Street View perspective of {SPOT_NAME}. Street leads eye to landmark in background.
Landmark silhouette fills ~45–55% of the circle. Wide breathing space inside.

--- INK TEXTURE ---
Subtle rubber-stamp ink effect inside the circle only. Gentle ink bleed at edges.
Mostly even ink pressure. Any grain strictly within the stamp boundary.

--- COLOR ---
Use 2–4 ink colors from: {PALETTE}.
Colors appear as absorbed ink, slightly muted and desaturated.

--- VISUAL STYLE ---
Flat graphic shapes, geometric simplification, NO gradients.
Strong silhouette, Showa-era retro illustration. NO photorealism. Flat off-white background.
Image size: 512x512 pixels.`

  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT)

  const handleGenerate = async () => {
    if (!spotName.trim()) return
    setGenerating(true)

    // Gemini API未接続時はダミー生成のメッセージを表示
    setTimeout(() => {
      alert(`Gemini APIが未接続です。\n\n接続後、以下の設定でバッチ生成されます:\n\nスポット: ${spotName}\nパレット: ${palette.join(', ')}\nスタイル: ${style}\n候補数: ${count}`)
      setGenerating(false)
    }, 500)
  }

  return (
    <div className="batch-form">
      <div className="form-group">
        <label>スポット名</label>
        <input
          type="text"
          placeholder="例: 雷門、渋谷スクランブル交差点"
          value={spotName}
          onChange={e => setSpotName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>エリア</label>
        <select value={area} onChange={e => setArea(e.target.value)}>
          <option value="asakusa">浅草</option>
          <option value="shibuya">渋谷</option>
          <option value="shinjuku">新宿</option>
        </select>
      </div>

      <div className="form-group">
        <label>位置情報（緯度・経度）</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            step="0.0001"
            placeholder="緯度 (例: 35.7107)"
            value={lat}
            onChange={e => setLat(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            step="0.0001"
            placeholder="経度 (例: 139.7965)"
            value={lng}
            onChange={e => setLng(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Google Mapsで右クリック → 座標をコピーして貼り付け
        </p>
      </div>

      <div className="form-group">
        <label>構図スタイル</label>
        <select value={style} onChange={e => setStyle(e.target.value)}>
          {STYLES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>パレットプリセット</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESET_PALETTES.map(p => (
            <button
              key={p.name}
              className="filter-btn"
              style={{
                border: JSON.stringify(palette) === JSON.stringify(p.colors)
                  ? '2px solid var(--accent)' : undefined
              }}
              onClick={() => setPalette(p.colors)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.colors.map((c, i) => (
                  <span key={i} style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: c, display: 'inline-block'
                  }} />
                ))}
                <span>{p.name}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="palette-preview">
          {palette.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div className="color-swatch" style={{ background: c }} />
              <input
                type="text"
                value={c}
                onChange={e => {
                  const next = [...palette]
                  next[i] = e.target.value
                  setPalette(next)
                }}
                style={{ width: 90, padding: '4px 8px', fontSize: 12 }}
              />
            </div>
          ))}
          <button
            className="filter-btn"
            style={{ marginTop: 8, alignSelf: 'flex-end' }}
            onClick={() => setPalette([...palette, '#666666'])}
          >+ 色追加</button>
        </div>
      </div>

      <div className="form-group">
        <label>候補数: {count}</label>
        <input
          type="range"
          min={5}
          max={20}
          value={count}
          onChange={e => setCount(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div className="form-group">
        <label>プロンプトテンプレート（編集可能）</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          変数: {'{SPOT_NAME}'} → スポット名 / {'{PALETTE}'} → パレット / {'{STYLE}'} → 構図スタイル
        </div>
        <textarea
          rows={14}
          style={{ fontSize: 12, lineHeight: 1.5 }}
          value={promptTemplate}
          onChange={e => setPromptTemplate(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            className="filter-btn"
            onClick={() => setPromptTemplate(DEFAULT_PROMPT)}
          >デフォルトに戻す</button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            プレビュー: {'{SPOT_NAME}'} → {spotName || '(未入力)'} / {'{PALETTE}'} → {palette.join(', ')}
          </span>
        </div>
      </div>

      <button
        className="generate-btn"
        disabled={!spotName.trim() || generating}
        onClick={handleGenerate}
      >
        {generating ? '生成中...' : `${count}候補を一括生成`}
      </button>

      <div className="api-notice">
        Gemini API未接続 — 課金設定後に実画像生成が有効になります。
        現在はダミー画像でワークフローを確認できます。
      </div>
    </div>
  )
}
