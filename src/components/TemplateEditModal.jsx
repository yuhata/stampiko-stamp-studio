// TemplateEditModal - カテゴリ別テンプレ画像を Gemini生成 or ローカルアップロードで差し替えるモーダル
// TemplateManager の各カード「差し替え」ボタンから呼び出される
import { useState } from 'react'
import { replaceTemplateImage } from '../config/stampTemplates'
import { API_URL } from '../config/promptDefaults'
import { buildTemplatePrompt, TEMPLATE_ILLUSTRATIONS } from '../config/templatePrompts'

export default function TemplateEditModal({ category, currentImageUrl, onClose }) {
  const [mode, setMode] = useState('gemini') // 'gemini' | 'local'
  const [count, setCount] = useState(3) // 生成候補数
  const [illustrationText, setIllustrationText] = useState(
    TEMPLATE_ILLUSTRATIONS[category.id] || 'Simple iconic landmark silhouette'
  )
  const [generating, setGenerating] = useState(false)
  const [candidates, setCandidates] = useState([]) // [{ id, dataUrl, error? }]
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [localPreview, setLocalPreview] = useState(null) // dataUrl for local upload preview
  const [adopting, setAdopting] = useState(false)
  const [error, setError] = useState(null)

  const prompt = buildTemplatePrompt(category.id, category.color, illustrationText)

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    setSelectedCandidateId(null)
    try {
      const body = { prompt, count }
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

      const results = (data.results || []).map((r, i) => {
        if (r.base64) {
          return {
            id: `gen_${Date.now()}_${i}`,
            dataUrl: `data:${r.mimeType || 'image/png'};base64,${r.base64}`,
            variant: r.index,
          }
        }
        return { id: `err_${i}`, error: r.error || '生成失敗', variant: r.index }
      })
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
        is_placeholder: false, // Gemini生成もローカルアップロードも本格扱い
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
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111', color: '#eee',
          width: 'min(900px, 92vw)', maxHeight: '92vh',
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
              色: <code>{category.color}</code>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', color: '#aaa', border: 'none', fontSize: 22, cursor: 'pointer' }}
            title="閉じる"
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
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#aaa' }}>
                イラスト記述（英語、Gemini プロンプトの ILLUSTRATION 部分）
              </label>
              <textarea
                value={illustrationText}
                onChange={(e) => setIllustrationText(e.target.value)}
                rows={2}
                style={{
                  width: '100%', fontSize: 13, padding: 8,
                  background: '#222', color: '#eee', border: '1px solid #333', borderRadius: 4,
                  marginTop: 4, fontFamily: 'monospace',
                }}
              />
            </div>

            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13 }}>候補数: {count}</label>
              <input
                type="range" min={1} max={5} value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, color: '#888' }}>
                ~${(count * 0.039).toFixed(2)} ({count}枚 × $0.039)
              </span>
            </div>

            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#888' }}>フルプロンプトを見る</summary>
              <pre style={{
                fontSize: 11, background: '#0a0a0a', color: '#aaa',
                padding: 10, borderRadius: 4, overflow: 'auto', marginTop: 6,
              }}>{prompt}</pre>
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
                  候補をクリックして選択 → 「このデザインを採用」ボタンで確定
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
                        transition: 'border-color 0.1s',
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
              <input
                type="file"
                accept="image/png"
                onChange={handleLocalFileChange}
                style={{ fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                PNG形式、2MB以下、推奨: 512×512 or 1024×1024
              </div>
            </div>

            {localPreview && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>プレビュー:</div>
                <div style={{
                  background: '#fff', borderRadius: 8, overflow: 'hidden',
                  width: '50%', margin: '0 auto',
                }}>
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
