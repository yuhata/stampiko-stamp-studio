import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  DEFAULT_PROMPT, STORAGE_KEYS, API_URL,
  MOOD_OPTIONS, COLOR_COUNT_OPTIONS, ELEMENT_OPTIONS,
  buildDesignOptionsBlock,
} from '../config/promptDefaults'
import { CANONICAL_AREAS, DEFAULT_AREA_CONFIG, AREA_COLORS } from '../config/areas'
import { cropToCircle, resizeImageFile } from '../utils/imageProcess'
import { resolveLocationInput } from '../utils/location'
import { createStampWithImage } from '../config/studioStamps'

const STYLES = [
  { value: 'circular', label: '円形スタンプ（駅スタンプ風）' },
  { value: 'square', label: '方形スタンプ' },
  { value: 'freeform', label: 'フリーフォーム' },
]

const AREAS_KEY = 'lbs-stamp-studio-areas'

// エリアルール(localStorage)から指定エリアのパレットを取得。未設定時はマスターの代表色
function getAreaPalette(areaId) {
  try {
    const saved = localStorage.getItem(AREAS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const palette = parsed?.[areaId]?.palette
      if (Array.isArray(palette) && palette.length > 0) return palette
    }
  } catch { /* fallthrough */ }
  const defaults = DEFAULT_AREA_CONFIG[areaId]?.palette
  if (defaults && defaults.length > 0) return defaults
  return [AREA_COLORS[areaId] || '#333333']
}

