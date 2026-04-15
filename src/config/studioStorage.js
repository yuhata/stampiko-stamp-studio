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
import { initializeApp, getApps } from 'firebase/app'
import { authReady } from './firebase'

// firebase.js で初期化済みのappを再利用
const app = getApps()[0] || initializeApp({}) // fallback never reached in practice
const fdb = getFirestore(app)

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
// 注意: dataUrl(base64) を含むため Firestore 1MB 上限近くで打ち切る

const CUSTOM_STAMPS_MAX_BYTES = 900_000 // 安全マージン

export function loadCustomStamps() {
  return lsRead(LS_KEYS.customStamps, [])
}

export function saveCustomStamps(customStamps) {
  // 新しい順に詰めて、JSONサイズが上限を超える分は古いものから捨てる
  const sorted = [...customStamps].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  const trimmed = []
  let bytes = 0
  for (const s of sorted) {
    const size = JSON.stringify(s).length
    if (bytes + size > CUSTOM_STAMPS_MAX_BYTES) break
    trimmed.push(s)
    bytes += size
  }
  if (trimmed.length < sorted.length) {
    console.warn(`[studioStorage] customStamps: ${sorted.length - trimmed.length}件をサイズ上限のため未同期`)
  }
  lsWrite(LS_KEYS.customStamps, customStamps)
  pushSettingsToFirestore({ customStamps: trimmed })
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
