// TemplateManager - 16カテゴリのテンプレートスタンプ画像を管理するUI
// ギャラリータブと並列、Firestore stamp_templates + Storage stamp_templates/ を管理
import { useState, useEffect, useRef } from 'react'
import {
  subscribeTemplates, replaceTemplateImage, upsertTemplate, TEMPLATE_CATEGORIES,
} from '../config/stampTemplates'

export default function TemplateManager() {
  const [templates, setTemplates] = useState({}) // { [category]: {imageUrl, storagePath, updatedAt, color, ...} }
  const [ready, setReady] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(null)
  const fileInputRefs = useRef({}) // { [category]: inputRef }

  useEffect(() => {
    const unsub = subscribeTemplates((docs) => {
      setTemplates(docs)
      setReady(true)
    })
    return () => unsub()
  }, [])

  // GitHub raw URL（Firestoreにdocが無いカテゴリ用フォールバックプレビュー）
  const githubFallbackUrl = (category) =>
    `https://raw.githubusercontent.com/yuhata/lbs-stamp-studio/main/public/template-designs-v3/${category}.png`

  async function handleFileChange(category, e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)

    // バリデーション
    if (file.type !== 'image/png') {
      setUploadError('PNG形式のみアップロード可能です')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(`ファイルサイズが2MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）`)
      return
    }

    setUploadingCategory(category)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('ファイル読み込み失敗'))
        reader.readAsDataURL(file)
      })

      const oldImageUrl = templates[category]?.imageUrl
      const meta = {
        color: TEMPLATE_CATEGORIES.find(c => c.id === category)?.color,
        label: TEMPLATE_CATEGORIES.find(c => c.id === category)?.label,
        is_placeholder: false, // 手動アップロードは常に本格扱い
      }
      await replaceTemplateImage(category, dataUrl, oldImageUrl, meta)
    } catch (err) {
      console.error('[TemplateManager] upload failed:', err)
      setUploadError(`アップロード失敗: ${err.message}`)
    } finally {
      setUploadingCategory(null)
      // input リセット（同じファイルを再選択可能に）
      if (e.target) e.target.value = ''
    }
  }

  async function handleTogglePlaceholder(category) {
    const current = templates[category]?.is_placeholder
    try {
      await upsertTemplate(category, { is_placeholder: !current })
    } catch (err) {
      console.error('[TemplateManager] toggle failed:', err)
      setUploadError(`状態更新失敗: ${err.message}`)
    }
  }

  if (!ready) {
    return <div style={{ padding: 24, color: '#888' }}>テンプレートを読み込み中...</div>
  }

  const placeholderCount = TEMPLATE_CATEGORIES.filter(c => templates[c.id]?.is_placeholder).length
  const notRegisteredCount = TEMPLATE_CATEGORIES.filter(c => !templates[c.id]).length

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>テンプレートスタンプ管理</h2>
        <span style={{ fontSize: 13, color: '#888' }}>
          {TEMPLATE_CATEGORIES.length}カテゴリ /
          未登録 <strong style={{ color: '#e88' }}>{notRegisteredCount}</strong> /
          暫定 <strong style={{ color: '#ea0' }}>{placeholderCount}</strong>
        </span>
      </div>

      {uploadError && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 6,
          background: 'rgba(255, 80, 80, 0.15)', color: '#faa', fontSize: 13,
        }}>
          ⚠️ {uploadError}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {TEMPLATE_CATEGORIES.map(cat => {
          const tpl = templates[cat.id]
          const hasFirestore = !!tpl?.imageUrl
          const isPlaceholder = tpl?.is_placeholder !== false && !hasFirestore // 未登録も暫定扱い
          const imageSrc = tpl?.imageUrl || githubFallbackUrl(cat.id)
          const uploading = uploadingCategory === cat.id
          const status = hasFirestore
            ? (tpl.is_placeholder ? 'placeholder' : 'official')
            : 'unregistered'

          return (
            <div
              key={cat.id}
              style={{
                border: `2px solid ${cat.color}33`,
                borderRadius: 10,
                padding: 12,
                background: '#1a1a1a',
                position: 'relative',
              }}
            >
              {/* ステータスバッジ */}
              <div style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: status === 'official' ? '#2a7' : status === 'placeholder' ? '#a82' : '#844',
                color: '#fff',
              }}>
                {status === 'official' ? '本格' : status === 'placeholder' ? '暫定' : '未登録'}
              </div>

              {/* 画像プレビュー */}
              <div
                style={{
                  width: '100%', aspectRatio: '1/1',
                  background: '#fff', borderRadius: 6,
                  overflow: 'hidden', cursor: 'zoom-in',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => setPreviewOpen(cat.id)}
              >
                <img
                  src={imageSrc}
                  alt={cat.label}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.opacity = 0.3 }}
                />
              </div>

              {/* カテゴリ名 */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: 3, background: cat.color,
                  display: 'inline-block', flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{cat.label}</div>
                  <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{cat.id}</div>
                </div>
              </div>

              {/* メタ情報 */}
              {tpl?.updatedAt && (
                <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                  更新: {tpl.updatedAt.toDate ? tpl.updatedAt.toDate().toLocaleDateString('ja-JP') : '-'}
                </div>
              )}

              {/* アップロードボタン */}
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <input
                  type="file"
                  accept="image/png"
                  style={{ display: 'none' }}
                  ref={(el) => { fileInputRefs.current[cat.id] = el }}
                  onChange={(e) => handleFileChange(cat.id, e)}
                />
                <button
                  onClick={() => fileInputRefs.current[cat.id]?.click()}
                  disabled={uploading}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 12,
                    background: uploading ? '#555' : cat.color, color: '#fff',
                    border: 'none', borderRadius: 5, cursor: uploading ? 'wait' : 'pointer',
                  }}
                >
                  {uploading ? '⏳ 投稿中...' : '📤 差し替え'}
                </button>
                {hasFirestore && (
                  <button
                    onClick={() => handleTogglePlaceholder(cat.id)}
                    title={tpl.is_placeholder ? '本格扱いに変更' : '暫定扱いに変更'}
                    style={{
                      padding: '6px 10px', fontSize: 12,
                      background: 'transparent', color: '#ccc',
                      border: '1px solid #444', borderRadius: 5, cursor: 'pointer',
                    }}
                  >
                    {tpl.is_placeholder ? '→本格' : '→暫定'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* プレビューモーダル */}
      {previewOpen && (
        <div
          onClick={() => setPreviewOpen(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <img
            src={templates[previewOpen]?.imageUrl || githubFallbackUrl(previewOpen)}
            alt={previewOpen}
            style={{ maxWidth: '90%', maxHeight: '90%', background: '#fff', borderRadius: 10 }}
          />
        </div>
      )}
    </div>
  )
}
