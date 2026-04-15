import { useState, useEffect, useRef } from 'react'
import StampGallery from './components/StampGallery'
import MapView from './components/MapView'
import BatchForm from './components/BatchForm'
import AreaRules from './components/AreaRules'
import NGLog from './components/NGLog'
import UGCQueue from './components/UGCQueue'
import AdminPanel from './components/AdminPanel'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db, authReady } from './config/firebase'
import {
  pullSettingsFromFirestore, loadStampOverrides, saveStampOverride,
  loadCustomStamps, saveCustomStamps, loadNgReasons, saveNgReasons,
} from './config/studioStorage'
import './App.css'

const TABS = [
  { id: 'batch', label: 'バッチ生成' },
  { id: 'gallery', label: 'ギャラリー' },
  { id: 'map', label: 'マップ' },
  { id: 'rules', label: 'エリアルール' },
  { id: 'nglog', label: 'NG学習ログ' },
  { id: 'ugc', label: 'UGC承認' },
]

function App() {
  const [stamps, setStamps] = useState([])
  const [ngReasons, setNgReasons] = useState([])
  const [activeTab, setActiveTab] = useState('batch')
  const [filterArea, setFilterArea] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [focusSpotId, setFocusSpotId] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)

  useEffect(() => {
    const loadStamps = async () => {
      // 0. 認証完了を待つ（Firestoreセキュリティルール対応）
      await authReady

      // 0.5. Firestoreから設定（areaConfig/criteria/stampOverrides）をローカルへ復元
      // cache clear 後でも Firestore に保存済みの設定が戻る
      await pullSettingsFromFirestore()

      // 1. manifest.json（既存の静的スタンプ）
      let manifestStamps = []
      try {
        const res = await fetch(import.meta.env.BASE_URL + 'stamps/manifest.json')
        manifestStamps = await res.json()
      } catch {}

      // 2. Firestoreからランドマークスポット（thumbnail_url付き）を取得
      let firestoreStamps = []
      try {
        const snap = await getDocs(query(
          collection(db, 'spots'),
          where('spot_type', '==', 'landmark')
        ))
        firestoreStamps = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .map(s => ({
            id: `fs_${s.id}`,
            spotId: s.id,
            spotName: s.name,
            area: s.group_id || 'unknown',
            lat: s.location?.latitude || 0,
            lng: s.location?.longitude || 0,
            variant: 0,
            path: null,
            dataUrl: s.thumbnail_url ? `${s.thumbnail_url}&bust=${Date.now()}` : null,
            status: s.thumbnail_url ? 'draft' : 'pending',
            designerNote: '',
            ngTags: [],
            source: 'firestore',
          }))
      } catch (err) {
        console.warn('[App] Firestore fetch failed:', err.message)
      }

      // マージ（manifest優先、Firestoreは未登録分のみ追加）
      const manifestSpotIds = new Set(manifestStamps.map(s => s.spotId))
      const newFromFirestore = firestoreStamps.filter(s => !manifestSpotIds.has(s.spotId))
      const merged = [...manifestStamps, ...newFromFirestore]

      // stampOverrides をマージ（差し替え画像/位置/メモ等を復元）
      const overrides = loadStampOverrides()
      const withOverrides = merged.map(s => overrides[s.id] ? { ...s, ...overrides[s.id] } : s)

      // customStamps（バッチ生成・バリエーション生成）を末尾に追加
      const customStamps = loadCustomStamps()
      const existingIds = new Set(withOverrides.map(s => s.id))
      const newCustom = customStamps.filter(s => !existingIds.has(s.id))
      const withCustom = [...withOverrides, ...newCustom]
      setStamps(withCustom)
      // 初期ロード完了後に永続化を有効化
      stampsLoaded.current = true
    }

    loadStamps()

    const savedNg = loadNgReasons()
    if (savedNg.length > 0) setNgReasons(savedNg)
  }, [])

  // 初回ロード前のwriteを避けるためのフラグ
  const ngLoaded = useRef(false)
  useEffect(() => {
    if (!ngLoaded.current) { ngLoaded.current = true; return }
    saveNgReasons(ngReasons)
  }, [ngReasons])

  // customStamps（source: 'custom'）のみ抽出して永続化
  const stampsLoaded = useRef(false)
  useEffect(() => {
    if (!stampsLoaded.current) return
    const custom = stamps.filter(s => s.source === 'custom')
    saveCustomStamps(custom)
  }, [stamps])

  const updateStamp = (id, updates) => {
    setStamps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    // 永続化対象フィールドのみ Firestore + localStorage へ
    const persistKeys = ['dataUrl', 'status', 'designerNote', 'ngTags', 'lat', 'lng']
    const persistable = Object.fromEntries(
      Object.entries(updates).filter(([k]) => persistKeys.includes(k))
    )
    if (Object.keys(persistable).length > 0) {
      saveStampOverride(id, persistable)
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

      {/* 管理者パネル（モーダル） */}
      {showAdmin && (
        <AdminPanel stamps={stamps} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  )
}

export default App
