// Stamp Studio 設定の永続化レイヤー
// localStorage と Firestore の両方に保存し、cache clear 後も Firestore から復元する
//
// 構造:
//   Firestore: studio_settings/global { areaConfig, criteria, stampOverrides }
//   Firestore: studio_custom_stamps/{stampId} — カスタムスタンプ（個別ドキュメント）
//   Storage:   studio_custom_stamps/{stampId}.png — 画像本体
//
// カスタムスタンプは個別ドキュメント方式。配列の全量上書きによるデータ消失を防ぐ。
// 追加=setDoc、削除=deleteDoc、読み込み=getDocs。部分失敗が全体に波及しない。

import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage'
import { initializeApp, getApps } from 'firebase/app'
import { authReady } from './firebase'

// firebase.js で初期化済みのappを再利用
const app = getApps()[0] || initializeApp({}) // fallback never reached in practice
const fdb = getFirestore(app)
const fst = getStorage(app)

const SETTINGS_DOC = doc(fdb, 'studio_settings', 'global')

const LS_KEYS = {
  areas: 'lbs-stamp-studio-areas',
  criteria: 'lbs-stamp-studio-criteria',
  overrides: 'lbs-stamp-studio-stamp-overrides',
  customStamps: 'lbs-stamp-studio-custom-stamps',
  ngReasons: 'lbs-stamp-studio-ng-log',
}

// ---------- localStorage helpers ----------

function lsRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function lsWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[studioStorage] localStorage write failed for ${key}:`, err.message)
  }
}

// ---------- Firestore sync ----------

let pullPromise = null

/**
 * 起動時にFirestoreから設定を取得し、localStorageに反映する。
 * 失敗してもローカル値を維持。複数回呼ばれても1回しか実行しない。
 */
export function pullSettingsFromFirestore() {
  if (pullPromise) return pullPromise
  pullPromise = (async () => {
    try {
      await authReady
      const snap = await getDoc(SETTINGS_DOC)
      if (!snap.exists()) return { source: 'none' }
      const data = snap.data() || {}
      if (data.areaConfig && typeof data.areaConfig === 'object') {
        lsWrite(LS_KEYS.areas, data.areaConfig)
      }
      if (Array.isArray(data.criteria)) {
        lsWrite(LS_KEYS.criteria, data.criteria)
      }
      if (data.stampOverrides && typeof data.stampOverrides === 'object') {
        lsWrite(LS_KEYS.overrides, data.stampOverrides)
      }
      // customStamps は個別ドキュメント方式に移行済み。旧配列は無視する
      if (Array.isArray(data.ngReasons)) {
        lsWrite(LS_KEYS.ngReasons, data.ngReasons)
      }
      return { source: 'firestore', updatedAt: data.updatedAt || null }
    } catch (err) {
      console.warn('[studioStorage] pull failed:', err.message)
      return { source: 'error', error: err.message }
    }
  })()
  return pullPromise
}

/**
 * Firestoreに設定を保存（部分更新）。localStorageは即座に更新済みである前提で呼ぶ。
 * 並行呼び出しを束ねるため簡易デバウンス。
 */
const pushQueue = {}
let pushTimer = null

export function pushSettingsToFirestore(partial) {
  Object.assign(pushQueue, partial)
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    const snapshot = { ...pushQueue }
    Object.keys(pushQueue).forEach(k => delete pushQueue[k])
    pushTimer = null
    try {
      await authReady
      await setDoc(SETTINGS_DOC, { ...snapshot, updatedAt: serverTimestamp() }, { merge: true })
    } catch (err) {
      console.warn('[studioStorage] push failed:', err.message)
    }
  }, 600)
}

// ---------- 公開API: areaConfig ----------

export function loadAreaConfig() {
  return lsRead(LS_KEYS.areas, null)
}

export function saveAreaConfig(areaConfig) {
  lsWrite(LS_KEYS.areas, areaConfig)
  pushSettingsToFirestore({ areaConfig })
}

// ---------- 公開API: criteria ----------

export function loadCriteria() {
  return lsRead(LS_KEYS.criteria, null)
}

export function saveCriteria(criteria) {
  lsWrite(LS_KEYS.criteria, criteria)
  pushSettingsToFirestore({ criteria })
}

// ---------- 公開API: stampOverrides ----------
// 差し替えたスタンプ画像（dataUrl）を stampId キーで保持

export function loadStampOverrides() {
  return lsRead(LS_KEYS.overrides, {})
}

export function saveStampOverride(stampId, partial) {
  const current = loadStampOverrides()
  current[stampId] = { ...(current[stampId] || {}), ...partial }
  lsWrite(LS_KEYS.overrides, current)
  pushSettingsToFirestore({ stampOverrides: current })
}

// ---------- 公開API: customStamps ----------
// バッチ生成・バリエーション生成で新規作成したスタンプ（manifest/Firestoreに無い）
// 個別ドキュメント方式: studio_custom_stamps/{stampId} に1スタンプ1ドキュメント
// 画像本体: Firebase Storage studio_custom_stamps/{stampId}.png

const CUSTOM_STAMPS_COL = collection(fdb, 'studio_custom_stamps')

export function loadCustomStamps() {
  return lsRead(LS_KEYS.customStamps, [])
}

/**
 * Firestoreから全カスタムスタンプを読み込み、localStorageに同期
 */
export async function pullCustomStampsFromFirestore() {
  try {
    await authReady
    const snap = await getDocs(CUSTOM_STAMPS_COL)
    const stamps = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    lsWrite(LS_KEYS.customStamps, stamps)
    // 読み込んだスタンプは既にFirestoreに存在するのでsavedとしてマーク
    stamps.forEach(s => {
      savedStampIds.add(s.id)
      if (s.imageUrl) uploadedImageIds.add(s.id)
    })
    return stamps
  } catch (err) {
    console.warn('[studioStorage] pullCustomStamps failed:', err.message)
    return loadCustomStamps()
  }
}

// data:image/png;base64,XXXX を Storage にアップロードして公開URLを返す
async function uploadDataUrlToStorage(stampId, dataUrl) {
  const ref = storageRef(fst, `studio_custom_stamps/${stampId}.png`)
  await uploadString(ref, dataUrl, 'data_url')
  return await getDownloadURL(ref)
}

// セッション内で処理済みの stampId を追跡
const savedStampIds = new Set()    // Firestore にドキュメントを書いた ID
const uploadedImageIds = new Set() // Storage にアップロード済みの ID
const uploadInflight = new Map()

/**
 * カスタムスタンプを個別ドキュメントとして保存。
 * 前回との差分のみ書き込み、削除も反映する。
 * 配列全量上書きは行わない。
 */
export async function saveCustomStamps(currentStamps) {
  // localStorage は即時に書き込み
  lsWrite(LS_KEYS.customStamps, currentStamps)

  const currentIds = new Set(currentStamps.map(s => s.id))

  // 新規・更新: 個別ドキュメントとして upsert
  for (const s of currentStamps) {
    if (savedStampIds.has(s.id) && !s.dataUrl?.startsWith('data:')) continue

    // base64 → Storage アップロード（未アップロードのもののみ）
    let imageUrl = s.imageUrl
    if (s.dataUrl?.startsWith('data:') && !imageUrl && !uploadedImageIds.has(s.id)) {
      try {
        let p = uploadInflight.get(s.id)
        if (!p) {
          p = uploadDataUrlToStorage(s.id, s.dataUrl)
          uploadInflight.set(s.id, p)
        }
        imageUrl = await p
        uploadInflight.delete(s.id)
        uploadedImageIds.add(s.id)
      } catch (err) {
        uploadInflight.delete(s.id)
        console.warn(`[studioStorage] upload failed for ${s.id}:`, err.message)
        // アップロード失敗でもメタデータは保存する（画像なしでもドキュメントは残す）
        imageUrl = s.imageUrl || null
      }
    }

    const docData = { ...s, source: 'custom' }
    if (imageUrl) docData.imageUrl = imageUrl
    delete docData.dataUrl // base64 は Firestore に載せない

    try {
      await authReady
      await setDoc(doc(fdb, 'studio_custom_stamps', s.id), docData, { merge: true })
      savedStampIds.add(s.id)

      // localStorage 側も imageUrl で更新
      if (imageUrl && s.dataUrl?.startsWith('data:')) {
        const ls = loadCustomStamps()
        const patched = ls.map(x => x.id === s.id ? { ...x, imageUrl, dataUrl: null } : x)
        lsWrite(LS_KEYS.customStamps, patched)
      }
    } catch (err) {
      console.warn(`[studioStorage] save stamp ${s.id} failed:`, err.message)
    }
  }

  // 削除: 前回保存済みで今回消えた ID を deleteDoc
  for (const id of savedStampIds) {
    if (!currentIds.has(id)) {
      try {
        await authReady
        await deleteDoc(doc(fdb, 'studio_custom_stamps', id))
        savedStampIds.delete(id)
      } catch (err) {
        console.warn(`[studioStorage] delete stamp ${id} failed:`, err.message)
      }
    }
  }
}

export async function deleteCustomStamp(stampId) {
  try {
    await authReady
    await deleteDoc(doc(fdb, 'studio_custom_stamps', stampId))
    savedStampIds.delete(stampId)
  } catch (err) {
    console.warn(`[studioStorage] deleteCustomStamp ${stampId} failed:`, err.message)
  }
  const ls = loadCustomStamps().filter(s => s.id !== stampId)
  lsWrite(LS_KEYS.customStamps, ls)
}

// ---------- 公開API: ngReasons ----------

export function loadNgReasons() {
  return lsRead(LS_KEYS.ngReasons, [])
}

export function saveNgReasons(ngReasons) {
  lsWrite(LS_KEYS.ngReasons, ngReasons)
  pushSettingsToFirestore({ ngReasons })
}

export function deleteStampOverride(stampId) {
  const current = loadStampOverrides()
  delete current[stampId]
  lsWrite(LS_KEYS.overrides, current)
  pushSettingsToFirestore({ stampOverrides: current })
}
