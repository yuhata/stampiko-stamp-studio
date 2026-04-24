/**
 * Stamp Template Management smoke test
 *
 * 検証層:
 *   1. Firestore stamp_templates/{category} が存在し imageUrl を持つ
 *   2. imageUrl が実際に GET 200 + image/* で到達可能
 *   3. API エンドポイント /api/stamp-image/:category/:spotName が 200 + image/png を返す
 *
 * 使い方:
 *   node scripts/smoke-template-management.mjs                  # local API (localhost:3002)
 *   node scripts/smoke-template-management.mjs --prod           # 本番 API (stampiko-api.vercel.app)
 *   node scripts/smoke-template-management.mjs --category=shrine
 *   node scripts/smoke-template-management.mjs --skip-endpoint  # Firestore+imageUrlのみ（API停止時用）
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = 'stampiko-e8be8'

const args = process.argv.slice(2)
const PROD = args.includes('--prod')
const SKIP_ENDPOINT = args.includes('--skip-endpoint')
const CATEGORY_FILTER = args.find(a => a.startsWith('--category='))?.split('=')[1]
const API_BASE = PROD ? 'https://stampiko-api.vercel.app' : 'http://localhost:3002'

const CATEGORIES = [
  // 既存9（本格）
  'shrine', 'temple', 'station', 'castle', 'lighthouse',
  'rest_area', 'onsen', 'museum', 'zoo',
  // heritage + 新規6（暫定fallback）
  'heritage',
  'historic_building', 'historic_site', 'theater',
  'park_garden', 'sightseeing_spot', 'church',
]

// ---------- OAuth（firebase-tools refresh_token） ----------
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const r = await fetchWithTimeout('https://oauth2.googleapis.com/token', { method: 'POST', body })
  if (!r.ok) throw new Error(`token exchange ${r.status}`)
  return (await r.json()).access_token
}

// ---------- fetch with timeout ----------
async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: c.signal })
  } finally {
    clearTimeout(t)
  }
}

async function fetchFirestoreDoc(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetchWithTimeout(url, { headers: { Authorization: 'Bearer ' + token } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`firestore ${r.status}: ${(await r.text()).slice(0, 120)}`)
  return r.json()
}

const STATUS = { OK: '\x1b[32m✓ OK  \x1b[0m', FAIL: '\x1b[31m✗ FAIL\x1b[0m', SKIP: '\x1b[33m- SKIP\x1b[0m' }

async function main() {
  console.log(`\n=== Stamp Template Smoke Test ===`)
  console.log(`  環境: ${PROD ? 'PRODUCTION' : 'LOCAL'}`)
  console.log(`  API_BASE: ${API_BASE}`)
  console.log(`  SKIP_ENDPOINT: ${SKIP_ENDPOINT}`)
  if (CATEGORY_FILTER) console.log(`  CATEGORY_FILTER: ${CATEGORY_FILTER}`)

  const targets = CATEGORY_FILTER ? CATEGORIES.filter(c => c === CATEGORY_FILTER) : CATEGORIES
  if (targets.length === 0) {
    console.error(`\n❌ CATEGORY_FILTER="${CATEGORY_FILTER}" に一致するカテゴリなし`)
    process.exit(1)
  }
  console.log(`  対象: ${targets.length}カテゴリ\n`)

  const token = await getAccessToken()

  const results = {
    firestore: { ok: 0, fail: 0, fails: [] },
    imageUrl: { ok: 0, fail: 0, fails: [] },
    endpoint: { ok: 0, fail: 0, skip: 0, fails: [] },
  }

  for (const cat of targets) {
    console.log(`\n─── ${cat} ───`)

    // ===== Layer 1: Firestore doc =====
    let imageUrl = null
    try {
      const doc = await fetchFirestoreDoc(token, `stamp_templates/${cat}`)
      if (!doc) throw new Error('Firestore doc not found')
      imageUrl = doc.fields?.imageUrl?.stringValue
      if (!imageUrl) throw new Error('imageUrl field missing')
      const placeholder = doc.fields?.is_placeholder?.booleanValue
      console.log(`${STATUS.OK} Firestore doc [${placeholder ? '暫定' : '本格'}]`)
      results.firestore.ok++
    } catch (err) {
      console.log(`${STATUS.FAIL} Firestore doc: ${err.message}`)
      results.firestore.fail++
      results.firestore.fails.push({ cat, msg: err.message })
      continue // imageUrl が無ければ次に進めない
    }

    // ===== Layer 2: imageUrl reachability =====
    try {
      const r = await fetchWithTimeout(imageUrl)
      if (!r.ok) throw new Error(`GET ${r.status}`)
      const ct = r.headers.get('content-type') || ''
      if (!ct.startsWith('image/')) throw new Error(`content-type=${ct}`)
      const buf = await r.arrayBuffer()
      if (buf.byteLength < 100) throw new Error(`size ${buf.byteLength}B`)
      console.log(`${STATUS.OK} imageUrl reach: ${ct} / ${(buf.byteLength / 1024).toFixed(1)}KB`)
      results.imageUrl.ok++
    } catch (err) {
      console.log(`${STATUS.FAIL} imageUrl reach: ${err.message}`)
      results.imageUrl.fail++
      results.imageUrl.fails.push({ cat, msg: err.message })
    }

    // ===== Layer 3: API endpoint =====
    if (SKIP_ENDPOINT) {
      console.log(`${STATUS.SKIP} API endpoint (--skip-endpoint)`)
      results.endpoint.skip++
      continue
    }
    try {
      const url = `${API_BASE}/api/stamp-image/${cat}/${encodeURIComponent('スモーク検証')}`
      const r = await fetchWithTimeout(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const ct = r.headers.get('content-type') || ''
      if (!ct.startsWith('image/')) throw new Error(`content-type=${ct}`)
      const buf = await r.arrayBuffer()
      if (buf.byteLength < 1000) throw new Error(`size ${buf.byteLength}B（動的生成にしても小さすぎ）`)
      console.log(`${STATUS.OK} API endpoint: ${ct} / ${(buf.byteLength / 1024).toFixed(1)}KB`)
      results.endpoint.ok++
    } catch (err) {
      console.log(`${STATUS.FAIL} API endpoint: ${err.message}`)
      results.endpoint.fail++
      results.endpoint.fails.push({ cat, msg: err.message })
    }
  }

  console.log(`\n\n=== 集計 ===`)
  console.log(`Firestore doc  : ${results.firestore.ok}/${targets.length}`)
  console.log(`imageUrl reach : ${results.imageUrl.ok}/${targets.length}`)
  if (SKIP_ENDPOINT) {
    console.log(`API endpoint   : SKIPPED (${results.endpoint.skip})`)
  } else {
    console.log(`API endpoint   : ${results.endpoint.ok}/${targets.length}`)
  }

  const totalFail = results.firestore.fail + results.imageUrl.fail + results.endpoint.fail
  if (totalFail > 0) {
    console.log(`\n❌ 失敗 ${totalFail}件`)
    const allFails = [
      ...results.firestore.fails.map(f => ({ ...f, layer: 'Firestore' })),
      ...results.imageUrl.fails.map(f => ({ ...f, layer: 'imageUrl' })),
      ...results.endpoint.fails.map(f => ({ ...f, layer: 'endpoint' })),
    ]
    for (const f of allFails) console.log(`  - [${f.layer}] ${f.cat}: ${f.msg}`)
    process.exit(1)
  } else {
    console.log(`\n✅ 全チェック PASS`)
  }
}

main().catch(err => {
  console.error(`\n❌ 致命的エラー: ${err.message}`)
  console.error(err)
  process.exit(1)
})
