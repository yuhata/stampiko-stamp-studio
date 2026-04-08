import { useState } from 'react'

const CATEGORY_LABELS = {
  content: 'コンテンツ',
  composition: '構図',
  texture: 'テクスチャ',
  color: 'カラー',
  recognition: '認識性',
  background: '背景',
  style: 'スタイル',
  other: 'その他',
}

const CATEGORY_COLORS = {
  content: '#ef5350',
  composition: '#ff6b35',
  texture: '#ffca28',
  color: '#ab47bc',
  recognition: '#42a5f5',
  background: '#78909c',
  style: '#66bb6a',
  other: '#888899',
}

// NG理由 → プロンプト追加ルールのマッピング
const NG_TO_PROMPT_RULES = {
  'テキスト混入': 'CRITICAL: Absolutely NO text, letters, kanji, kana, numbers, dates, or labels ANYWHERE in the image.',
  '構図が偏っている': 'Center the main subject. Ensure balanced composition with breathing space on all sides.',
  '色が規格外': 'Use ONLY the specified palette colors. Do NOT introduce any colors outside the palette.',
  '透過品質が悪い': 'The area OUTSIDE the stamp circle must be PURE WHITE (#FFFFFF) with zero texture or grain.',
  'インクテクスチャ不足': 'Add visible rubber-stamp ink texture: slight unevenness, gentle ink bleed at edges, subtle pressure variation.',
  'デジタル感が強い': 'Avoid clean digital look. Emulate traditional woodblock/rubber stamp printing with organic imperfections.',
  'ランドマーク不明瞭': 'The landmark must be clearly recognizable as a distinct silhouette. Avoid abstract or generic shapes.',
  '詰め込みすぎ': 'Keep the design simple. Maximum 3 visual elements inside the stamp circle. Wide spacing between elements.',
  '写実的すぎる': 'Use FLAT graphic shapes only. NO gradients, NO 3D effects, NO photorealism, NO shading.',
}

