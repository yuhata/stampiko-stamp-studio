import { useState, useEffect } from 'react'
import { publishStamp, importPOIsToFirestore, getFirestoreStats } from '../config/firebase'

/**
 * Firebase連携タブ
 * stamp-studioからFirestoreへの直接反映
 */
export default function FirebaseSync({ stamps }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [publishResults, setPublishResults] = useState([])
  const [selectedPOIFile, setSelectedPOIFile] = useState(null)
  const [poiData, setPOIData] = useState(null)

  // Firestoreの現在の状態を取得
  const loadStats = async () => {
    setLoading(true)
    try {
      const s = await getFirestoreStats()
      setStats(s)
    } catch (err) {
      console.error('Stats load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStats() }, [])

  // 承認済みスタンプをFirestoreに公開
  const handlePublishApproved = async () => {
    const approved = stamps.filter(s => s.status === 'approved')
    if (approved.length === 0) {
      alert('承認済みスタンプがありません。ギャラリーでスタンプを承認してください。')
      return
    }

    if (!confirm(`${approved.length}件の承認済みスタンプをFirestoreに公開しますか？`)) return

    const results = []
    for (const stamp of approved) {
      try {
        const stampId = await publishStamp({
          id: `stamp_${stamp.spotId}_${stamp.variant}`,
          spotName: stamp.spotName,
          name: stamp.spotName,
          groupId: `group_${stamp.area}`,
          imageUrl: stamp.path ? `${window.location.origin}${import.meta.env.BASE_URL}${stamp.path}` : '',
          rarity: 'common',
        })
        results.push({ stamp, stampId, success: true })
      } catch (err) {
        results.push({ stamp, error: err.message, success: false })
      }
    }

    setPublishResults(results)
    loadStats()
  }

  // POI JSONファイルの読み込み
  const handlePOIFileLoad = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedPOIFile(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        setPOIData(Array.isArray(data) ? data : [])
      } catch {
        alert('JSONの解析に失敗しました')
      }
    }
    reader.readAsText(file)
  }

  // POIデータをFirestoreにインポート
  const handleImportPOIs = async () => {
    if (!poiData || poiData.length === 0) return
    if (!confirm(`${poiData.length}件のPOIをFirestoreにインポートしますか？`)) return

    setImporting(true)
    setImportProgress({ imported: 0, skipped: 0, total: poiData.length })

    try {
      const result = await importPOIsToFirestore(poiData, {
        onProgress: setImportProgress,
      })
      setImportProgress({ ...result, total: poiData.length, done: true })
      loadStats()
    } catch (err) {
      alert(`インポートエラー: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  // POIデータのカテゴリ別集計
  const poiSummary = poiData ? poiData.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1
    return acc
  }, {}) : null

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Firestore ステータス */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', color: '#fff', margin: 0 }}>Firestore ステータス</h3>
          <button onClick={loadStats} className="filter-btn" disabled={loading}>
            {loading ? '読込中...' : '更新'}
          </button>
        </div>

        {stats ? (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { label: '総スポット', value: stats.totalSpots, color: 'var(--accent)' },
              { label: 'ランドマーク', value: stats.landmarks, color: '#4CAF50' },
              { label: 'データスポット', value: stats.dataSpots, color: '#42A5F5' },
              { label: 'スタンプ', value: stats.stamps, color: '#AB47BC' },
              { label: 'ユーザー', value: stats.users, color: '#FF6B35' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: '8px', padding: '12px 16px', minWidth: '100px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color }}>{(value ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>読み込み中...</p>
        )}
      </div>

      {/* スタンプ公開 */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', color: '#fff', margin: '0 0 8px' }}>スタンプ公開</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          ギャラリーで「承認」したスタンプをFirestoreのstampsコレクションに公開します。
          公開後、Stampikoアプリで使用可能になります。
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handlePublishApproved}
            className="generate-btn"
            style={{ width: 'auto', padding: '10px 24px' }}
          >
            承認済みスタンプを公開 ({stamps.filter(s => s.status === 'approved').length}件)
          </button>
        </div>

        {publishResults.length > 0 && (
          <div style={{ marginTop: '12px', fontSize: '12px' }}>
            {publishResults.map((r, i) => (
              <div key={i} style={{ color: r.success ? '#4CAF50' : '#EF5350', marginBottom: '4px' }}>
                {r.success ? '✅' : '❌'} {r.stamp.spotName} — {r.success ? r.stampId : r.error}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* POIインポート */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '16px', color: '#fff', margin: '0 0 8px' }}>POIインポート</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          POI JSONファイルをFirestoreのspotsコレクションにインポートします。
          都道府県別ファイル（public/poi/*.json）を使用できます。
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="filter-btn" style={{ cursor: 'pointer' }}>
            JSONファイルを選択
            <input type="file" accept=".json" onChange={handlePOIFileLoad} style={{ display: 'none' }} />
          </label>
          {selectedPOIFile && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {selectedPOIFile}
            </span>
          )}
        </div>

        {poiSummary && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {Object.entries(poiSummary).map(([cat, count]) => (
                <span key={cat} className="filter-btn" style={{ fontSize: '11px' }}>
                  {cat}: {count}
                </span>
              ))}
              <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
                合計: {poiData.length}件
              </span>
            </div>

            <button
              onClick={handleImportPOIs}
              disabled={importing}
              className="generate-btn"
              style={{ width: 'auto', padding: '10px 24px' }}
            >
              {importing ? 'インポート中...' : `${poiData.length}件をFirestoreにインポート`}
            </button>
          </div>
        )}

        {importProgress && (
          <div style={{ marginTop: '12px', fontSize: '12px' }}>
            <div style={{ background: 'var(--bg)', borderRadius: '4px', height: '6px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{
                height: '100%', borderRadius: '4px', background: 'var(--accent)',
                width: `${(importProgress.imported / importProgress.total) * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ color: importProgress.done ? '#4CAF50' : 'var(--text-muted)' }}>
              {importProgress.done ? '✅ ' : ''}
              {importProgress.imported}件インポート / {importProgress.skipped}件スキップ
              {importProgress.done ? ' — 完了' : ` / ${importProgress.total}件中`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
