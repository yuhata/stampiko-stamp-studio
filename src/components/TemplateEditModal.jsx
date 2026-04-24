// TemplateEditModal - カテゴリ別テンプレ画像を Gemini生成 or ローカルアップロードで差し替えるモーダル
// BatchForm と同等のオプション（mood / elements / 参照画像 / プロンプトテンプレ編集）を提供しつつ、
// テンプレ特有の固定値（構図=circular / 単色=category.color / スポット名なし）は内部で処理
import { useState, useMemo } from 'react'
import { replaceTemplateImage } from '../config/stampTemplates'
import {
  API_URL, MOOD_OPTIONS, ELEMENT_OPTIONS, buildDesignOptionsBlock,
} from '../config/promptDefaults'
import {
  buildTemplatePrompt, DEFAULT_TEMPLATE_PROMPT, TEMPLATE_ILLUSTRATIONS,
} from '../config/templatePrompts'
import { cropToCircle } from '../utils/imageProcess'

export default function TemplateEditModal({ category, currentImageUrl, onClose }) {
  const [mode, setMode] = useState('gemini') // 'gemini' | 'local'

  // Gemini 生成オプション
  const [count, setCount] = useState(2) // BatchForm と同じデフォルト
  const [illustrationText, setIllustrationText] = useState(
    TEMPLATE_ILLUSTRATIONS[category.id] || 'Simple iconic landmark silhouette'
  )
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_TEMPLATE_PROMPT)
  const [mood, setMood] = useState('')
  const [elements, setElements] = useState([])
  const [refImage, setRefImage] = useState(null) // { base64, mimeType } | null
  const [showPromptEditor, setShowPromptEditor] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [candidates, setCandidates] = useState([]) // [{ id, dataUrl, error? }]
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [localPreview, setLocalPreview] = useState(null)
  const [adopting, setAdopting] = useState(false)
  const [error, setError] = useState(null)

  // フルプロンプト（確認表示用）
  const fullPrompt = useMemo(() => {
    const base = buildTemplatePrompt({
      categoryId: category.id,
      color: category.color,
      illustration: illustrationText,
      template: promptTemplate,
    })
    const optionBlock = buildDesignOptionsBlock({ mood, colorCount: 'mono', elements })
    return base + optionBlock
  }, [category.id, category.color, illustrationText, promptTemplate, mood, elements])

  function toggleElement(value) {
    setElements(prev => prev.includes(value) ? prev.filter(e => e !== value) : [...prev, value])
  }

  async function handleRefImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('参照画像は5MB以下にしてください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      // "data:image/png;base64,xxx" → xxx
      const [meta, base64] = dataUrl.split(',')
      const mimeType = meta.match(/data:([^;]+);/)?.[1] || 'image/png'
      setRefImage({ base64, mimeType, preview: dataUrl })
    }
    reader.onerror = () => setError('参照画像読み込み失敗')
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    setSelectedCandidateId(null)
    try {
      const body = { prompt: fullPrompt, count }
      if (refImage) body.referenceImage = { base64: refImage.base64, mimeType: refImage.mimeType }

      const headers = { 'Content-Type': 'application/json' }
      const studioKey = import.meta.env.VITE_STUDIO_API_KEY
      if (studioKey) headers.Authorization = `Bearer studio:${studioKey}`

      const res = await fetch(`${API_URL}/api/generate-stamp-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `API ${res.status}`)

      const rawResults = (data.results || []).map((r, i) => {
        if (r.base64) {
          return {
            id: `gen_${Date.now()}_${i}`,
            dataUrl: `data:${r.mimeType || 'image/png'};base64,${r.base64}`,
            variant: r.index,
          }
        }
        return { id: `err_${i}`, error: r.error || '生成失敗', variant: r.index }
      })

      // 円形切り抜き（構図=circular固定）
      const results = await Promise.all(
        rawResults.map(async (r) => {
          if (!r.dataUrl) return r
          try {
            const cropped = await cropToCircle(r.dataUrl)
            return { ...r, dataUrl: cropped }
          } catch {
            return r
          }
        })
      )
      setCandidates(results)
    } catch (err) {
      console.error('[TemplateEditModal] generate failed:', err)
      setError(`生成エラー: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  function handleLocalFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.type !== 'image/png') {
      setError('PNG形式のみアップロード可能です')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(`ファイルサイズが2MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLocalPreview(reader.result)
    reader.onerror = () => setError('ファイル読み込み失敗')
    reader.readAsDataURL(file)
  }

  async function adoptDataUrl(dataUrl) {
    if (!dataUrl) return
    setAdopting(true)
    setError(null)
    try {
      const meta = {
        color: category.color,
        label: category.label,
        is_placeholder: false,
      }
      await replaceTemplateImage(category.id, dataUrl, currentImageUrl, meta)
      onClose()
    } catch (err) {
      console.error('[TemplateEditModal] adopt failed:', err)
      setError(`採用失敗: ${err.message}`)
    } finally {
      setAdopting(false)
    }
  }

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111', color: '#eee',
          width: 'min(960px, 95vw)', maxHeight: '92vh',
          borderRadius: 10, overflow: 'auto',
          padding: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              <span style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                background: category.color, marginRight: 8, verticalAlign: 'middle',
              }} />
              {category.label}（<code style={{ fontSize: 13 }}>{category.id}</code>）テンプレート編集
            </h2>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              色: <code>{category.color}</code>（単色固定）／ 構図: <code>circular</code>（円形固定）／ 下部25-30%はPOI名合成用の空白
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: '#aaa', border: 'none', fontSize: 22, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setMode('gemini')}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', borderRadius: 6,
              background: mode === 'gemini' ? category.color : '#333',
              color: mode === 'gemini' ? '#fff' : '#ccc',
              cursor: 'pointer', fontSize: 14, fontWeight: mode === 'gemini' ? 600 : 400,
            }}
          >
            🎨 Gemini で生成
          </button>
          <button
            onClick={() => setMode('local')}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', borderRadius: 6,
              background: mode === 'local' ? category.color : '#333',
              color: mode === 'local' ? '#fff' : '#ccc',
              cursor: 'pointer', fontSize: 14, fontWeight: mode === 'local' ? 600 : 400,
            }}
          >
            📁 ローカルからアップロード
          </button>
        </div>

        {error && (
          <div style={{
            padding: 12, marginBottom: 12, borderRadius: 6,
            background: 'rgba(255, 80, 80, 0.15)', color: '#faa', fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Gemini mode */}
        {mode === 'gemini' && (
          <div>
            {/* イラスト記述 */}
            <Field label="イラスト記述（英語）" hint="Gemini プロンプトのILLUSTRATIONセクションに入る">
              <textarea
                value={illustrationText}
                onChange={(e) => setIllustrationText(e.target.value)}
                rows={2}
                style={textareaStyle}
              />
            </Field>

            {/* 雰囲気 */}
            <Field label="雰囲気" hint="全体のテイスト">
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                style={selectStyle}
              >
                {MOOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            {/* 要素（複数選択） */}
            <Field label="含める要素（複数可）" hint="illustration記述と組み合わせて生成される">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ELEMENT_OPTIONS.map(o => (
                  <label key={o.value} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 4,
                    background: elements.includes(o.value) ? category.color : '#222',
                    color: elements.includes(o.value) ? '#fff' : '#aaa',
                    cursor: 'pointer', fontSize: 12,
                  }}>
                    <input
                      type="checkbox"
                      checked={elements.includes(o.value)}
                      onChange={() => toggleElement(o.value)}
                      style={{ display: 'none' }}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </Field>

            {/* 参照画像 */}
            <Field label="参照画像（任意）" hint="既存テンプレの改版 or 似た意匠を伝えたい時">
              <input type="file" accept="image/*" onChange={handleRefImageChange} style={{ fontSize: 12 }} />
              {refImage && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={refImage.preview} alt="ref" style={{ height: 48, borderRadius: 4, background: '#fff' }} />
                  <button onClick={() => setRefImage(null)} style={linkBtnStyle}>× 解除</button>
                </div>
              )}
            </Field>

            {/* プロンプトテンプレ編集（折畳） */}
            <Field
              label={<>
                プロンプトテンプレート編集{' '}
                <button onClick={() => setShowPromptEditor(v => !v)} style={linkBtnStyle}>
                  {showPromptEditor ? '閉じる' : '開く'}
                </button>
              </>}
              hint={showPromptEditor ? '{CATEGORY} / {COLOR} / {ILLUSTRATION} が差し込まれる' : null}
            >
              {showPromptEditor && (
                <>
                  <textarea
                    value={promptTemplate}
                    onChange={(e) => setPromptTemplate(e.target.value)}
                    rows={14}
                    style={{ ...textareaStyle, fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <button onClick={() => setPromptTemplate(DEFAULT_TEMPLATE_PROMPT)} style={linkBtnStyle}>
                    デフォルトに戻す
                  </button>
                </>
              )}
            </Field>

            {/* 候補数 */}
            <Field label={`候補数: ${count}`} hint={`Gemini コスト目安: ~$${(count * 0.039).toFixed(2)} (${count}枚 × $0.039)`}>
              <input
                type="range" min={1} max={5} value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </Field>

            {/* フルプロンプトプレビュー（折畳） */}
            <details style={{ marginBottom: 12, background: '#0a0a0a', borderRadius: 4, padding: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#888' }}>
                組み立て後のフルプロンプトを確認（{fullPrompt.length}文字）
              </summary>
              <pre style={{
                fontSize: 10, color: '#9c9',
                padding: 8, overflow: 'auto', margin: '8px 0 0', maxHeight: 240,
                whiteSpace: 'pre-wrap',
              }}>{fullPrompt}</pre>
            </details>

            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                width: '100%', padding: '12px 16px', border: 'none', borderRadius: 6,
                background: generating ? '#555' : category.color, color: '#fff',
                cursor: generating ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {generating ? `⏳ 生成中（${count}枚、30〜60秒）...` : `🎨 ${count}枚生成`}
            </button>

            {candidates.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                  候補をクリックして選択 → 「このデザインを採用」で確定
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(candidates.length, 3)}, 1fr)`,
                  gap: 10, marginBottom: 16,
                }}>
                  {candidates.map(c => (
                    <div
                      key={c.id}
                      onClick={() => !c.error && setSelectedCandidateId(c.id)}
                      style={{
                        background: '#fff', borderRadius: 8, overflow: 'hidden',
                        border: `3px solid ${selectedCandidateId === c.id ? category.color : 'transparent'}`,
                        cursor: c.error ? 'not-allowed' : 'pointer',
                        opacity: c.error ? 0.4 : 1,
                      }}
                    >
                      {c.dataUrl ? (
                        <img src={c.dataUrl} alt="candidate" style={{ width: '100%', display: 'block' }} />
                      ) : (
                        <div style={{ padding: 20, color: '#900', textAlign: 'center', fontSize: 12 }}>
                          エラー: {c.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => selectedCandidate && adoptDataUrl(selectedCandidate.dataUrl)}
                  disabled={!selectedCandidate || adopting}
                  style={{
                    width: '100%', padding: '12px', border: 'none', borderRadius: 6,
                    background: (!selectedCandidate || adopting) ? '#444' : '#2a7',
                    color: '#fff', cursor: (!selectedCandidate || adopting) ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 600,
                  }}
                >
                  {adopting ? '⏳ 保存中...' : selectedCandidate ? '✅ このデザインを採用' : '候補を選択してください'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Local upload mode */}
        {mode === 'local' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <input type="file" accept="image/png" onChange={handleLocalFileChange} style={{ fontSize: 13 }} />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                PNG形式、2MB以下、推奨: 1024×1024、下部25-30%は空白（POI名合成用）
              </div>
            </div>
            {localPreview && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>プレビュー:</div>
                <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', width: '50%', margin: '0 auto' }}>
                  <img src={localPreview} alt="preview" style={{ width: '100%', display: 'block' }} />
                </div>
              </div>
            )}
            <button
              onClick={() => adoptDataUrl(localPreview)}
              disabled={!localPreview || adopting}
              style={{
                width: '100%', padding: '12px', border: 'none', borderRadius: 6,
                background: (!localPreview || adopting) ? '#444' : '#2a7',
                color: '#fff', cursor: (!localPreview || adopting) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
              }}
            >
              {adopting ? '⏳ 保存中...' : localPreview ? '✅ このファイルで差し替え' : 'PNGファイルを選択してください'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- 小物 ----------
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#ccc', marginBottom: 4 }}>
        {label}
        {hint && <span style={{ fontSize: 11, color: '#666', marginLeft: 6 }}>— {hint}</span>}
      </div>
      {children}
    </div>
  )
}

const textareaStyle = {
  width: '100%', padding: 8,
  background: '#222', color: '#eee', border: '1px solid #333', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 13,
  boxSizing: 'border-box',
}

const selectStyle = {
  padding: 6,
  background: '#222', color: '#eee', border: '1px solid #333', borderRadius: 4,
  fontSize: 13,
}

const linkBtnStyle = {
  background: 'transparent', color: '#8cf', border: 'none',
  textDecoration: 'underline', cursor: 'pointer', fontSize: 11, padding: 0, marginLeft: 8,
}
