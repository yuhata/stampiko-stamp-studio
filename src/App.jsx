import { useState, useEffect } from 'react'
import StampGallery from './components/StampGallery'
import MapView from './components/MapView'
import BatchForm from './components/BatchForm'
import AreaRules from './components/AreaRules'
import NGLog from './components/NGLog'
import UGCQueue from './components/UGCQueue'
import AdminPanel from './components/AdminPanel'
import TemplateManager from './components/TemplateManager'
import { subscribeStamps, upsertStamp } from './config/studioStamps'
import { pullSettingsFromFirestore, loadNgReasons, saveNgReasons } from './config/studioStorage'
import './App.css'

const TABS = [
  { id: 'batch', label: 'バッチ生成' },
  { id: 'gallery', label: 'ギャラリー' },
  { id: 'templates', label: 'テンプレート' },
  { id: 'map', label: 'マップ' },
  { id: 'rules', label: 'エリアルール' },
  { id: 'nglog', label: 'NG学習ログ' },
  { id: 'ugc', label: 'UGC承認' },
]

function App() {
  const [stamps, setStamps] = useState([])
  const [ngReasons, setNgReasons] = useState([])
  const [stampsReady, setStampsReady] = useState(false)
  const [activeTab, setActiveTab] = useState('batch')
  const [filterArea, setFilterArea] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [focusSpotId, setFocusSpotId] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)

  // onSnapshot で studio_stamps を購読（リアルタイム同期）
  useEffect(() => {
    let initialized = false
    pullSettingsFromFirestore() // areaConfig / criteria 等を localStorage に同期（本体stampsとは別系統）
    const unsub = subscribeStamps((docs) => {
      setStamps(docs)
      if (!initialized) {
        initialized = true
        setStampsReady(true)
      }
    })
    const savedNg = loadNgReasons()
    if (savedNg.length > 0) setNgReasons(savedNg)
    return () => unsub()
  }, [])

  // NG記録の永続化（フル配列方式だが件数少・別系統として残す）
  useEffect(() => {
    if (!stampsReady) return
    saveNgReasons(ngReasons)
  }, [ngReasons, stampsReady])

  // スタンプ更新: onSnapshot が再反映するので setStamps は不要（楽観更新なし）
  const updateStamp = async (id, updates) => {
    // 楽観更新: UIの即時反応のためローカルstateも更新（onSnapshotで再確定される）
    setStamps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    const persistKeys = [
      'status', 'designerNote', 'ngTags',
      'lat', 'lng', 'spotName', 'area', 'spotId',
    ]
    const persistable = Object.fromEntries(
      Object.entries(updates).filter(([k]) => persistKeys.includes(k))
    )
    if (Object.keys(persistable).length > 0) {
      try { await upsertStamp(id, persistable) }
      catch (err) { console.warn('[App] upsertStamp failed:', err.message) }
    }
  }

  const addNgReason = (reason) => {
    setNgReasons(prev => [...prev, { ...reason, id: Date.now(), createdAt: new Date().toISOString() }])
  }

  const handleSelectSpot = (spotId) => {
    setFocusSpotId(spotId)
    const spot = stamps.find(s => s.spotId === spotId)
    if (spot) setFilterArea(spot.area)
    setFilterStatus('all')
    setActiveTab('gallery')
  }

  const areas = [...new Set(stamps.map(s => s.area))]
  const stats = {
    total: stamps.length,
    approved: stamps.filter(s => s.status === 'approved').length,
    rejected: stamps.filter(s => s.status === 'rejected').length,
    draft: stamps.filter(s => s.status === 'draft').length,
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>LBS Stamp Studio</h1>
          <span className="subtitle">スタンプデザイン品質管理ツール</span>
        </div>
        <div className="header-stats">
          <span className="stat" data-type="total">{stats.total} 件</span>
          <span className="stat" data-type="approved">{stats.approved} 承認</span>
          <span className="stat" data-type="rejected">{stats.rejected} 却下</span>
          <span className="stat" data-type="draft">{stats.draft} 未レビュー</span>
          <button
            onClick={() => setShowAdmin(true)}
            style={{
              background: 'none', border: '1px solid #555', borderRadius: 6,
              color: '#888', padding: '4px 10px', fontSize: 14, cursor: 'pointer',
              marginLeft: 8,
            }}
            title="管理者設定"
          >
            ⚙️
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'nglog' && ngReasons.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-red)' }}>
                ({ngReasons.length})
              </span>
            )}
          </button>
        ))}
      </nav>

      {activeTab === 'map' && (
        <MapView stamps={stamps} updateStamp={updateStamp} setStamps={setStamps} onSelectSpot={handleSelectSpot}
          focusSpotId={focusSpotId} clearFocusSpot={() => setFocusSpotId(null)} />
      )}
      {activeTab === 'gallery' && (
        <StampGallery
          stamps={stamps} setStamps={setStamps} areas={areas}
          filterArea={filterArea} setFilterArea={setFilterArea}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          updateStamp={updateStamp} addNgReason={addNgReason} ngReasons={ngReasons}
          focusSpotId={focusSpotId} clearFocusSpot={() => setFocusSpotId(null)}
          onShowOnMap={(spotId) => {
            setFocusSpotId(spotId)
            setActiveTab('map')
          }}
        />
      )}
      {activeTab === 'batch' && (
        <BatchForm stamps={stamps} setStamps={setStamps} ngReasons={ngReasons} />
      )}
      {activeTab === 'nglog' && (
        <NGLog ngReasons={ngReasons} setNgReasons={setNgReasons} stamps={stamps} />
      )}
      {activeTab === 'rules' && (
        <AreaRules stamps={stamps} areas={areas} />
      )}
      {activeTab === 'ugc' && (
        <UGCQueue />
      )}
      {activeTab === 'templates' && (
        <TemplateManager />
      )}

      {/* 管理者パネル（モーダル） */}
      {showAdmin && (
        <AdminPanel stamps={stamps} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  )
}

export default App