export default function NGLog({ ngReasons, setNgReasons, stamps }) {
  const [filterCategory, setFilterCategory] = useState('all')

  // カテゴリ別集計
  const categoryCounts = {}
  ngReasons.forEach(r => {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1
  })

  // 理由別集計（頻度順）
  const reasonCounts = {}
  ngReasons.forEach(r => {
    reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1
  })
  const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])

  // フィルタ適用
  const filtered = filterCategory === 'all'
    ? ngReasons
    : ngReasons.filter(r => r.category === filterCategory)

  // プロンプト改善提案の生成
  const promptSuggestions = sortedReasons
    .filter(([, count]) => count >= 2)
    .map(([reason]) => {
      const sample = ngReasons.find(r => r.reason === reason)
      return { reason, count: reasonCounts[reason], promptHint: sample?.promptHint || '' }
    })

  const [applied, setApplied] = useState(false)

  // NGログからプロンプトを自動改善
  const handleLearnAndApply = () => {
    const currentPrompt = localStorage.getItem('lbs-stamp-studio-prompt') || ''

    // 2回以上出現したNG理由に対応するルールを収集
    const rulesToAdd = []
    sortedReasons.forEach(([reason, count]) => {
      if (count < 2) return
      // NG_TO_PROMPT_RULESから一致するルールを探す
      for (const [ngKey, rule] of Object.entries(NG_TO_PROMPT_RULES)) {
        if (reason.includes(ngKey) || ngKey.includes(reason)) {
          if (!currentPrompt.includes(rule)) {
            rulesToAdd.push(rule)
          }
        }
      }
      // promptHintがある場合も追加
      const sample = ngReasons.find(r => r.reason === reason)
      if (sample?.promptHint && !currentPrompt.includes(sample.promptHint)) {
        rulesToAdd.push(sample.promptHint)
      }
    })

    if (rulesToAdd.length === 0) {
      alert('追加できるルールがありません（既に適用済み、または対応するルールがありません）')
      return
    }

    // プロンプトの末尾にルールブロックを追加
    const rulesBlock = `\n\n=== LEARNED RULES (from NG log) ===\n${rulesToAdd.map(r => `- ${r}`).join('\n')}`
    const newPrompt = currentPrompt + rulesBlock
    localStorage.setItem('lbs-stamp-studio-prompt', newPrompt)

    setApplied(true)
    setTimeout(() => setApplied(false), 3000)
    alert(`✅ ${rulesToAdd.length}件のルールをプロンプトに追加しました。\nバッチ生成タブで確認できます。`)
  }

  const handleClearLog = () => {
    if (confirm('NG学習ログを全てクリアしますか？')) {
      setNgReasons([])
      localStorage.removeItem('lbs-stamp-studio-ng-log')
    }
  }

  const handleExport = () => {
    const data = JSON.stringify(ngReasons, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ng-log-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ng-log">
      {/* サマリーカード */}
      <div className="ng-summary">
        <div className="ng-summary-card" data-highlight>
          <div className="ng-summary-number">{ngReasons.length}</div>
          <div className="ng-summary-label">NG記録 合計</div>
        </div>
        {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
          <div
            key={cat}
            className={`ng-summary-card ${filterCategory === cat ? 'active' : ''}`}
            onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
            style={{ cursor: 'pointer', borderColor: CATEGORY_COLORS[cat] }}
          >
            <div className="ng-summary-number" style={{ color: CATEGORY_COLORS[cat] }}>{count}</div>
            <div className="ng-summary-label">{CATEGORY_LABELS[cat] || cat}</div>
          </div>
        ))}
      </div>

      {/* プロンプト改善提案 + 自動学習ボタン */}
      {promptSuggestions.length > 0 && (
        <div className="ng-prompt-suggestions">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>プロンプト改善提案</h3>
            <button
              onClick={handleLearnAndApply}
              style={{
                background: applied ? '#4caf50' : 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {applied ? '✅ 適用済み' : '🧠 学習してプロンプトを改善'}
            </button>
          </div>
          <p className="ng-prompt-desc">2回以上発生しているNG理由に基づく改善ヒント:</p>
          {promptSuggestions.map(({ reason, count, promptHint }) => (
            <div key={reason} className="ng-suggestion-row">
              <div className="ng-suggestion-reason">
                <span className="ng-suggestion-count">{count}回</span>
                {reason}
              </div>
              {promptHint && (
                <div className="ng-suggestion-hint">→ {promptHint}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* NG理由ランキング */}
      {sortedReasons.length > 0 && (
        <div className="ng-ranking">
          <h3>NG理由ランキング</h3>
          {sortedReasons.map(([reason, count]) => {
            const maxCount = sortedReasons[0][1]
            const sample = ngReasons.find(r => r.reason === reason)
            return (
              <div key={reason} className="ng-rank-row">
                <div className="ng-rank-bar-wrapper">
                  <div
                    className="ng-rank-bar"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      background: CATEGORY_COLORS[sample?.category] || '#888',
                    }}
                  />
                </div>
                <span className="ng-rank-label">{reason}</span>
                <span className="ng-rank-count">{count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ログ一覧 */}
      <div className="ng-log-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3>NG記録一覧 {filterCategory !== 'all' && `(${CATEGORY_LABELS[filterCategory]})`}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="filter-btn" onClick={handleExport}>エクスポート</button>
            <button className="filter-btn" style={{ color: 'var(--accent-red)' }} onClick={handleClearLog}>クリア</button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>NG記録がありません</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>ギャラリーでスタンプを却下/要修正すると、NG理由がここに蓄積されます</p>
          </div>
        ) : (
          filtered.slice().reverse().map((r, i) => (
            <div key={r.id || i} className="ng-log-entry">
              <div className="ng-log-entry-header">
                <span
                  className="ng-category-tag"
                  style={{ background: CATEGORY_COLORS[r.category] }}
                >
                  {CATEGORY_LABELS[r.category] || r.category}
                </span>
                <span className="ng-log-reason">{r.reason}</span>
                <span className="ng-log-spot">{r.spotName} ({r.area})</span>
                <span className="ng-log-date">
                  {new Date(r.createdAt).toLocaleDateString('ja-JP')}
                </span>
              </div>
              {r.customNote && (
                <div className="ng-log-note">{r.customNote}</div>
              )}
              {r.promptHint && (
                <div className="ng-log-hint">改善ヒント: {r.promptHint}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
