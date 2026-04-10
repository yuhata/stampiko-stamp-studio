import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PROMPT, STORAGE_KEYS } from '../config/promptDefaults'

const STYLES = [
  { value: 'circular', label: '円形スタンプ（駅スタンプ風）' },
  { value: 'square', label: '方形スタンプ' },
  { value: 'freeform', label: 'フリーフォーム' },
]

const MOOD_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: 'simple', label: 'シンプル', prompt: 'Minimalist design with clean lines and few details.' },
  { value: 'modern', label: 'モダン', prompt: 'Modern, stylish design with geometric shapes and bold lines.' },
  { value: 'traditional', label: '伝統的', prompt: 'Traditional Japanese woodblock print style with classic motifs.' },
  { value: 'cute', label: 'かわいい', prompt: 'Cute, friendly design with soft rounded shapes.' },
  { value: 'elegant', label: 'エレガント', prompt: 'Refined, elegant design with delicate linework and sophistication.' },
]

const COLOR_COUNT_OPTIONS = [
  { value: '', label: '指定なし（2〜4色）' },
  { value: 'mono', label: '単色', prompt: 'Use ONLY 1 ink color from the palette. Monochrome stamp.' },
  { value: '2color', label: '2色', prompt: 'Use exactly 2 ink colors from the palette.' },
  { value: '3color', label: '3色', prompt: 'Use exactly 3 ink colors from the palette.' },
]

const ELEMENT_OPTIONS = [
  { value: 'building', label: '建物' },
  { value: 'landscape', label: '風景' },
  { value: 'animal', label: '動物' },
  { value: 'person', label: '人' },
  { value: 'food', label: '食べ物' },
  { value: 'nature', label: '自然' },
]

const PRESET_PALETTES = [
  { name: '蘇芳（神社）', colors: ['#9E3D3F', '#6B3A3A'] },
  { name: '鶸茶（寺院）', colors: ['#8F8667', '#6B6347'] },
  { name: '縹色（駅）', colors: ['#2B618F', '#1E4460'] },
  { name: '老竹（道の駅）', colors: ['#769164', '#4D6340'] },
  { name: '丁子茶（温泉）', colors: ['#B4866B', '#8B6347'] },
  { name: '江戸紫（美術館）', colors: ['#745399', '#523A70'] },
]

const API_URL = 'https://stampiko-api.vercel.app'

