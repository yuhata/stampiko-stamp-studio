import { useState, useEffect } from 'react'

const DEFAULT_AREAS = {
  asakusa: {
    label: '浅草エリア',
    palette: ['#9E3D3F', '#C8766B', '#2B618F'],
    style: '円形・昭和レトロ',
    description: '伝統的な赤系パレット。下町の温かみを表現。',
  },
  shibuya: {
    label: '渋谷エリア',
    palette: ['#745399', '#2B4B6F', '#FF6B35'],
    style: '円形・モダン',
    description: '紫〜青系のアーバンパレット。若者文化の活気を反映。',
  },
  shinjuku: {
    label: '新宿エリア',
    palette: ['#B4866B', '#6C6A6C', '#5B8930'],
    style: '円形・ダイナミック',
    description: '茶〜緑のコントラスト。エネルギッシュな街を表現。',
  },
  akihabara: {
    label: '秋葉原エリア',
    palette: ['#2B618F', '#FF6B35', '#E0E0E0'],
    style: '円形・エレクトリック',
    description: '青×オレンジの電気街カラー。サブカルチャーの聖地。',
  },
  ueno: {
    label: '上野エリア',
    palette: ['#5B8930', '#8F8667', '#9E3D3F'],
    style: '円形・自然×文化',
    description: '緑と茶の自然色。公園と美術館の文化エリア。',
  },
  harajuku: {
    label: '原宿エリア',
    palette: ['#E87BA1', '#A8D8EA', '#FFD700'],
    style: '円形・ポップ',
    description: 'パステルピンク×水色。カワイイ文化の発信地。',
  },
  roppongi: {
    label: '六本木エリア',
    palette: ['#1A1A2E', '#C0A36E', '#745399'],
    style: '円形・ラグジュアリー',
    description: '黒×金×紫の夜景カラー。アートと夜の街。',
  },
  ginza: {
    label: '銀座エリア',
    palette: ['#C0A36E', '#2A2A40', '#8F8667'],
    style: '円形・エレガント',
    description: '金×ダークグレー。銀座の品格と老舗の重厚感。',
  },
  nihonbashi: {
    label: '日本橋エリア',
    palette: ['#6C6A6C', '#9E3D3F', '#2B618F'],
    style: '円形・江戸モダン',
    description: '鈍色×蘇芳。五街道の起点、江戸の商業中心地。',
  },
  tsukiji: {
    label: '築地エリア',
    palette: ['#2B618F', '#B4866B', '#769164'],
    style: '円形・市場風',
    description: '海の青×茶。築地の活気と食文化。',
  },
  ikebukuro: {
    label: '池袋エリア',
    palette: ['#FF6B35', '#2B4B6F', '#6C6A6C'],
    style: '円形・都会ミックス',
    description: 'オレンジ×紺。東西の顔を持つターミナル。',
  },
  ryogoku: {
    label: '両国エリア',
    palette: ['#9E3D3F', '#6C6A6C', '#8F8667'],
    style: '円形・力強い',
    description: '蘇芳×鈍色。相撲と江戸文化の聖地。',
  },
  skytree: {
    label: '東京スカイツリー周辺',
    palette: ['#2B4B6F', '#A8D8EA', '#E0E0E0'],
    style: '円形・スカイライン',
    description: '紺×水色×白。空に向かう塔と下町の融合。',
  },
  tokyotower: {
    label: '東京タワー周辺',
    palette: ['#FF6B35', '#9E3D3F', '#FFD700'],
    style: '円形・トワイライト',
    description: 'オレンジ×赤×金。東京のシンボル、夕焼けの塔。',
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

const AREAS_KEY = 'lbs-stamp-studio-areas'
const CRITERIA_KEY = 'lbs-stamp-studio-criteria'

/**
 * エリアルールタブ — デザイナー向け
 * パレット・スタイルの編集 + 品質基準チェックリスト
 * エリアの追加/削除は管理者パネル（⚙️）から
 */
export default function AreaRules({ stamps, areas }) {
  const [areaConfig, setAreaConfig] = useState(() => {
    const saved = localStorage.getItem(AREAS_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_AREAS
  })
  const [criteriaList, setCriteriaList] = useState(() => {
    const saved = localStorage.getItem(CRITERIA_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_CRITERIA
  })
  const [editingArea, setEditingArea] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [newRow, setNewRow] = useState({ criteria: '', ok: '', ng: '' })
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    localStorage.setItem(AREAS_KEY, JSON.stringify(areaConfig))
  }, [areaConfig])

  useEffect(() => {
    localStorage.setItem(CRITERIA_KEY, JSON.stringify(criteriaList))
  }, [criteriaList])

  const updateAreaField = (areaKey, field, value) => {
    setAreaConfig(prev => ({
      ...prev,
      [areaKey]: { ...prev[areaKey], [field]: value },
    }))
  }

  const updateAreaPalette = (areaKey, paletteStr) => {
    const colors = paletteStr.split(',').map(c => c.trim()).filter(Boolean)
    updateAreaField(areaKey, 'palette', colors)
  }

  // 品質基準
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
    if (confirm('デフォルトの品質基準に戻しますか？')) setCriteriaList(DEFAULT_CRITERIA)
  }

  const allAreaKeys = [...new Set([...Object.keys(areaConfig), ...areas])]

  return (
    <div className="area-rules">
      {/* エリア一覧（編集可、追加/削除は⚙️管理者設定から） */}
      {allAreaKeys.map(area => {
        const config = areaConfig[area] || { label: area, palette: [], style: '-', description: '' }
        const areaStamps = stamps.filter(s => s.area === area)
        const approved = areaStamps.filter(s => s.status === 'approved')
        const isEditing = editingArea === area

        return (
          <div key={area} className="area-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{config.label}</h2>
              <button className="criteria-btn edit" onClick={() => setEditingArea(isEditing ? null : area)}>
                {isEditing ? '完了' : '編集'}
              </button>
            </div>

            {isEditing ? (
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>パレット（カンマ区切り）</label>
                  <input className="criteria-input" value={config.palette.join(', ')}
                    onChange={e => updateAreaPalette(area, e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>スタイル</label>
                  <input className="criteria-input" value={config.style}
                    onChange={e => updateAreaField(area, 'style', e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>説明</label>
                  <input className="criteria-input" value={config.description}
                    onChange={e => updateAreaField(area, 'description', e.target.value)} />
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>{config.description}</p>
            )}

            <div className="area-palette">
              <span className="label">パレット:</span>
              {config.palette.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="color-swatch" style={{ background: c, width: 24, height: 24, borderRadius: 4 }} />
                  <span style={{ fontSize: 11, color: '#888' }}>{c}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, color: '#bbb', marginBottom: 12 }}>
              スタイル: <strong>{config.style}</strong>
              {' / '}候補: {areaStamps.length}件
              {' / '}承認済み: <span style={{ color: '#4caf50' }}>{approved.length}件</span>
            </div>

            {(approved.length > 0 || areaStamps.length > 0) && (
              <>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                  {approved.length > 0 ? '承認済みスタンプ:' : '全候補:'}
                </div>
                <div className="area-stamps-preview">
                  {(approved.length > 0 ? approved : areaStamps).map(s => (
                    <div key={s.id} className={`mini-stamp ${s.status === 'approved' ? 'approved' : ''}`}
                      title={`${s.spotName} — 候補${s.variant + 1} (${s.status})`}>
                      <img src={`${import.meta.env.BASE_URL}${s.path}`} alt={s.spotName} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}

      {allAreaKeys.length === 0 && (
        <div className="area-section">
          <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>
            エリアが登録されていません。右上の⚙️からエリアを追加してください。
          </p>
        </div>
      )}

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
                    <td><input className="criteria-input" value={c.criteria} onChange={e => updateCriteria(c.id, 'criteria', e.target.value)} /></td>
                    <td><input className="criteria-input ok" value={c.ok} onChange={e => updateCriteria(c.id, 'ok', e.target.value)} /></td>
                    <td><input className="criteria-input ng" value={c.ng} onChange={e => updateCriteria(c.id, 'ng', e.target.value)} /></td>
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

        {showAdd && (
          <div className="criteria-add-form">
            <div className="criteria-add-row">
              <input className="criteria-input" placeholder="基準名" value={newRow.criteria}
                onChange={e => setNewRow(prev => ({ ...prev, criteria: e.target.value }))} />
              <input className="criteria-input ok" placeholder="OK条件" value={newRow.ok}
                onChange={e => setNewRow(prev => ({ ...prev, ok: e.target.value }))} />
              <input className="criteria-input ng" placeholder="NG条件" value={newRow.ng}
                onChange={e => setNewRow(prev => ({ ...prev, ng: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="criteria-btn save" onClick={addCriteria}>追加</button>
              <button className="criteria-btn" onClick={() => { setShowAdd(false); setNewRow({ criteria: '', ok: '', ng: '' }) }}>キャンセル</button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
          エリアの追加/削除は右上の⚙️管理者設定から行えます。パレット・スタイルの編集はここから可能です。
        </p>
      </div>
    </div>
  )
}
