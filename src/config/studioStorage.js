// Stamp Studio 設定の永続化レイヤー
// localStorage と Firestore の両方に保存し、cache clear 後も Firestore から復元する
//
// 構造:
//   Firestore: studio_settings/global { areaConfig, criteria, stampOverrides }
//   - areaConfig: { [areaId]: { label, palette[], style, description } }
//   - criteria:   [ { id, criteria, ok, ng } ]
//   - stampOverrides: { [stampId]: { dataUrl, status, designerNote, ngTags, lat, lng } }
//
// 注意: stampOverrides の dataUrl はサイズが大きく、Firestore 1MBドキュメント上限に注意。
// 本実装では「数十件までの上書き」を想定。本格的にはStorageへ移行する。

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
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
      if (Array.isArray(data.customStamps)) {
        lsWrite(LS_KEYS.customStamps, data.customStamps)
      }
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
// 画像本体(base64)は Firebase Storage `studio_custom_stamps/{id}.png` にアップロードし、
// Firestore には URL のみ保存することで 1MB ドキュメント上限を回避する。

export function loadCustomStamps() {
  return lsRead(LS_KEYS.customStamps, [])
}

// data:image/png;base64,XXXX を Storage にアップロードして公開URLを返す
async function uploadDataUrlToStorage(stampId, dataUrl) {
  const ref = storageRef(fst, `studio_custom_stamps/${stampId}.png`)
  // uploadString は data URL を直接受け付ける ('data_url' フォーマット)
  await uploadString(ref, dataUrl, 'data_url')
  return await getDownloadURL(ref)
}

// アップロード進行中の Promise を stampId ごとにキャッシュして二重アップロードを防ぐ
const uploadInflight = new Map()
// アップロード完了済みの stampId → imageUrl をセッション内でキャッシュ。
// React state が dataUrl を保持し続けても再アップロードしないようにする
const uploadedUrls = new Map()

/**
 * customStamps の各エントリについて、`dataUrl` が base64 ならStorageへ移行して
 * `imageUrl` に置き換えた配列を Firestore へ保存。
 * - localStorage には base64 を含むフル状態を保存（オフライン即時表示用）
 * - Firestore には imageUrl のみ保存（軽量・無制限）
 */
export async function saveCustomStamps(customStamps) {
  // localStorage は即時に書き込み（dataUrl も含めて持つ）
  lsWrite(LS_KEYS.customStamps, customStamps)

  // Firestore 用にアップロードしてURLに置き換える
  const lite = await Promise.all(customStamps.map(async (s) => {
    if (s.imageUrl) {
      uploadedUrls.set(s.id, s.imageUrl)
      return stripDataUrl(s)
    }
    if (uploadedUrls.has(s.id)) {
      // セッション内で既にアップロード済み
      return stripDataUrl({ ...s, imageUrl: uploadedUrls.get(s.id) })
    }
    if (s.dataUrl?.startsWith('data:')) {
      try {
        let p = uploadInflight.get(s.id)
        if (!p) {
          p = uploadDataUrlToStorage(s.id, s.dataUrl)
          uploadInflight.set(s.id, p)
        }
        const url = await p
        uploadInflight.delete(s.id)
        uploadedUrls.set(s.id, url)
        // localStorage 側のエントリも imageUrl で更新（次回ロードからアップロード不要）
        patchLocalCustomStamp(s.id, { imageUrl: url, dataUrl: null })
        return stripDataUrl({ ...s, imageUrl: url })
      } catch (err) {
        uploadInflight.delete(s.id)
        console.warn(`[studioStorage] upload failed for ${s.id}:`, err.message)
        return null
      }
    }
    return stripDataUrl(s)
  }))

  const sanitized = lite.filter(Boolean)
  pushSettingsToFirestore({ customStamps: sanitized })
}

function stripDataUrl(stamp) {
  // Firestore に dataUrl(base64) を載せない
  const { dataUrl: _drop, ...rest } = stamp
  return rest
}

function patchLocalCustomStamp(stampId, patch) {
  const current = loadCustomStamps()
  const next = current.map(s => s.id === stampId ? { ...s, ...patch } : s)
  lsWrite(LS_KEYS.customStamps, next)
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