export default function BatchForm({ stamps, setStamps, ngReasons }) {
  const [spotName, setSpotName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [area, setArea] = useState('asakusa')
  const [palette, setPalette] = useState(['#9E3D3F', '#6B3A3A'])
  const [style, setStyle] = useState('circular')
  const [count, setCount] = useState(4)
  const [mood, setMood] = useState('')
  const [colorCount, setColorCount] = useState('')
  const [elements, setElements] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState([])
  const [addedToGallery, setAddedToGallery] = useState(false)

  const [promptTemplate, setPromptTemplate] = useState(() =>
    localStorage.getItem(STORAGE_KEYS.PROMPT) || DEFAULT_PROMPT
  )

  // 他タブ（NGLog）でプロンプトがリセット/更新された場合に同期
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEYS.PROMPT) {
        setPromptTemplate(e.newValue || DEFAULT_PROMPT)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // タブ切り替え時にlocalStorageから最新値を読み込む
  const syncPromptFromStorage = useCallback(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.PROMPT) || DEFAULT_PROMPT
    setPromptTemplate(stored)
  }, [])

  useEffect(() => {
    document.addEventListener('visibilitychange', syncPromptFromStorage)
    return () => document.removeEventListener('visibilitychange', syncPromptFromStorage)
  }, [syncPromptFromStorage])

  // プロンプト変更時にlocalStorageに保存
  const updatePrompt = (val) => {
    setPromptTemplate(val)
    localStorage.setItem(STORAGE_KEYS.PROMPT, val)
  }

  const handleGenerate = async () => {
    if (!spotName.trim()) return

    setGenerating(true)
    setGeneratedImages([])
    setAddedToGallery(false)

    // デザインオプションをプロンプトに追加
    const optionLines = []
    const moodOption = MOOD_OPTIONS.find(m => m.value === mood)
    if (moodOption?.prompt) optionLines.push(moodOption.prompt)
    const colorOption = COLOR_COUNT_OPTIONS.find(c => c.value === colorCount)
    if (colorOption?.prompt) optionLines.push(colorOption.prompt)
    if (elements.length > 0) {
      const labels = elements.map(e => ELEMENT_OPTIONS.find(o => o.value === e)?.label || e)
      optionLines.push(`Include these visual elements: ${labels.join(', ')}.`)
    }
    const optionBlock = optionLines.length > 0
      ? `\n\n=== DESIGN OPTIONS ===\n${optionLines.join('\n')}`
      : ''

    const prompt = (promptTemplate + optionBlock)
      .replace(/\{SPOT_NAME\}/g, spotName)
      .replace(/\{PALETTE\}/g, palette.join(', '))

    try {
      const res = await fetch(`${API_URL}/api/generate-stamp-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, count }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'API error')

      const results = (data.results || []).map((r, i) => {
        if (r.base64) {
          return {
            id: `gen_${Date.now()}_${i}`,
            dataUrl: `data:${r.mimeType || 'image/png'};base64,${r.base64}`,
            spotName,
            variant: r.index,
          }
        }
        return { id: `err_${i}`, error: r.error, variant: r.index }
      })

      setGeneratedImages(results)
    } catch (err) {
      alert(`生成エラー: ${err.message}`)
    } finally {
      setGenerating(false)
    }
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
          <input type="number" step="0.0001" placeholder="緯度" value={lat} onChange={e => setLat(e.target.value)} style={{ flex: 1 }} />
          <input type="number" step="0.0001" placeholder="経度" value={lng} onChange={e => setLng(e.target.value)} style={{ flex: 1 }} />
        </div>
      </div>

      <div className="form-group">
        <label>構図スタイル</label>
        <select value={style} onChange={e => setStyle(e.target.value)}>
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>パレットプリセット（日本の伝統色）</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESET_PALETTES.map(p => (
            <button key={p.name} className="filter-btn"
              style={{ border: JSON.stringify(palette) === JSON.stringify(p.colors) ? '2px solid var(--accent)' : undefined }}
              onClick={() => setPalette(p.colors)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.colors.map((c, i) => (
                  <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />
                ))}
                <span>{p.name}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>雰囲気</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MOOD_OPTIONS.map(m => (
            <button key={m.value} className={`filter-btn ${mood === m.value ? 'active' : ''}`}
              onClick={() => setMood(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>色数</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COLOR_COUNT_OPTIONS.map(c => (
            <button key={c.value} className={`filter-btn ${colorCount === c.value ? 'active' : ''}`}
              onClick={() => setColorCount(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>構成要素（複数選択可）</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ELEMENT_OPTIONS.map(el => (
            <button key={el.value}
              className={`filter-btn ${elements.includes(el.value) ? 'active' : ''}`}
              onClick={() => setElements(prev =>
                prev.includes(el.value) ? prev.filter(e => e !== el.value) : [...prev, el.value]
              )}>
              {el.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>候補数: {count}</label>
        <input type="range" min={1} max={10} value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: '100%' }} />
      </div>

      <div className="form-group">
        <label>プロンプトテンプレート（編集可能）</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          変数: {'{SPOT_NAME}'} → スポット名 / {'{PALETTE}'} → パレット
        </div>
        <textarea rows={10} style={{ fontSize: 12, lineHeight: 1.5 }} value={promptTemplate} onChange={e => updatePrompt(e.target.value)} />
      </div>

      <button className="generate-btn" disabled={!spotName.trim() || generating} onClick={handleGenerate}>
        {generating ? `生成中...` : `${count}候補を生成`}
      </button>

      {/* 生成結果 */}
      {generatedImages.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              生成結果 ({generatedImages.filter(g => g.dataUrl).length}/{count})
            </label>
            {!addedToGallery && generatedImages.some(g => g.dataUrl) && (
              <button
                onClick={() => {
                  const newStamps = generatedImages
                    .filter(g => g.dataUrl)
                    .map((g, i) => ({
                      id: `gen_${Date.now()}_${i}`,
                      spotId: spotName.replace(/\s+/g, '_').toLowerCase(),
                      spotName,
                      area,
                      lat: parseFloat(lat) || 0,
                      lng: parseFloat(lng) || 0,
                      variant: i,
                      path: null,
                      dataUrl: g.dataUrl,
                      status: 'draft',
                      designerNote: '',
                      ngTags: [],
                    }))
                  setStamps(prev => [...prev, ...newStamps])
                  setAddedToGallery(true)
                }}
                style={{
                  background: 'var(--accent)', color: 'white', border: 'none',
                  borderRadius: 6, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                📋 ギャラリーに追加 ({generatedImages.filter(g => g.dataUrl).length}件)
              </button>
            )}
            {addedToGallery && (
              <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 700 }}>✅ ギャラリーに追加済み</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {generatedImages.map(img => (
              <div key={img.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                {img.dataUrl ? (
                  <>
                    <img src={img.dataUrl} alt={`v${img.variant}`} style={{ width: '100%', borderRadius: 6 }} />
                    <a href={img.dataUrl} download={`${spotName}_v${img.variant}.png`}
                      style={{ fontSize: 10, color: 'var(--accent)', display: 'block', marginTop: 4 }}>
                      ダウンロード
                    </a>
                  </>
                ) : (
                  <div style={{ padding: 20, color: 'var(--accent-red)', fontSize: 11 }}>
                    ❌ {img.error?.substring(0, 50)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
