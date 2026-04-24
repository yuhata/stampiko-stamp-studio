// TemplateManager - 16カテゴリのテンプレートスタンプ画像を管理するUI
// ギャラリータブと並列、Firestore stamp_templates + Storage stamp_templates/ を管理
// 差し替えボタン → TemplateEditModal（Gemini生成 or ローカルアップロード）
import { useState, useEffect } from 'react'
import { subscribeTemplates, TEMPLATE_CATEGORIES } from '../config/stampTemplates'
import TemplateEditModal from './TemplateEditModal'

export default function TemplateManager() {
  const [templates, setTemplates] = useState({}) // { [category]: {imageUrl, storagePath, updatedAt, color, ...} }
  const [ready, setReady] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null) // 編集モーダル対象カテゴリ
  const [previewOpen, setPreviewOpen] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

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

      {errorMsg && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 6,
          background: 'rgba(255, 80, 80, 0.15)', color: '#faa', fontSize: 13,
        }}>
          ⚠️ {errorMsg}
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
          const imageSrc = tpl?.imageUrl || githubFallbackUrl(cat.id)
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

              {/* 差し替えボタン（モーダルを開く） */}
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => setEditingCategory(cat)}
                  style={{
                    width: '100%', padding: '6px 10px', fontSize: 12,
                    background: cat.color, color: '#fff',
                    border: 'none', borderRadius: 5, cursor: 'pointer',
                  }}
                >
                  📤 差し替え
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 編集モーダル（Gemini生成 or ローカルアップロード） */}
      {editingCategory && (
        <TemplateEditModal
          category={editingCategory}
          currentImageUrl={templates[editingCategory.id]?.imageUrl}
          onClose={() => setEditingCategory(null)}
        />
      )}

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
