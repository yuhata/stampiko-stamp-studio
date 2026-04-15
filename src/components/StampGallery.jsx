import { useState, useEffect, useRef } from 'react'
import { AREA_LABELS, CANONICAL_AREAS } from '../config/areas'
import BatchForm from './BatchForm'

const STATUS_OPTIONS = [
  { value: 'all', label: '全て' },
  { value: 'draft', label: '未レビュー' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
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
  stamps, setStamps, areas, filterArea, setFilterArea,
  filterStatus, setFilterStatus, updateStamp,
  addNgReason, ngReasons,
  focusSpotId, clearFocusSpot,
  onShowOnMap,
}) {
  const [selected, setSelected] = useState(null)
  const [batchSpot, setBatchSpot] = useState(null) // 既存スポットへの追加生成モーダル
  const focusRef = useRef(null)

  // マップからのスポット選択時にスクロール
  useEffect(() => {
    if (focusSpotId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      clearFocusSpot()
    }
  }, [focusSpotId, clearFocusSpot])

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
          <select
            value={filterArea}
            onChange={e => setFilterArea(e.target.value)}
            className="filter-select"
          >
            <option value="all">全て</option>
            {/* 正式な25エリアを常に表示。stampsに含まれない未使用エリアidも（後方互換）末尾に追加 */}
            {CANONICAL_AREAS.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
            {areas.filter(a => !AREA_LABELS[a]).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
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
          <button
            onClick={() => {
              const rejectedCount = stamps.filter(s => s.status === 'rejected').length
              if (rejectedCount === 0) { alert('却下済みスタンプはありません'); return }
              if (!confirm(`却下済みスタンプ${rejectedCount}件をすべて削除します。よろしいですか？`)) return
              setStamps(prev => prev.filter(s => s.status !== 'rejected'))
            }}
            className="filter-btn"
            style={{ marginLeft: 8, color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
            title="却下済みスタンプを一括削除"
          >
            🗑 却下を一括削除
          </button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="empty-state"><p>該当するスタンプがありません</p></div>
      ) : (
        Object.entries(grouped).map(([spotId, group]) => (
          <div key={spotId}>
            <div style={{ padding: '12px 24px 0', fontSize: 14, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{group.spotName}</span>
              <span style={{ fontSize: 11, color: '#ff6b35' }}>
                {AREA_LABELS[group.area] || group.area}
              </span>
              <button
                title="このスポットに新しいスタンプを生成する"
                onClick={() => {
                  const ref = group.stamps[0]
                  setBatchSpot({
                    spotId,
                    spotName: group.spotName,
                    area: group.area,
                    lat: ref?.lat || 0,
                    lng: ref?.lng || 0,
                  })
                }}
                style={{
                  marginLeft: 'auto', background: 'none',
                  border: '1px solid var(--accent)', borderRadius: 4,
                  color: 'var(--accent)', fontSize: 11, padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                ＋ スタンプ追加生成
              </button>
              <button
                title="このスポットを削除（ローカル状態のみ）"
                onClick={() => {
                  if (!confirm(`スポット「${group.spotName}」と、紐づく${group.stamps.length}件のスタンプを削除します。よろしいですか？`)) return
                  setStamps(prev => prev.filter(s => s.spotId !== spotId))
                }}
                style={{
                  background: 'none',
                  border: '1px solid var(--accent-red)', borderRadius: 4,
                  color: 'var(--accent-red)', fontSize: 11, padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                スポット削除
              </button>
            </div>
            <div className="stamp-grid">
              {group.stamps.map(stamp => (
                <div key={stamp.id} ref={stamp.spotId === focusSpotId ? focusRef : null}>
                  <StampCard
                    stamp={stamp}
                    onClick={() => setSelected(stamp)}
                    updateStamp={updateStamp}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {batchSpot && (
        <div className="modal-overlay" onClick={() => setBatchSpot(null)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 720, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>スタンプ追加生成 — {batchSpot.spotName}</h3>
                <button onClick={() => setBatchSpot(null)} style={{
                  background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer',
                }}>✕</button>
              </div>
              <BatchForm
                stamps={stamps}
                setStamps={setStamps}
                ngReasons={ngReasons}
                lockedSpot={batchSpot}
                onClose={() => setBatchSpot(null)}
              />
            </div>
          </div>
        </div>
      )}

      {selected && (
        <StampModal
          stamp={selected}
          stamps={stamps}
          onClose={() => setSelected(null)}
          updateStamp={(id, updates) => {
            updateStamp(id, updates)
            setSelected(prev => ({ ...prev, ...updates }))
          }}
          addNgReason={addNgReason}
          ngReasons={ngReasons}
          onShowOnMap={onShowOnMap}
          setStamps={setStamps}
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
        <img src={stamp.imageUrl || stamp.dataUrl || `${import.meta.env.BASE_URL}${stamp.path}`} alt={stamp.spotName} loading="lazy" />
        <span className="status-badge" data-status={stamp.status}>
          {stamp.status === 'approved' ? '承認' :
           stamp.status === 'rejected' ? '却下' : '未レビュー'}
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
        <button className="action-btn reject" onClick={() => updateStamp(stamp.id, { status: 'rejected' })}>却下</button>
      </div>
    </div>
  )
}

function StampModal({ stamp, stamps, onClose, updateStamp, addNgReason, ngReasons, onShowOnMap, setStamps }) {
  const [note, setNote] = useState(stamp.designerNote || '')
  const [selectedTags, setSelectedTags] = useState(stamp.ngTags || [])
  const [customReason, setCustomReason] = useState('')
  const [showVariation, setShowVariation] = useState(false)

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

  // このスタンプの過去NG履歴
  const stampHistory = ngReasons.filter(r => r.stampId === stamp.id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-image">
          <img src={stamp.imageUrl || stamp.dataUrl || `${import.meta.env.BASE_URL}${stamp.path}`} alt={stamp.spotName} />
        </div>
        <div className="modal-body">
          <h3>{stamp.spotName} — 候補 {stamp.variant + 1}</h3>
          <p style={{ fontSize: 13, color: '#888' }}>
            エリア: {AREA_LABELS[stamp.area] || stamp.area} / ステータス: {stamp.status}
          </p>

          {/* マップで確認ボタン */}
          {onShowOnMap && stamp.lat && stamp.lng && (
            <button
              onClick={() => { onShowOnMap(stamp.spotId); onClose() }}
              style={{
                marginTop: 8, padding: '6px 12px', background: 'none',
                border: '1px solid var(--accent-blue)', borderRadius: 6,
                color: 'var(--accent-blue)', fontSize: 12, cursor: 'pointer',
              }}
            >
              マップで位置を確認
            </button>
          )}

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
            <button className="action-btn reject" onClick={handleReject}>
              却下{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
            </button>
          </div>

          {/* バリエーション生成 */}
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => setShowVariation(!showVariation)}
              style={{
                padding: '6px 12px', background: 'none',
                border: '1px solid var(--accent)', borderRadius: 6,
                color: 'var(--accent)', fontSize: 12, cursor: 'pointer',
              }}
            >
              {showVariation ? '閉じる' : 'バリエーション生成'}
            </button>

            {showVariation && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                <BatchForm
                  stamps={stamps}
                  setStamps={setStamps}
                  ngReasons={ngReasons}
                  lockedSpot={{
                    spotId: stamp.spotId,
                    spotName: stamp.spotName,
                    area: stamp.area,
                    lat: stamp.lat || 0,
                    lng: stamp.lng || 0,
                  }}
                />
              </div>
            )}
          </div>

          {/* 画像上書きアップロード */}
          <div style={{ marginTop: 12 }}>
            <label
              style={{
                display: 'inline-block', padding: '6px 12px',
                border: '1px dashed var(--border)', borderRadius: 6,
                color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              画像を差し替え...
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { alert('5MB以下の画像を選択してください'); return }
                  const reader = new FileReader()
                  reader.onload = () => {
                    updateStamp(stamp.id, { dataUrl: reader.result, path: null })
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
            </label>
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