export default function BatchForm({ stamps, setStamps, ngReasons, lockedSpot, onClose }) {
  const [spotName, setSpotName] = useState(lockedSpot?.spotName || '')
  const [spotHint, setSpotHint] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [resolvedLatLng, setResolvedLatLng] = useState(
    lockedSpot && (lockedSpot.lat || lockedSpot.lng)
      ? { lat: lockedSpot.lat, lng: lockedSpot.lng }
      : null
  )
  const [resolvingLocation, setResolvingLocation] = useState(false)
  const [area, setArea] = useState(lockedSpot?.area || 'asakusa')
  const palette = useMemo(() => getAreaPalette(area), [area])
  const [style, setStyle] = useState('circular')
  const [count, setCount] = useState(2)
  const [mood, setMood] = useState('')
  const [colorCount, setColorCount] = useState('')
  const [elements, setElements] = useState([])
  const [refImage, setRefImage] = useState(null) // { base64, mimeType, preview }
  const [generating, setGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState([])
  const [addedToGallery, setAddedToGallery] = useState(false)

  const handleRefImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('10MB以下の画像を選択してください'); return }
    try {
      // 長辺1024pxにリサイズしてJPEG化（Gemini APIへの入力トークン削減）
      const resized = await resizeImageFile(file, 1024, 0.9)
      setRefImage(resized)
    } catch (err) {
      alert(`画像読み込みエラー: ${err.message || err}`)
    }
    e.target.value = ''
  }

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

  const handleGenerate = async ({ append = false } = {}) => {
    if (!spotName.trim()) return

    setGenerating(true)
    if (!append) {
      setGeneratedImages([])
      setAddedToGallery(false)
    }

    const optionBlock = buildDesignOptionsBlock({ mood, colorCount, elements })

    // 補足テキストが入力されている場合は、それをスポット名の代わりに生成モチーフへ使用
    // （例: 店名「茄子おやじ」→ 補足「カレー屋」→ カレーのイメージで生成）
    const motif = spotHint.trim() || spotName
    const prompt = (promptTemplate + optionBlock)
      .replace(/\{SPOT_NAME\}/g, motif)
      .replace(/\{PALETTE\}/g, palette.join(', '))

    try {
      const body = { prompt, count }
      if (refImage) {
        body.referenceImage = { base64: refImage.base64, mimeType: refImage.mimeType }
      }
      const headers = { 'Content-Type': 'application/json' }
      const studioKey = import.meta.env.VITE_STUDIO_API_KEY
      if (studioKey) headers.Authorization = `Bearer studio:${studioKey}`
      const res = await fetch(`${API_URL}/api/generate-stamp-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'API error')

      const rawResults = (data.results || []).map((r, i) => {
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

      // 構図スタイルが円形の場合のみ円外を透過トリミング
      const results = await Promise.all(
        rawResults.map(async (r) => {
          if (!r.dataUrl || style !== 'circular') return r
          try {
            const cropped = await cropToCircle(r.dataUrl)
            return { ...r, dataUrl: cropped }
          } catch {
            return r
          }
        })
      )

      if (append) {
        setGeneratedImages(prev => [...prev, ...results])
      } else {
        setGeneratedImages(results)
      }
    } catch (err) {
      alert(`生成エラー: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const isLocked = !!lockedSpot

  return (
    <div className="batch-form">
      {isLocked && (
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: 'var(--bg)', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--accent)', color: 'var(--text)',
        }}>
          📌 既存スポット <strong>{lockedSpot.spotName}</strong> にスタンプを追加生成します
          <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
            （位置情報・スポット名は引き継がれます）
          </span>
        </div>
      )}
      {!isLocked && (
        <div className="form-group">
          <label>スポット名</label>
          <input
            type="text"
            placeholder="例: 雷門、渋谷スクランブル交差点"
            value={spotName}
            onChange={e => setSpotName(e.target.value)}
          />
        </div>
      )}

      <div className="form-group">
        <label>補足テキスト（任意）</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          スポット名からイメージが湧きにくい場合、モチーフを補足（例: 「茄子おやじ」→「カレー屋」）。
          入力時はこの文字列が優先されて生成されます。
        </div>
        <input
          type="text"
          placeholder="例: カレー屋、老舗の和菓子店"
          value={spotHint}
          onChange={e => setSpotHint(e.target.value)}
        />
      </div>

      {!isLocked && (
        <div className="form-group">
          <label>エリア</label>
          <select value={area} onChange={e => setArea(e.target.value)}>
            {CANONICAL_AREAS.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {!isLocked && (
      <div className="form-group">
        <label>位置情報</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          住所、または「緯度,経度」（カンマ区切り、Google Mapsからのコピペ可）
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="例: 東京都台東区浅草2-3-1 / 35.7148,139.7967"
            value={locationInput}
            onChange={e => { setLocationInput(e.target.value); setResolvedLatLng(null) }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            disabled={!locationInput.trim() || resolvingLocation}
            className="filter-btn"
            onClick={async () => {
              setResolvingLocation(true)
              try {
                const result = await resolveLocationInput(locationInput, {
                  confirmFn: (geo) => confirm(`検索結果:\n${geo.display}\n\n(${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})\n\nこの位置で確定しますか？`),
                })
                if (result) setResolvedLatLng(result)
              } catch (err) {
                alert(`位置取得エラー: ${err.message}`)
              } finally {
                setResolvingLocation(false)
              }
            }}
          >
            {resolvingLocation ? '解決中...' : '位置を確定'}
          </button>
        </div>
        {resolvedLatLng && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-green, #4caf50)' }}>
            ✓ {resolvedLatLng.lat.toFixed(5)}, {resolvedLatLng.lng.toFixed(5)}
            {resolvedLatLng.display ? ` — ${resolvedLatLng.display}` : ''}
          </div>
        )}
      </div>
      )}

      <div className="form-group">
        <label>構図スタイル</label>
        <select value={style} onChange={e => setStyle(e.target.value)}>
          {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label>パレット（エリアルールから自動適用）</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          選択中エリアの色を使用します。変更は「エリアルール」タブから。
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {palette.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: c, display: 'inline-block', border: '1px solid var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c}</span>
            </div>
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
        <label>参考写真（任意）</label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          ランドマークの写真をアップロードすると、シルエットの参考にして生成します
        </div>
        {refImage ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={refImage.preview} alt="参考写真"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
            <div>
              <button className="filter-btn" onClick={() => setRefImage(null)}
                style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
                削除
              </button>
            </div>
          </div>
        ) : (
          <label style={{
            display: 'inline-block', padding: '8px 16px',
            border: '1px dashed var(--border)', borderRadius: 8,
            color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            写真をアップロード...
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleRefImageUpload} />
          </label>
        )}
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

      <button className="generate-btn" disabled={!spotName.trim() || generating} onClick={() => handleGenerate()}>
        {generating ? `生成中...` : `${count}候補を生成`}
      </button>

      {/* 生成結果 */}
      {generatedImages.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              生成結果 ({generatedImages.filter(g => g.dataUrl).length}/{generatedImages.length})
            </label>
            {!addedToGallery && generatedImages.some(g => g.dataUrl) && (
              <button
                onClick={async () => {
                  const ts = Date.now()
                  const newStamps = generatedImages
                    .filter(g => g.dataUrl)
                    .map((g, i) => ({
                      id: `gen_${ts}_${i}`,
                      spotId: lockedSpot?.spotId || spotName.replace(/\s+/g, '_').toLowerCase(),
                      spotName,
                      area,
                      lat: lockedSpot?.lat || resolvedLatLng?.lat || 0,
                      lng: lockedSpot?.lng || resolvedLatLng?.lng || 0,
                      variant: i,
                      path: null,
                      dataUrl: g.dataUrl,
                      status: 'draft',
                      designerNote: '',
                      ngTags: [],
                      source: 'custom',
                    }))
                  // 楽観更新: UIに即反映
                  setStamps(prev => [...prev, ...newStamps.map(s => ({ ...s, imageUrl: s.dataUrl }))])
                  setAddedToGallery(true)
                  // Storage upload + Firestore 書き込み（逐次発火、失敗は個別ログ）
                  for (const s of newStamps) {
                    try {
                      await createStampWithImage(s)
                    } catch (err) {
                      console.warn(`[BatchForm] createStamp ${s.id} failed:`, err.message)
                    }
                  }
                  if (onClose) setTimeout(onClose, 500)
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
          {!addedToGallery && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button
                className="filter-btn"
                disabled={generating}
                onClick={() => handleGenerate({ append: true })}
                title="同じプロンプト・設定で追加生成します"
              >
                {generating ? '生成中...' : `同じ設定でもう${count}枚生成`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
