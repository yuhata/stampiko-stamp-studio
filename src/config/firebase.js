import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, getDocs, query, where, writeBatch, serverTimestamp, GeoPoint } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDcYEpjKmI_ygA-fvRTrmIZwoy1jDhYzz0",
  authDomain: "stampiko-e8be8.firebaseapp.com",
  projectId: "stampiko-e8be8",
  storageBucket: "stampiko-e8be8.firebasestorage.app",
  messagingSenderId: "6875460427",
  appId: "1:6875460427:web:cc16f09875fbab2567aece",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const storage = getStorage(app)
const auth = getAuth(app)

// Firestoreセキュリティルールが認証必須のため、匿名認証でアクセス
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      resolve(user)
    } else {
      signInAnonymously(auth).then(cred => resolve(cred.user)).catch(err => {
        console.warn('[Firebase] Anonymous auth failed:', err.message)
        resolve(null)
      })
    }
  })
})

export { authReady }

/**
 * 旧 group_id (`group_X` プレフィクス形式) と4件mismatchを正規 area_id (CANONICAL_AREAS) に正規化
 * - group_nihonbashi → tokyo
 * - group_ryogoku    → asakusa
 * - group_tokyotower → shimbashi
 * - group_tsukiji    → ginza
 * - group_test_*     → null (テストデータ)
 * - 特殊キー (`_*`)  → null
 */
const AREA_REMAP = {
  nihonbashi: 'tokyo',
  ryogoku:    'asakusa',
  tokyotower: 'shimbashi',
  tsukiji:    'ginza',
}
function normalizeAreaId(rawGroupId) {
  if (!rawGroupId || typeof rawGroupId !== 'string') return null
  if (rawGroupId.startsWith('_')) return null
  let bare = rawGroupId.startsWith('group_') ? rawGroupId.slice(6) : rawGroupId
  if (bare.startsWith('test_')) return null
  return AREA_REMAP[bare] || bare
}

/**
 * スタンプをFirestoreに公開
 * stamp-studioで承認されたスタンプをstampsコレクションに登録
 *
 * dual-write: 旧 group_id と新 area_id 両方を書く（B3後継リファクタ、PR-7）
 */
export const publishStamp = async (stampData) => {
  const stampId = stampData.id || `stamp_${Date.now()}`
  const groupId = stampData.groupId || ''
  await setDoc(doc(db, 'stamps', stampId), {
    name: stampData.spotName || stampData.name || '',
    group_id: groupId,
    area_id: normalizeAreaId(groupId),
    rarity: stampData.rarity || 'common',
    image_url: stampData.imageUrl || stampData.path || '',
    is_special: false,
    created_at: serverTimestamp(),
    // stamp-studioメタデータ
    design_status: 'approved',
    approved_at: serverTimestamp(),
  }, { merge: true })
  return stampId
}

/**
 * POIデータをFirestoreのspotsコレクションにインポート
 */
export const importPOIsToFirestore = async (pois, options = {}) => {
  const { batchSize = 500, onProgress } = options
  let imported = 0, skipped = 0

  const CATEGORY_DEFAULTS = {
    shrine:     { question: 'この神社を見つけて写真を撮ってください', hints: ['鳥居を探しましょう'], threshold: 0.65 },
    temple:     { question: 'このお寺を見つけて写真を撮ってください', hints: ['山門を探しましょう'], threshold: 0.65 },
    station:    { question: 'この駅を見つけて写真を撮ってください', hints: ['駅名の看板を探しましょう'], threshold: 0.60 },
    castle:     { question: 'この城を見つけて写真を撮ってください', hints: ['天守閣や石垣を探しましょう'], threshold: 0.70 },
    lighthouse: { question: 'この灯台を見つけて写真を撮ってください', hints: ['海沿いの高い塔を探しましょう'], threshold: 0.70 },
    rest_area:  { question: 'この道の駅を見つけて写真を撮ってください', hints: ['建物と駐車場が目印です'], threshold: 0.60 },
    onsen:      { question: 'この温泉施設を見つけて写真を撮ってください', hints: ['看板や暖簾を探しましょう'], threshold: 0.60 },
    museum:     { question: 'この美術館・博物館を見つけて写真を撮ってください', hints: ['入口の看板を探しましょう'], threshold: 0.60 },
    zoo:        { question: 'この動物園・水族館を見つけて写真を撮ってください', hints: ['入口ゲートを探しましょう'], threshold: 0.60 },
  }

  const TEMPLATE_BASE = 'https://raw.githubusercontent.com/yuhata/lbs-stamp-studio/main/public/template-designs-v2'

  for (let i = 0; i < pois.length; i += batchSize) {
    const chunk = pois.slice(i, i + batchSize)
    const batch = writeBatch(db)

    for (const poi of chunk) {
      if (!poi.name || poi.name === '名称不明') { skipped++; continue }

      const docId = `ds_${poi.category}_${poi.osm_id || poi.name.replace(/\s+/g, '_')}`
      const defaults = CATEGORY_DEFAULTS[poi.category] || CATEGORY_DEFAULTS.shrine

      batch.set(doc(db, 'spots', docId), {
        name: poi.name,
        display_name: poi.name,
        group_id: `_data_${poi.category}`,
        area_id: null, // data_spot は area 概念外（PR-7 dual-write）
        location: new GeoPoint(poi.lat, poi.lng),
        question: defaults.question,
        hints: defaults.hints,
        difficulty: 'easy',
        mission: {
          reference_images: [],
          required_features: [],
          framing_hint: '',
          similarity_threshold: defaults.threshold,
        },
        spot_type: 'data_spot',
        category: poi.category,
        data_source: poi.data_source || 'osm',
        template_id: poi.category,
        thumbnail_url: `${TEMPLATE_BASE}/${poi.category}.png`,
        location_type: 'outdoor',
        nnex_enabled: false,
      }, { merge: true })
      imported++
    }

    await batch.commit()
    if (onProgress) onProgress({ imported, skipped, total: pois.length })
  }

  return { imported, skipped }
}

/**
 * Firestoreから現在のスポット数を取得
 */
export const getFirestoreStats = async () => {
  const spotsSnap = await getDocs(collection(db, 'spots'))
  const stampsSnap = await getDocs(collection(db, 'stamps'))
  const usersSnap = await getDocs(collection(db, 'users'))

  const spots = spotsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const landmarks = spots.filter(s => s.spot_type !== 'data_spot').length
  const dataSpots = spots.filter(s => s.spot_type === 'data_spot').length

  return {
    totalSpots: spots.length,
    landmarks,
    dataSpots,
    stamps: stampsSnap.size,
    users: usersSnap.size,
  }
}

export { db, storage }
