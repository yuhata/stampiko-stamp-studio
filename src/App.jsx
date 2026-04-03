import { useState, useEffect } from 'react'
import StampGallery from './components/StampGallery'
import MapView from './components/MapView'
import BatchForm from './components/BatchForm'
import AreaRules from './components/AreaRules'
import NGLog from './components/NGLog'
import './App.css'

const TABS = [
  { id: 'map', label: 'マップ' },
  { id: 'gallery', label: 'ギャラリー' },
  { id: 'batch', label: 'バッチ生成' },
  { id: 'nglog', label: 'NG学習ログ' },
  { id: 'rules', label: 'エリアルール' },
]

function App() {
  const [stamps, setStamps] = useState([])
  const [ngReasons, setNgReasons] = useState([])
  const [activeTab, setActiveTab] = useState('map')
  const [filterArea, setFilterArea] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [focusSpotId, setFocusSpotId] = useState(null)

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'stamps/manifest.json')
      .then(r => r.json())
      .then(setStamps)
      .catch(() => setStamps([]))

    const saved = localStorage.getItem('lbs-stamp-studio-ng-log')
    if (saved) setNgReasons(JSON.parse(saved))
  }, [])

  useEffect(() => {
    if (ngReasons.length > 0) {
      localStorage.setItem('lbs-stamp-studio-ng-log', JSON.stringify(ngReasons))
    }
  }, [ngReasons])

  const updateStamp = (id, updates) => {
    setStamps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const addNgReason = (reason) => {
    setNgReasons(prev => [...prev, { ...reason, id: Date.now(), createdAt: new Date().toISOString() }])
  }

  // マップからスポットを選択 → ギャラリーにジャンプ
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
    needsEdit: stamps.filter(s => s.status === 'needs_edit').length,
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
          <span className="stat" data-type="needs_edit">{stats.needsEdit} 要修正</span>
          <span className="stat" data-type="draft">{stats.draft} 未レビュー</span>
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
        <MapView
          stamps={stamps}
          updateStamp={updateStamp}
          onSelectSpot={handleSelectSpot}
        />
      )}
      {activeTab === 'gallery' && (
        <StampGallery
          stamps={stamps}
          areas={areas}
          filterArea={filterArea}
          setFilterArea={setFilterArea}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          updateStamp={updateStamp}
          addNgReason={addNgReason}
          ngReasons={ngReasons}
          focusSpotId={focusSpotId}
          clearFocusSpot={() => setFocusSpotId(null)}
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
    </div>
  )
}

export default App
