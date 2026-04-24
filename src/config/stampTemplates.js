// Stamp Studio テンプレート画像管理層
// 全カテゴリのテンプレート画像を Firestore + Storage で統一管理
//
// 設計原則（ver2 studio_stamps と同パターン）:
// - 個別ドキュメント方式: stamp_templates/{category}
// - 書き込み経路: upsertTemplate / replaceTemplateImage のみ
// - 読み込み: subscribeTemplates (onSnapshot) でリアクティブ同期
// - 画像: Firebase Storage stamp_templates/{category}_{version}.png（バージョン付与でキャッシュバスター）

import {
  collection, doc, setDoc, onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore'
import {
  ref as storageRef, uploadString, getDownloadURL, deleteObject,
} from 'firebase/storage'
import { db, storage, authReady } from './firebase'

const COL = 'stamp_templates'
const STORAGE_PREFIX = 'stamp_templates'

// ---------- カテゴリ定義（Studio UI のグリッド生成用マスターリスト） ----------
// Stampiko API側 CATEGORY_COLORS (LBS_Stamp_API/index.js:1443) と同期必須
export const TEMPLATE_CATEGORIES = [
  // 既存9カテゴリ（Gemini生成本格マスター）
  { id: 'shrine',            label: '神社',           color: '#9E3D3F' },
  { id: 'temple',            label: '寺院',           color: '#8F8667' },
  { id: 'station',           label: '駅',             color: '#2B618F' },
  { id: 'castle',            label: '城',             color: '#6C6A6C' },
  { id: 'lighthouse',        label: '灯台',           color: '#2B4B6F' },
  { id: 'rest_area',         label: '道の駅',         color: '#769164' },
  { id: 'onsen',             label: '温泉',           color: '#B4866B' },
  { id: 'museum',            label: '博物館・美術館', color: '#745399' },
  { id: 'zoo',               label: '動物園・水族館', color: '#5B8930' },
  // heritage（以前はfallback運用、2026-04-24管理化）
  { id: 'heritage',          label: '文化財',         color: '#B8860B' },
  // 新規6カテゴリ（2026-04-24 Wikidata取り込みで追加、暫定fallback画像）
  { id: 'historic_building', label: '歴史的建造物',   color: '#8B4513' },
  { id: 'historic_site',     label: '史跡・記念碑',   color: '#696969' },
  { id: 'theater',           label: '劇場・ホール',   color: '#C71585' },
  { id: 'park_garden',       label: '公園・庭園',     color: '#1B5E20' },
  { id: 'sightseeing_spot',  label: '観光名所',       color: '#008B8B' },
  { id: 'church',            label: '教会',           color: '#4682B4' },
]

// ---------- 読み込み (リアルタイム onSnapshot) ----------

/**
 * 全テンプレートを onSnapshot 購読。変化ごとに { [category]: doc } 形式で callback
 * 戻り値: unsubscribe関数
 */
export function subscribeTemplates(callback) {
  let cancelled = false
  let unsub = null
  authReady.then(() => {
    if (cancelled) return
    unsub = onSnapshot(collection(db, COL), (snap) => {
      const templates = {}
      snap.forEach(d => {
        templates[d.id] = { id: d.id, ...d.data() }
      })
      callback(templates)
    }, (err) => {
      console.warn('[stampTemplates] subscribe error:', err.message)
    })
  })
  return () => { cancelled = true; if (unsub) unsub() }
}

/**
 * 一度だけ全件取得（初期SSR/スモーク用）
 */
export async function fetchAllTemplates() {
  await authReady
  const snap = await getDocs(collection(db, COL))
  const templates = {}
  snap.forEach(d => {
    templates[d.id] = { id: d.id, ...d.data() }
  })
  return templates
}

// ---------- 書き込み ----------

/**
 * テンプレートのメタ情報を upsert（color/label/is_placeholder等の更新用）
 * 画像URLは replaceTemplateImage から変更する
 */
export async function upsertTemplate(category, updates) {
  if (!category) throw new Error('upsertTemplate: category required')
  await authReady
  const payload = { ...updates, updatedAt: serverTimestamp() }
  delete payload.dataUrl // Storage経由以外でdataURL書き込み禁止
  await setDoc(doc(db, COL, category), payload, { merge: true })
  return payload
}

/**
 * テンプレート画像差し替え: base64 dataUrl を Storage にアップロード → imageUrl を更新
 * 旧imageUrl の Storage オブジェクトは削除（best-effort）
 */
export async function replaceTemplateImage(category, dataUrl, oldImageUrl = null, meta = {}) {
  if (!category) throw new Error('replaceTemplateImage: category required')
  if (!dataUrl?.startsWith('data:')) throw new Error('replaceTemplateImage: dataUrl must be data: scheme')
  await authReady

  // 新画像アップロード（冪等なバージョン付与パス）
  const version = Date.now()
  const objPath = `${STORAGE_PREFIX}/${category}_${version}.png`
  const ref = storageRef(storage, objPath)
  await uploadString(ref, dataUrl, 'data_url')
  const imageUrl = await getDownloadURL(ref)

  // Firestore 更新: imageUrl/storagePath + 任意のメタ（color, label, is_placeholder等）
  await setDoc(doc(db, COL, category), {
    imageUrl,
    storagePath: objPath,
    updatedAt: serverTimestamp(),
    ...meta,
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
      console.warn('[stampTemplates] old image delete failed (ignored):', err.message)
    }
  }

  return { imageUrl, storagePath: objPath }
}
