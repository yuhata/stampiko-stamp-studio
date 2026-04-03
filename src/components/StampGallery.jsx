import { useState } from 'react'

const AREA_LABELS = {
  asakusa: '浅草',
  shibuya: '渋谷',
  shinjuku: '新宿',
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全て' },
  { value: 'draft', label: '未レビュー' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
  { value: 'needs_edit', label: '要修正' },
]

// よくあるNG理由のプリセット（蓄積されたログから自動追加も可能）
const NG_PRESETS = [
  { label: 'テキスト混入', category: 'content', promptHint: 'テキスト・文字・数字の禁止を強化' },
  { label: '構図が偏っている', category: 'composition', promptHint: '中央配置・余白バランスの指示を追加' },
  { label: 'デジタル感が強い', category: 'texture', promptHint: 'インクテクスチャ・かすれ効果の指示を強化' },
  { label: 'パレット逸脱', category: 'color', promptHint: 'パレット制限の指示を厳格化' },
  { label: 'ランドマーク不明瞭', category: 'recognition', promptHint: 'シルエットの明確さ・サイズ比率の指示を追加' },
  { label: '背景が白くない', category: 'background', promptHint: '背景色 #FFFFFF の指定を明示' },
  { label: 'グラデーションあり', category: 'style', promptHint: 'NO gradients の指示を強調' },
  { label: '写実的すぎる', category: 'style', promptHint: 'flat graphic shapes, geometric simplification を強調' },
]

export default function StampGallery({
  stamps, areas, filterArea, setFilterArea,
  filterStatus, setFilterStatus, updateStamp,
  addNgReason, ngReasons,
  focusSpotId, clearFocusSpot,
}) {
  const [selected, setSelected] = useState(null)

  const filtered = stamps.filter(s => {
    if (filterArea !== 'all' && s.area !== filterArea) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const grouped = {}
  filtered.forEach(s => {
    if (!grouped[s.spotId]) grouped[s.spotId] = { spotName: s.spotName, area: s.area, stamps: [] }
    grouped[s.spotId].stamps.push(s)
  })

  return (
    <div>
      <div className="filters">
        <div className="filter-group">
          <label>エリア:</label>
          <button
            className={`filter-btn ${filterArea === 'all' ? 'active' : ''}`}
            onClick={() => setFilterArea('all')}
          >全て</button>
          {areas.map(a => (
            <button
              key={a}
              className={`filter-btn ${filterArea === a ? 'active' : ''}`}
              onClick={() => setFilterArea(a)}
            >{AREA_LABELS[a] || a}</button>
          ))}
        </div>
        <div className="filter-group">
          <label>ステータス:</label>
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`filter-btn ${filterStatus === o.value ? 'active' : ''}`}
              onClick={() => setFilterStatus(o.value)}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state"><p>該当するスタンプがありません</p></div>
      ) : (
        Object.entries(grouped).map(([spotId, group]) => (
          <div key={spotId}>
            <div style={{ padding: '12px 24px 0', fontSize: 14, color: '#fff', fontWeight: 600 }}>
              {group.spotName}
              <span style={{ fontSize: 11, color: '#ff6b35', marginLeft: 8 }}>
                {AREA_LABELS[group.area] || group.area}
              </span>
            </div>
            <div className="stamp-grid">
              {group.stamps.map(stamp => (
                <StampCard
                  key={stamp.id}
                  stamp={stamp}
                  onClick={() => setSelected(stamp)}
                  updateStamp={updateStamp}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {selected && (
        <StampModal
          stamp={selected}
          onClose={() => setSelected(null)}
          updateStamp={(id, updates) => {
            updateStamp(id, updates)
            setSelected(prev => ({ ...prev, ...updates }))
          }}
          addNgReason={addNgReason}
          ngReasons={ngReasons}
        />
      )}
    </div>
  )
}

function StampCard({ stamp, onClick, updateStamp }) {
  const ngCount = (stamp.ngTags || []).length
  return (
    <div className="stamp-card" data-status={stamp.status} onClick={onClick}>
      <div className="stamp-image-wrapper">
        <img src={`${import.meta.env.BASE_URL}${stamp.path}`} alt={stamp.spotName} loading="lazy" />
        <span className="status-badge" data-status={stamp.status}>
          {stamp.status === 'approved' ? '承認' :
           stamp.status === 'rejected' ? '却下' :
           stamp.status === 'needs_edit' ? '要修正' : '未レビュー'}
        </span>
        {ngCount > 0 && (
          <span className="ng-count-badge">{ngCount} NG</span>
        )}
      </div>
      <div className="stamp-info">
        <span className="variant-label">候補 {stamp.variant + 1}</span>
      </div>
      <div className="stamp-actions" onClick={e => e.stopPropagation()}>
        <button className="action-btn approve" onClick={() => updateStamp(stamp.id, { status: 'approved' })}>承認</button>
        <button className="action-btn edit" onClick={() => updateStamp(stamp.id, { status: 'needs_edit' })}>要修正</button>
        <button className="action-btn reject" onClick={() => updateStamp(stamp.id, { status: 'rejected' })}>却下</button>
      </div>
    </div>
  )
}

function StampModal({ stamp, onClose, updateStamp, addNgReason, ngReasons }) {
  const [note, setNote] = useState(stamp.designerNote || '')
  const [selectedTags, setSelectedTags] = useState(stamp.ngTags || [])
  const [customReason, setCustomReason] = useState('')

  const toggleTag = (label) => {
    const next = selectedTags.includes(label)
      ? selectedTags.filter(t => t !== label)
      : [...selectedTags, label]
    setSelectedTags(next)
    updateStamp(stamp.id, { ngTags: next })
  }

  const handleReject = () => {
    // NG理由をログに記録
    const reasons = selectedTags.length > 0 ? selectedTags : (customReason ? [customReason] : ['理由未記入'])
    reasons.forEach(reason => {
      const preset = NG_PRESETS.find(p => p.label === reason)
      addNgReason({
        stampId: stamp.id,
        spotName: stamp.spotName,
        area: stamp.area,
        reason,
        category: preset?.category || 'other',
        promptHint: preset?.promptHint || '',
        customNote: note,
      })
    })
    updateStamp(stamp.id, { status: 'rejected', designerNote: note, ngTags: selectedTags })
  }

  const handleNeedsEdit = () => {
    const reasons = selectedTags.length > 0 ? selectedTags : (customReason ? [customReason] : [])
    reasons.forEach(reason => {
      const preset = NG_PRESETS.find(p => p.label === reason)
      addNgReason({
        stampId: stamp.id,
        spotName: stamp.spotName,
        area: stamp.area,
        reason,
        category: preset?.category || 'other',
        promptHint: preset?.promptHint || '',
        customNote: note,
      })
    })
    updateStamp(stamp.id, { status: 'needs_edit', designerNote: note, ngTags: selectedTags })
  }

  // このスタンプの過去NG履歴
  const stampHistory = ngReasons.filter(r => r.stampId === stamp.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-image">
          <img src={`${import.meta.env.BASE_URL}${stamp.path}`} alt={stamp.spotName} />
        </div>
        <div className="modal-body">
          <h3>{stamp.spotName} — 候補 {stamp.variant + 1}</h3>
          <p style={{ fontSize: 13, color: '#888' }}>
            エリア: {AREA_LABELS[stamp.area] || stamp.area} / ステータス: {stamp.status}
          </p>

          {/* NG理由タグ選択 */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              NG理由（複数選択可）:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {NG_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  className={`ng-tag ${selectedTags.includes(preset.label) ? 'selected' : ''}`}
                  onClick={() => toggleTag(preset.label)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* カスタム理由 */}
          <div style={{ marginTop: 10 }}>
            <input
              type="text"
              className="note-input"
              style={{ margin: 0, width: '100%' }}
              placeholder="その他のNG理由を追加..."
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customReason.trim()) {
                  toggleTag(customReason.trim())
                  setCustomReason('')
                }
              }}
            />
          </div>

          {/* 詳細メモ */}
          <textarea
            className="note-input"
            style={{ margin: '10px 0 0', width: '100%' }}
            rows={2}
            placeholder="補足メモ（修正指示・気づきなど）"
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          {/* アクションボタン */}
          <div className="modal-actions">
            <button className="action-btn approve" onClick={() => {
              updateStamp(stamp.id, { status: 'approved', designerNote: note })
            }}>承認</button>
            <button className="action-btn edit" onClick={handleNeedsEdit}>
              要修正{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
            </button>
            <button className="action-btn reject" onClick={handleReject}>
              却下{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
            </button>
          </div>

          {/* 過去のNG履歴 */}
          {stampHistory.length > 0 && (
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 11 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>過去のNG記録:</div>
              {stampHistory.map((h, i) => (
                <div key={i} style={{ color: 'var(--accent-red)', marginBottom: 2 }}>
                  {h.reason}{h.customNote ? ` — ${h.customNote}` : ''}
                </div>
              ))}
            </div>
          )}

          <button className="modal-close" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
