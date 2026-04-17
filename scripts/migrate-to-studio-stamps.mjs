// studio_stamps/{id} 統一コレクション移行スクリプト
//
// 対象ソース:
//   1. public/stamps/manifest.json (静的102件)
//   2. Firestore spots where spot_type=='landmark' (約300件)
//   3. Firestore studio_custom_stamps/* (約394件)
//   4. Firestore studio_settings/global.stampOverrides (93件分の差分パッチ)
//
// 出力先: Firestore studio_stamps/{stampId}
//
// 特性:
//   - 冪等: 同じスタンプは同じstampIdで setDoc merge:true
//   - dry-run モード: --dry で書き込まず差分のみ表示
//   - 進捗表示
//   - 失敗時は個別ログで続行（全件停止しない）
//
// 実行:
//   node scripts/migrate-to-studio-stamps.mjs --dry      # dry-run
//   node scripts/migrate-to-studio-stamps.mjs            # 本番実行

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = 'stampiko-e8be8'
const DRY_RUN = process.argv.includes('--dry')
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

const log = (...a) => console.log(`[migrate${DRY_RUN ? ':DRY' : ''}]`, ...a)

async function getToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  return (await r.json()).access_token
}

// ---------- Firestore REST helpers ----------

async function fetchDoc(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok) return null
  return r.json()
}

async function fetchAllDocs(token, col) {
  const all = []
  let nextToken = null
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${col}?pageSize=300${nextToken ? `&pageToken=${nextToken}` : ''}`
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    all.push(...(j.documents || []))
    nextToken = j.nextPageToken
  } while (nextToken)
  return all
}

async function fetchSpotsByType(token, spotType) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'spots' }],
      where: {
        fieldFilter: { field: { fieldPath: 'spot_type' }, op: 'EQUAL', value: { stringValue: spotType } },
      },
      limit: 1000,
    },
  }
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  return (j || []).filter(x => x.document).map(x => x.document)
}

function decodeFirestoreValue(v) {
  if (!v) return undefined
  if ('stringValue' in v) return v.stringValue
  if ('doubleValue' in v) return v.doubleValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('booleanValue' in v) return v.booleanValue
  if ('timestampValue' in v) return v.timestampValue
  if ('mapValue' in v) {
    const o = {}
    for (const [k, vv] of Object.entries(v.mapValue?.fields || {})) o[k] = decodeFirestoreValue(vv)
    return o
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue)
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude, longitude: v.geoPointValue.longitude }
  if ('nullValue' in v) return null
  return undefined
}

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'string') return { stringValue: val }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val }
  }
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeFirestoreValue) } }
  if (typeof val === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(val)) fields[k] = encodeFirestoreValue(v)
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

async function upsertStudioStamp(token, stampId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps/${stampId}`
  // merge:true 相当 — updateMask を指定すると含まれるフィールドのみ更新
  const fields = {}
  for (const [k, v] of Object.entries(data)) {
    const enc = encodeFirestoreValue(v)
    if (enc !== undefined) fields[k] = enc
  }
  const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const finalUrl = `${url}?${updateMask}`
  const r = await fetch(finalUrl, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`upsert ${stampId}: ${r.status} ${await r.text()}`)
}

// ---------- ソース読み込み ----------

async function loadManifestStamps() {
  const p = path.join(__dirname, '..', 'public', 'stamps', 'manifest.json')
  if (!fs.existsSync(p)) return []
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  return raw.map(s => ({
    id: s.id,
    spotId: s.spotId,
    spotName: s.spotName,
    area: s.area,
    variant: s.variant ?? 0,
    lat: s.lat ?? 0,
    lng: s.lng ?? 0,
    path: s.path || null,
    status: s.status || 'draft',
    designerNote: s.designerNote || '',
    ngTags: [],
    source: 'manifest',
  }))
}

async function loadFirestoreLandmarkStamps(token) {
  const docs = await fetchSpotsByType(token, 'landmark')
  return docs.map(d => {
    const id = d.name.split('/').pop()
    const data = Object.fromEntries(
      Object.entries(d.fields || {}).map(([k, v]) => [k, decodeFirestoreValue(v)])
    )
    return {
      id: `fs_${id}`,
      spotId: id,
      spotName: data.name || '',
      area: data.group_id || 'unknown',
      variant: 0,
      lat: data.location?.latitude || 0,
      lng: data.location?.longitude || 0,
      path: null,
      imageUrl: data.thumbnail_url || null,
      status: data.thumbnail_url ? 'draft' : 'pending',
      designerNote: '',
      ngTags: [],
      source: 'firestore',
    }
  })
}

