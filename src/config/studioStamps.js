// Stamp Studio 統一データ層 (ver2 根本修正)
// 全スタンプを単一コレクション studio_stamps/{stampId} に集約
// - manifest由来・Firestore spots由来・custom生成の区別は source フィールドで管理
// - 書き込み経路は upsertStamp / deleteStamp / replaceStampImage の3本のみ
// - 読み込みは onSnapshot でリアルタイム同期
// - 配列全量上書き完全撤廃

import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore'
import {
  ref as storageRef, uploadString, getDownloadURL, deleteObject,
} from 'firebase/storage'
import { db, storage, authReady } from './firebase'

const COL = 'studio_stamps'
const STORAGE_PREFIX = 'studio_stamps'

// ---------- 読み込み (リアルタイム) ----------

/**
 * onSnapshot で全スタンプを購読。stampsが変わるたびにcallbackへ新しい配列を渡す
 * 戻り値: unsubscribe関数
 */
export function subscribeStamps(callback) {
  let cancelled = false
  let unsub = null
  authReady.then(() => {
    if (cancelled) return
    unsub = onSnapshot(collection(db, COL), (snap) => {
      const stamps = []
      snap.forEach(d => {
        const data = d.data()
        if (data.deleted === true) return // トゥームストーン除外
        stamps.push({ id: d.id, ...data })
      })
      callback(stamps)
    }, (err) => {
      console.warn('[studioStamps] subscribe error:', err.message)
    })
  })
  return () => { cancelled = true; if (unsub) unsub() }
}

/**
 * 一度だけ全件取得（初期SSR/スモーク用）
 */
export async function fetchAllStamps() {
  await authReady
  const snap = await getDocs(collection(db, COL))
  const stamps = []
  snap.forEach(d => {
    const data = d.data()
    if (data.deleted === true) return
    stamps.push({ id: d.id, ...data })
  })
  return stamps
}

// ---------- 書き込み ----------

/**
 * スタンプを作成 or 部分更新する。
 * - 既存フィールドは merge:true で保護
 * - updatedAt は常に上書き
 * - 返り値: updates 反映後の payload
 */
export async function upsertStamp(stampId, updates) {
  if (!stampId) throw new Error('upsertStamp: stampId required')
  await authReady
  const payload = { ...updates, updatedAt: serverTimestamp() }
  // dataUrl を直接書かない（Storage経由）
  delete payload.dataUrl
  await setDoc(doc(db, COL, stampId), payload, { merge: true })
  return payload
}

/**
 * 複数スタンプを upsert する（バッチ生成追加などで使用）
 * 各スタンプにつき setDoc を並列発火。失敗は個別ログで続行
 */
export async function upsertStampsMany(stamps) {
  await authReady
  const results = await Promise.allSettled(stamps.map(s => {
    const { id, ...rest } = s
    return setDoc(doc(db, COL, id), {
      ...rest,
      createdAt: rest.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }))
  return results.map((r, i) => ({ id: stamps[i].id, ok: r.status === 'fulfilled', error: r.reason?.message }))
}

/**
 * スタンプを削除する。完全削除（deleteDoc）。
 * onSnapshotリスナーが他タブにも削除を瞬時に伝える
 */
export async function deleteStamp(stampId) {
  await authReady
  await deleteDoc(doc(db, COL, stampId))
}

/**
 * 複数スタンプを一括削除
 */
export async function deleteStampsMany(stampIds) {
  await authReady
  const results = await Promise.allSettled(stampIds.map(id =>
    deleteDoc(doc(db, COL, id))
  ))
  return results.map((r, i) => ({ id: stampIds[i], ok: r.status === 'fulfilled', error: r.reason?.message }))
}

/**
 * スポットに紐づくスタンプを一括削除
 */
export async function deleteStampsBySpotId(spotId, allStamps) {
  const targets = allStamps.filter(s => s.spotId === spotId).map(s => s.id)
  return deleteStampsMany(targets)
}

/**
 * 画像差し替え: base64 dataUrl を Storage にアップロード → imageUrl を更新
 * 旧imageUrl の Storage オブジェクトは削除（ゴミ残り防止、best-effort）
 */
export async function replaceStampImage(stampId, dataUrl, oldImageUrl = null) {
  if (!stampId) throw new Error('replaceStampImage: stampId required')
  if (!dataUrl?.startsWith('data:')) throw new Error('replaceStampImage: dataUrl must be data: scheme')
  await authReady

  // 新画像アップロード（冪等なパス: バージョン付与でキャッシュバスター）
  const version = Date.now()
  const objPath = `${STORAGE_PREFIX}/${stampId}_${version}.png`
  const ref = storageRef(storage, objPath)
  await uploadString(ref, dataUrl, 'data_url')
  const imageUrl = await getDownloadURL(ref)

  // Firestore 更新
  await setDoc(doc(db, COL, stampId), {
    imageUrl,
    storagePath: objPath,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  // 旧画像削除（best-effort、失敗しても続行）
  if (oldImageUrl && oldImageUrl.includes('/o/')) {
    try {
      const m = oldImageUrl.match(/\/o\/([^?]+)/)
      if (m) {
        const oldPath = decodeURIComponent(m[1])
        await deleteObject(storageRef(storage, oldPath))
      }
    } catch (err) {
      console.warn('[studioStamps] old image delete failed (ignored):', err.message)
    }
  }

  return { imageUrl, storagePath: objPath }
}

/**
 * 新規生成スタンプのStorage upload + Firestore doc作成をワンストップで実行。
 * バッチ生成UIから呼ぶ。
 */
export async function createStampWithImage(stampMeta) {
  const { id, dataUrl, ...rest } = stampMeta
  if (!id) throw new Error('createStampWithImage: id required')
  if (!dataUrl?.startsWith('data:')) throw new Error('createStampWithImage: dataUrl required')
  await authReady

  const objPath = `${STORAGE_PREFIX}/${id}.png`
  const ref = storageRef(storage, objPath)
  await uploadString(ref, dataUrl, 'data_url')
  const imageUrl = await getDownloadURL(ref)

  await setDoc(doc(db, COL, id), {
    ...rest,
    imageUrl,
    storagePath: objPath,
    createdAt: rest.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })

  return { id, imageUrl, storagePath: objPath }
}
