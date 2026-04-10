import { useState, useEffect } from 'react'
import { collection, getDocs, query, where, doc, updateDoc, setDoc, serverTimestamp, GeoPoint } from 'firebase/firestore'
import { db } from '../config/firebase'

const REJECT_REASONS = [
  '不適切なコンテンツ',
  '既存スポットと重複',
  '位置情報が不正確',
  '写真の品質が低い',
  'スポットとして不適切',
]

export default function UGCQueue() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selected, setSelected] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectCustom, setRejectCustom] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => { loadSubmissions() }, [filter])

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const q = filter === 'all'
        ? query(collection(db, 'ugc_submissions'))
        : query(collection(db, 'ugc_submissions'), where('status', '==', filter))
      const snap = await getDocs(q)
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0))
      setSubmissions(items)
    } catch (err) {
      console.error('[UGCQueue] Load error:', err)
    }
    setLoading(false)
  }

  const handleApprove = async (submission) => {
    if (processing) return
    setProcessing(true)
    try {
      // 1. ugc_submissions のステータス更新
      await updateDoc(doc(db, 'ugc_submissions', submission.id), {
        status: 'approved',
        reviewed_at: serverTimestamp(),
        reviewed_by: 'studio',
      })

      // 2. spots コレクションに公開用スポットを作成
      const spotId = `ugc_${submission.id}`
      const loc = submission.location
      await setDoc(doc(db, 'spots', spotId), {
        name: submission.spot_name,
        display_name: submission.spot_name,
        group_id: '_ugc',
        location: new GeoPoint(loc.latitude, loc.longitude),
        question: submission.generated_quest || `${submission.spot_name}を見つけて写真を撮ってください`,
        hints: [submission.description || 'ユーザーが発見したスポットです'],
        difficulty: 'easy',
        mission: {
          reference_images: submission.photo_url ? [submission.photo_url] : [],
          required_features: [],
          framing_hint: '',
          similarity_threshold: 0.60,
        },
        spot_type: 'ugc',
        category: 'ugc',
        data_source: 'ugc',
        thumbnail_url: submission.generated_stamp_url || '',
        location_type: 'outdoor',
        nnex_enabled: false,
        ugc_submission_id: submission.id,
        creator_id: submission.submitter_id || '',
      })

      // ローカル状態を更新
      setSubmissions(prev => prev.map(s =>
        s.id === submission.id ? { ...s, status: 'approved' } : s
      ))
      setSelected(null)
    } catch (err) {
      console.error('[UGCQueue] Approve error:', err)
      alert('承認に失敗しました: ' + err.message)
    }
    setProcessing(false)
  }

  const handleReject = async (submission) => {
    if (processing) return
    const reason = rejectReason + (rejectCustom ? ` - ${rejectCustom}` : '')
    if (!reason.trim()) {
      alert('却下理由を選択してください')
      return
    }
    setProcessing(true)
    try {
      await updateDoc(doc(db, 'ugc_submissions', submission.id), {
        status: 'rejected',
        admin_notes: reason,
        reviewed_at: serverTimestamp(),
        reviewed_by: 'studio',
      })
      setSubmissions(prev => prev.map(s =>
        s.id === submission.id ? { ...s, status: 'rejected', admin_notes: reason } : s
      ))
      setSelected(null)
      setRejectReason('')
      setRejectCustom('')
    } catch (err) {
      console.error('[UGCQueue] Reject error:', err)
      alert('却下に失敗しました: ' + err.message)
    }
    setProcessing(false)
  }

  const formatDate = (ts) => {
    if (!ts?.toDate) return '-'
    return ts.toDate().toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const statusLabel = (s) => {
    if (s === 'pending') return '承認待ち'
    if (s === 'approved') return '承認済み'
    if (s === 'rejected') return '却下'
    return s
  }

  const pendingCount = submissions.filter(s => s.status === 'pending').length

  return (
    <div className="ugc-queue">
      {/* フィルタ */}
      <div className="filters">
        <div className="filter-group">
          <label>ステータス:</label>
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' ? `承認待ち${pendingCount > 0 ? ` (${pendingCount})` : ''}` :
               f === 'approved' ? '承認済み' :
               f === 'rejected' ? '却下' : 'すべて'}
            </button>
          ))}
        </div>
        <button
          onClick={loadSubmissions}
          style={{ marginLeft: 'auto', padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 14, background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
        >
          🔄 更新
        </button>
      </div>

      {/* リスト */}
      {loading ? (
        <div className="empty-state"><p>読み込み中...</p></div>
      ) : submissions.length === 0 ? (
        <div className="empty-state"><p>{filter === 'pending' ? '承認待ちの投稿はありません' : '投稿がありません'}</p></div>
      ) : (
        <div className="ugc-grid">
          {submissions.map(sub => (
            <div
              key={sub.id}
              className="ugc-card"
              data-status={sub.status}
              onClick={() => setSelected(sub)}
            >
              <div className="ugc-card-image">
                {sub.photo_url ? (
                  <img src={sub.photo_url} alt={sub.spot_name} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>写真なし</div>
                )}
                <span className="status-badge" data-status={sub.status === 'pending' ? 'draft' : sub.status}>
                  {statusLabel(sub.status)}
                </span>
              </div>
              <div className="ugc-card-info">
                <div className="ugc-card-name">{sub.spot_name || '名称未設定'}</div>
                <div className="ugc-card-meta">
                  {formatDate(sub.created_at)}
                  {sub.location && (
                    <span style={{ marginLeft: 8, color: 'var(--accent-blue)' }}>
                      📍 {sub.location.latitude?.toFixed(4)}, {sub.location.longitude?.toFixed(4)}
                    </span>
                  )}
                </div>
                {sub.description && (
                  <div className="ugc-card-desc">{sub.description}</div>
                )}
              </div>
              {sub.generated_stamp_url && (
                <div className="ugc-card-stamp">
                  <img src={sub.generated_stamp_url} alt="生成スタンプ" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selected && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', gap: 16, padding: 20 }}>
              {/* 写真 */}
              <div style={{ flex: '0 0 200px' }}>
                {selected.photo_url ? (
                  <img src={selected.photo_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 200, background: 'var(--bg)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>写真なし</div>
                )}
                {/* 生成スタンプ */}
                {selected.generated_stamp_url && (
                  <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>AI生成スタンプ</div>
                    <img src={selected.generated_stamp_url} alt="スタンプ" style={{ width: 100, height: 100, objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              {/* 詳細情報 */}
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>{selected.spot_name || '名称未設定'}</h3>
                <span className="status-badge" data-status={selected.status === 'pending' ? 'draft' : selected.status} style={{ position: 'static', marginBottom: 12, display: 'inline-block' }}>
                  {statusLabel(selected.status)}
                </span>

                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
                  <div>📅 投稿日: {formatDate(selected.created_at)}</div>
                  {selected.location && (
                    <div>📍 位置: {selected.location.latitude?.toFixed(6)}, {selected.location.longitude?.toFixed(6)}</div>
                  )}
                  {selected.submitter_id && (
                    <div>👤 投稿者: {selected.submitter_id.slice(0, 12)}...</div>
                  )}
                </div>

                {selected.description && (
                  <div style={{ marginTop: 12, fontSize: 13, padding: 10, background: 'var(--bg)', borderRadius: 6 }}>
                    {selected.description}
                  </div>
                )}

                {selected.generated_quest && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>AI生成クエスト:</div>
                    <div style={{ fontSize: 13, padding: 10, background: 'var(--bg)', borderRadius: 6, color: 'var(--accent)' }}>
                      {selected.generated_quest}
                    </div>
                  </div>
                )}

                {selected.admin_notes && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--accent-red)' }}>
                    却下理由: {selected.admin_notes}
                  </div>
                )}

                {/* アクション（pending のみ） */}
                {selected.status === 'pending' && (
                  <div style={{ marginTop: 20 }}>
                    <div className="modal-actions">
                      <button
                        className="action-btn approve"
                        onClick={() => handleApprove(selected)}
                        disabled={processing}
                        style={{ padding: '10px 0', fontSize: 14 }}
                      >
                        {processing ? '処理中...' : '✅ 承認'}
                      </button>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>却下理由:</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {REJECT_REASONS.map(r => (
                          <button
                            key={r}
                            className={`ng-tag ${rejectReason === r ? 'selected' : ''}`}
                            onClick={() => setRejectReason(rejectReason === r ? '' : r)}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <input
                        className="note-input"
                        placeholder="補足コメント（任意）"
                        value={rejectCustom}
                        onChange={(e) => setRejectCustom(e.target.value)}
                        style={{ margin: 0, width: '100%' }}
                      />
                      <button
                        className="action-btn reject"
                        onClick={() => handleReject(selected)}
                        disabled={processing || !rejectReason}
                        style={{ width: '100%', marginTop: 8, padding: '10px 0', fontSize: 14 }}
                      >
                        {processing ? '処理中...' : '❌ 却下'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button className="modal-close" onClick={() => { setSelected(null); setRejectReason(''); setRejectCustom('') }}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