async function loadCustomStamps(token) {
  const docs = await fetchAllDocs(token, 'studio_custom_stamps')
  return docs.map(d => {
    const id = d.name.split('/').pop()
    const data = Object.fromEntries(
      Object.entries(d.fields || {}).map(([k, v]) => [k, decodeFirestoreValue(v)])
    )
    return {
      id,
      spotId: data.spotId || id,
      spotName: data.spotName || '未分類',
      area: data.area || 'unknown',
      variant: data.variant ?? 0,
      lat: data.lat ?? 0,
      lng: data.lng ?? 0,
      path: null,
      imageUrl: data.imageUrl || null,
      status: data.status || 'draft',
      designerNote: data.designerNote || '',
      ngTags: data.ngTags || [],
      source: 'custom',
    }
  })
}

async function loadStampOverrides(token) {
  const doc = await fetchDoc(token, 'studio_settings/global')
  const overrides = {}
  const fields = doc?.fields?.stampOverrides?.mapValue?.fields || {}
  for (const [stampId, v] of Object.entries(fields)) {
    overrides[stampId] = decodeFirestoreValue(v) || {}
  }
  return overrides
}

// ---------- メイン ----------

async function main() {
  const token = await getToken()
  log('=== ソース読み込み ===')
  const manifest = await loadManifestStamps()
  log(`manifest.json: ${manifest.length}件`)
  const firestoreLandmarks = await loadFirestoreLandmarkStamps(token)
  log(`Firestore spots(landmark): ${firestoreLandmarks.length}件`)
  const customs = await loadCustomStamps(token)
  log(`studio_custom_stamps: ${customs.length}件`)
  const overrides = await loadStampOverrides(token)
  log(`stampOverrides: ${Object.keys(overrides).length}件`)

  // マージ: manifest → Firestore landmark (新規のみ) → custom (新規のみ)
  // 各stampId一意。同じIDが重複したら後勝ちにしない（manifestが優先）
  log('\n=== マージ処理 ===')
  const byId = new Map()

  for (const s of manifest) byId.set(s.id, s)
  let newFromLandmark = 0
  for (const s of firestoreLandmarks) {
    if (!byId.has(s.id)) {
      // spotId が manifest 側で既に使われているか確認（manifest重複防止）
      const existingBySpot = manifest.find(m => m.spotId === s.spotId)
      if (!existingBySpot) {
        byId.set(s.id, s)
        newFromLandmark++
      }
    }
  }
  log(`Firestore landmark追加: ${newFromLandmark}件`)

  let newFromCustom = 0
  for (const s of customs) {
    if (!byId.has(s.id)) {
      byId.set(s.id, s)
      newFromCustom++
    }
  }
  log(`custom追加: ${newFromCustom}件`)

  // stampOverrides を適用
  let overrideApplied = 0
  for (const [stampId, patch] of Object.entries(overrides)) {
    if (byId.has(stampId)) {
      const base = byId.get(stampId)
      // dataUrl は Firestore には書かない（dataUrl フィールドは Storage 未登録の場合保留）
      // imageUrl が patch にあれば優先、なければ dataUrl を imageUrl に昇格（スコープ外、移行時はスキップ）
      const merged = { ...base, ...patch }
      if (merged.dataUrl && !merged.imageUrl) {
        // dataUrl を imageUrl に昇格する処理は別タスク（Storage upload必要）
        delete merged.dataUrl
      }
      byId.set(stampId, merged)
      overrideApplied++
    }
  }
  log(`override適用: ${overrideApplied}件`)

  const total = byId.size
  log(`\n=== 移行対象合計: ${total}件 ===`)

  if (DRY_RUN) {
    log('\n(DRY-RUN) 書き込みをスキップ。内訳:')
    const bySource = {}
    for (const s of byId.values()) {
      bySource[s.source] = (bySource[s.source] || 0) + 1
    }
    log('source別:', bySource)
    // 最初の3件をサンプル表示
    const sample = [...byId.values()].slice(0, 3)
    log('sample:', JSON.stringify(sample, null, 2))
    return
  }

  // 本番実行: 並列度20で書き込み
  log('\n=== Firestore書き込み開始 ===')
  const arr = [...byId.values()]
  let done = 0, failed = 0
  const BATCH = 20
  for (let i = 0; i < arr.length; i += BATCH) {
    const chunk = arr.slice(i, i + BATCH)
    const results = await Promise.allSettled(chunk.map(s => {
      const { id, ...rest } = s
      return upsertStudioStamp(token, id, rest)
    }))
    for (const r of results) {
      if (r.status === 'fulfilled') done++
      else { failed++; console.warn('  fail:', r.reason?.message) }
    }
    log(`進捗: ${done + failed}/${arr.length} (ok=${done}, fail=${failed})`)
  }

  log(`\n=== 完了: ok=${done} fail=${failed} ===`)

  // 検証: 件数確認
  const resultDocs = await fetchAllDocs(token, 'studio_stamps')
  log(`検証: studio_stamps/* に ${resultDocs.length} 件`)
  if (resultDocs.length !== total) {
    console.warn(`⚠️ 期待 ${total} 件 ≠ 実績 ${resultDocs.length} 件。差分調査が必要`)
  } else {
    log('✓ 件数一致')
  }
}

main().catch(err => { console.error('[migrate] FATAL:', err); process.exit(1) })
