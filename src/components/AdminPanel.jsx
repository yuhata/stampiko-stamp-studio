import { useState } from 'react'
import FirebaseSync from './FirebaseSync'

const AREAS_KEY = 'lbs-stamp-studio-areas'

/**
 * 管理者パネル — 秦さん専用
 * エリア追加/削除 + Firebase連携
 * 通常タブには表示しない（ヘッダーの⚙️から開く）
 */
export default function AdminPanel({ stamps, onClose }) {
  const [areaConfig, setAreaConfig] = useState(() => {
    const saved = localStorage.getItem(AREAS_KEY)
    return saved ? JSON.parse(saved) : {}
  })
  const [newArea, setNewArea] = useState({ key: '', label: '', palette: '', style: '', description: '' })
  const [activeSection, setActiveSection] = useState('areas')

  const saveAreas = (config) => {
    setAreaConfig(config)
    localStorage.setItem(AREAS_KEY, JSON.stringify(config))
  }

  const handleAddArea = () => {
    const key = newArea.key.trim().toLowerCase().replace(/\s+/g, '_')
    if (!key || !newArea.label.trim()) return
    const colors = newArea.palette.split(',').map(c => c.trim()).filter(Boolean)
    saveAreas({
      ...areaConfig,
      [key]: {
        label: newArea.label.trim(),
        palette: colors.length > 0 ? colors : ['#888888'],
        style: newArea.style.trim() || '円形',
        description: newArea.description.trim(),
      },
    })
    setNewArea({ key: '', label: '', palette: '', style: '', description: '' })
  }

  const handleDeleteArea = (areaKey) => {
    if (!confirm(`「${areaConfig[areaKey]?.label || areaKey}」を削除しますか？`)) return
    const next = { ...areaConfig }
    delete next[areaKey]
    saveAreas(next)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      padding: '40px 20px', overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, maxWidth: 700, width: '100%',
        border: '1px solid var(--border)',
      }} onClick={e => e.stopPropagation()}>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>⚙️ 管理者設定</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* セクション切替 */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'areas', label: '📍 エリア管理' },
            { id: 'firebase', label: '🔥 Firebase連携' },
          ].map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              flex: 1, padding: '10px', background: activeSection === s.id ? 'var(--bg)' : 'transparent',
              border: 'none', borderBottom: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeSection === s.id ? 'var(--accent)' : '#888',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* エリア管理 */}
          {activeSection === 'areas' && (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 14, color: '#ccc' }}>登録済みエリア</h3>

              {Object.keys(areaConfig).length === 0 ? (
                <p style={{ color: '#888', fontSize: 13 }}>エリアがまだ登録されていません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {Object.entries(areaConfig).map(([key, cfg]) => (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
                    }}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {cfg.palette?.map((c, i) => (
                          <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: c }} />
                        ))}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{cfg.label}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{key} · {cfg.style}</div>
                      </div>
                      <button onClick={() => handleDeleteArea(key)} style={{
                        background: 'none', border: '1px solid #ef5350', color: '#ef5350',
                        borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                      }}>削除</button>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ fontSize: 14, color: '#ccc' }}>新規エリア追加</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>エリアID（英字）</label>
                  <input style={inputStyle} placeholder="例: ueno" value={newArea.key}
                    onChange={e => setNewArea(p => ({ ...p, key: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>表示名</label>
                  <input style={inputStyle} placeholder="例: 上野エリア" value={newArea.label}
                    onChange={e => setNewArea(p => ({ ...p, label: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>パレット（カンマ区切り）</label>
                  <input style={inputStyle} placeholder="例: #9E3D3F, #C8766B" value={newArea.palette}
                    onChange={e => setNewArea(p => ({ ...p, palette: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888' }}>スタイル</label>
                  <input style={inputStyle} placeholder="例: 円形・昭和レトロ" value={newArea.style}
                    onChange={e => setNewArea(p => ({ ...p, style: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#888' }}>説明</label>
                <input style={inputStyle} placeholder="エリアの特徴を簡潔に" value={newArea.description}
                  onChange={e => setNewArea(p => ({ ...p, description: e.target.value }))} />
              </div>
              <button onClick={handleAddArea} disabled={!newArea.key.trim() || !newArea.label.trim()} style={{
                background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6,
                padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: (!newArea.key.trim() || !newArea.label.trim()) ? 0.5 : 1,
              }}>追加</button>
            </div>
          )}

          {/* Firebase連携 */}
          {activeSection === 'firebase' && (
            <FirebaseSync stamps={stamps} />
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', background: 'var(--bg)',
  border: '1px solid var(--border)', borderRadius: 6, color: '#ddd',
  fontSize: 13, boxSizing: 'border-box',
}
