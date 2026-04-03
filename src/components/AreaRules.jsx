import { useState, useEffect } from 'react'

const AREA_CONFIG = {
  asakusa: {
    label: '浅草エリア',
    palette: ['#C0392B', '#8B4513', '#B71C1C'],
    style: '円形・昭和レトロ',
    description: '伝統的な赤系パレット。下町の温かみを表現。',
  },
  shibuya: {
    label: '渋谷エリア',
    palette: ['#6A1B9A', '#1A237E', '#E65100'],
    style: '円形・モダン',
    description: '紫〜青系のアーバンパレット。若者文化の活気を反映。',
  },
  shinjuku: {
    label: '新宿エリア',
    palette: ['#BF360C', '#F57F17', '#212121'],
    style: '円形・ダイナミック',
    description: '橙〜黒のコントラスト。エネルギッシュな街を表現。',
  },
}

const DEFAULT_CRITERIA = [
  { id: 1, criteria: 'ランドマーク認識性', ok: '一目でわかる', ng: '抽象的すぎる' },
  { id: 2, criteria: 'インクテクスチャ', ok: '適度なかすれ・にじみ', ng: 'デジタル感が強い' },
  { id: 3, criteria: 'パレット統一', ok: 'エリアルールに準拠', ng: '指定外の色が目立つ' },
  { id: 4, criteria: '構図バランス', ok: '余白あり・見やすい', ng: '詰め込み/偏り' },
  { id: 5, criteria: 'テキスト混入', ok: '文字なし', ng: '文字あり' },
  { id: 6, criteria: '透過品質', ok: 'きれいに透過', ng: 'ジャギー/白残り' },
  { id: 7, criteria: 'コレクション映え', ok: '並べて美しい', ng: '1個だけ浮く' },
]

const STORAGE_KEY = 'lbs-stamp-studio-criteria'

export default function AreaRules({ stamps, areas }) {
  const [criteriaList, setCriteriaList] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_CRITERIA
  })
  const [editingId, setEditingId] = useState(null)
  const [newRow, setNewRow] = useState({ criteria: '', ok: '', ng: '' })
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(criteriaList))
  }, [criteriaList])

  const updateCriteria = (id, field, value) => {
    setCriteriaList(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const deleteCriteria = (id) => {
    setCriteriaList(prev => prev.filter(c => c.id !== id))
    setEditingId(null)
  }

  const addCriteria = () => {
    if (!newRow.criteria.trim()) return
    setCriteriaList(prev => [...prev, { ...newRow, id: Date.now() }])
    setNewRow({ criteria: '', ok: '', ng: '' })
    setShowAdd(false)
  }

  const resetToDefault = () => {
    if (confirm('デフォルトの品質基準に戻しますか？追加した項目は削除されます。')) {
      setCriteriaList(DEFAULT_CRITERIA)
    }
  }

  return (
    <div className="area-rules">
      {areas.map(area => {
        const config = AREA_CONFIG[area] || { label: area, palette: [], style: '-', description: '' }
        const areaStamps = stamps.filter(s => s.area === area)
        const approved = areaStamps.filter(s => s.status === 'approved')

        return (
          <div key={area} className="area-section">
            <h2>{config.label}</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>{config.description}</p>

            <div className="area-palette">
              <span className="label">パレット:</span>
              {config.palette.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="color-swatch" style={{
                    background: c, width: 24, height: 24, borderRadius: 4
                  }} />
                  <span style={{ fontSize: 11, color: '#888' }}>{c}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, color: '#bbb', marginBottom: 12 }}>
              スタイル: <strong>{config.style}</strong>
              {' / '}
              候補: {areaStamps.length}件
              {' / '}
              承認済み: <span style={{ color: '#4caf50' }}>{approved.length}件</span>
            </div>

            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              {approved.length > 0 ? '承認済みスタンプ:' : '全候補:'}
            </div>
            <div className="area-stamps-preview">
              {(approved.length > 0 ? approved : areaStamps).map(s => (
                <div
                  key={s.id}
                  className={`mini-stamp ${s.status === 'approved' ? 'approved' : ''}`}
                  title={`${s.spotName} — 候補${s.variant + 1} (${s.status})`}
                >
                  <img src={`${import.meta.env.BASE_URL}${s.path}`} alt={s.spotName} />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* 品質基準チェックリスト */}
      <div className="area-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#888' }}>品質基準チェックリスト</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="filter-btn" onClick={() => setShowAdd(true)}>+ 基準を追加</button>
            <button className="filter-btn" style={{ color: 'var(--text-muted)' }} onClick={resetToDefault}>デフォルトに戻す</button>
          </div>
        </div>

        <table className="criteria-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>基準</th>
              <th style={{ width: '30%', color: '#4caf50' }}>OK</th>
              <th style={{ width: '30%', color: '#ef5350' }}>NG</th>
              <th style={{ width: '10%' }}></th>
            </tr>
          </thead>
          <tbody>
            {criteriaList.map(c => (
              <tr key={c.id}>
                {editingId === c.id ? (
                  <>
                    <td>
                      <input
                        className="criteria-input"
                        value={c.criteria}
                        onChange={e => updateCriteria(c.id, 'criteria', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="criteria-input ok"
                        value={c.ok}
                        onChange={e => updateCriteria(c.id, 'ok', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="criteria-input ng"
                        value={c.ng}
                        onChange={e => updateCriteria(c.id, 'ng', e.target.value)}
                      />
                    </td>
                    <td className="criteria-actions">
                      <button className="criteria-btn save" onClick={() => setEditingId(null)}>保存</button>
                      <button className="criteria-btn delete" onClick={() => deleteCriteria(c.id)}>削除</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ color: '#ddd' }}>{c.criteria}</td>
                    <td style={{ color: '#666' }}>{c.ok}</td>
                    <td style={{ color: '#666' }}>{c.ng}</td>
                    <td className="criteria-actions">
                      <button className="criteria-btn edit" onClick={() => setEditingId(c.id)}>編集</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 新規追加フォーム */}
        {showAdd && (
          <div className="criteria-add-form">
            <div className="criteria-add-row">
              <input
                className="criteria-input"
                placeholder="基準名"
                value={newRow.criteria}
                onChange={e => setNewRow(prev => ({ ...prev, criteria: e.target.value }))}
              />
              <input
                className="criteria-input ok"
                placeholder="OK条件"
                value={newRow.ok}
                onChange={e => setNewRow(prev => ({ ...prev, ok: e.target.value }))}
              />
              <input
                className="criteria-input ng"
                placeholder="NG条件"
                value={newRow.ng}
                onChange={e => setNewRow(prev => ({ ...prev, ng: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="criteria-btn save" onClick={addCriteria}>追加</button>
              <button className="criteria-btn" onClick={() => { setShowAdd(false); setNewRow({ criteria: '', ok: '', ng: '' }) }}>キャンセル</button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          基準はlocalStorageに保存されます。「編集」で既存項目を変更、「+ 基準を追加」で新しい項目を追加できます。
        </p>
      </div>
    </div>
  )
}
