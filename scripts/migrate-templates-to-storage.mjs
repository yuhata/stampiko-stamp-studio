/**
 * 既存 16 テンプレートPNG → Firebase Storage + Firestore stamp_templates/ への一括投入
 *
 * 対象ファイル: public/template-designs-v3/{category}.png (16ファイル)
 * 投入先:
 *   - Storage: stamp_templates/{category}_{timestamp}.png
 *   - Firestore: stamp_templates/{category}
 *
 * 認証: firebase-tools の refresh token 経由の OAuth（既存migrate-to-studio-stamps.mjsと同方式）
 *
 * 実行:
 *   node scripts/migrate-templates-to-storage.mjs --dry                # dry-run
 *   node scripts/migrate-templates-to-storage.mjs --category=shrine    # 単一カテゴリのみ投入（動作確認用）
 *   node scripts/migrate-templates-to-storage.mjs                      # 本番投入（既存docはスキップ）
 *   node scripts/migrate-templates-to-storage.mjs --force              # 既存docも上書き
 *
 * 過去事故対策（2026-04-24 品質ゲート対応）:
 *   - ⑧ Promise タイムアウト未実装 → 全 fetch に 30秒 AbortController タイムアウト付与
 *   - ③⑤ Storage実到達性未検証 → upload後、imageUrl を GET 200 で検証。失敗したら Firestore 書込を中止
 *   - ⑨ ルール未確認 → 1カテゴリ先行投入 (--category=shrine) でルール動作を確認してから残投入
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = 'stampiko-e8be8'
const BUCKET = 'stampiko-e8be8.firebasestorage.app'
const TEMPLATE_DIR = path.resolve(__dirname, '../public/template-designs-v3')

const DRY_RUN = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')
const CATEGORY_FILTER = process.argv.find(a => a.startsWith('--category='))?.split('=')[1]
const FETCH_TIMEOUT_MS = 30000

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

const log = (...a) => console.log(`[tpl-migrate${DRY_RUN ? ':DRY' : ''}]`, ...a)

// カテゴリ定義（stampTemplates.js TEMPLATE_CATEGORIES と同期必須）
const CATEGORIES = [
  // 既存9（本格画像、約1MB）
  { id: 'shrine', label: '神社', color: '#9E3D3F', placeholder: false },
  { id: 'temple', label: '寺院', color: '#8F8667', placeholder: false },
  { id: 'station', label: '駅', color: '#2B618F', placeholder: false },
  { id: 'castle', label: '城', color: '#6C6A6C', placeholder: false },
  { id: 'lighthouse', label: '灯台', color: '#2B4B6F', placeholder: false },
  { id: 'rest_area', label: '道の駅', color: '#769164', placeholder: false },
  { id: 'onsen', label: '温泉', color: '#B4866B', placeholder: false },
  { id: 'museum', label: '博物館・美術館', color: '#745399', placeholder: false },
  { id: 'zoo', label: '動物園・水族館', color: '#5B8930', placeholder: false },
  // 暫定7（fallback SVG画像、約40KB）
  { id: 'heritage', label: '文化財', color: '#B8860B', placeholder: true },
  { id: 'historic_building', label: '歴史的建造物', color: '#8B4513', placeholder: true },
  { id: 'historic_site', label: '史跡・記念碑', color: '#696969', placeholder: true },
  { id: 'theater', label: '劇場・ホール', color: '#C71585', placeholder: true },
  { id: 'park_garden', label: '公園・庭園', color: '#1B5E20', placeholder: true },
  { id: 'sightseeing_spot', label: '観光名所', color: '#008B8B', placeholder: true },
  { id: 'church', label: '教会', color: '#4682B4', placeholder: true },
]

// ---------- fetch with timeout (⑧対策: hangを防ぐ) ----------
async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`fetch timeout after ${timeoutMs}ms: ${url.slice(0, 80)}`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ---------- imageUrl 実到達性検証 (③⑤対策) ----------
async function verifyImageUrl(imageUrl) {
  const r = await fetchWithTimeout(imageUrl, { method: 'GET' })
  if (!r.ok) throw new Error(`imageUrl GET ${r.status}: ${imageUrl.slice(0, 120)}`)
  const contentType = r.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw new Error(`imageUrl not an image (content-type=${contentType})`)
  const buf = await r.arrayBuffer()
  if (buf.byteLength < 100) throw new Error(`imageUrl too small: ${buf.byteLength} bytes`)
  return { status: 200, contentType, bytes: buf.byteLength }
}

// ---------- OAuth (firebase-tools refresh token → access token) ----------
async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const r = await fetchWithTimeout('https://oauth2.googleapis.com/token', { method: 'POST', body })
  if (!r.ok) throw new Error(`token exchange ${r.status}: ${await r.text()}`)
  const j = await r.json()
  return j.access_token
}

// ---------- Storage upload (REST API) ----------
async function uploadStorage(token, storagePath, pngBuffer) {
  const encoded = encodeURIComponent(storagePath)
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encoded}`
  const r = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'image/png' },
    body: pngBuffer,
  })
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${await r.text()}`)
  const meta = await r.json()
  const downloadToken = (meta.downloadTokens || '').split(',')[0]
  if (!downloadToken) throw new Error('no downloadTokens in upload response')
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media&token=${downloadToken}`
  return { storagePath, imageUrl }
}

// ---------- Firestore helpers ----------
async function fetchFirestoreDoc(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetchWithTimeout(url, { headers: { Authorization: 'Bearer ' + token } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`firestore fetch ${r.status}: ${await r.text()}`)
  return r.json()
}

async function writeFirestoreDoc(token, docPath, fields) {
  // PATCH with updateMask を使うと merge:true と同等
  const keys = Object.keys(fields)
  const mask = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}?${mask}`
  const encoded = {}
  for (const [k, v] of Object.entries(fields)) encoded[k] = encodeValue(v)
  const r = await fetchWithTimeout(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encoded }),
  })
  if (!r.ok) throw new Error(`firestore write ${r.status}: ${await r.text()}`)
  return r.json()
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  return { stringValue: String(v) }
}

// ---------- メイン ----------
async function main() {
  log('開始')
  log(`TEMPLATE_DIR: ${TEMPLATE_DIR}`)
  log(`PROJECT: ${PROJECT}`)
  log(`BUCKET: ${BUCKET}`)
  log(`DRY_RUN: ${DRY_RUN}`)
  log(`FORCE: ${FORCE}`)
  if (CATEGORY_FILTER) log(`CATEGORY_FILTER: ${CATEGORY_FILTER}（単一カテゴリのみ投入）`)

  const targetCategories = CATEGORY_FILTER
    ? CATEGORIES.filter(c => c.id === CATEGORY_FILTER)
    : CATEGORIES
  if (targetCategories.length === 0) {
    log(`❌ CATEGORY_FILTER="${CATEGORY_FILTER}" に一致するカテゴリなし`)
    process.exit(1)
  }
  log(`対象カテゴリ数: ${targetCategories.length}`)

  const token = DRY_RUN ? 'dry-run-token' : await getAccessToken()
  if (!DRY_RUN) log('OAuthトークン取得 OK')

  let ok = 0, skipped = 0, errors = 0
  const version = Date.now()

  for (const cat of targetCategories) {
    const localPath = path.join(TEMPLATE_DIR, `${cat.id}.png`)
    if (!fs.existsSync(localPath)) {
      log(`⚠️  ${cat.id}: ローカルPNG見つからず スキップ`)
      errors++
      continue
    }

    const stat = fs.statSync(localPath)
    const sizeKB = (stat.size / 1024).toFixed(1)

    // 既存docチェック
    let existing = null
    if (!DRY_RUN) {
      existing = await fetchFirestoreDoc(token, `stamp_templates/${cat.id}`)
    }
    if (existing && !FORCE) {
      log(`⏭️  ${cat.id} (${sizeKB}KB): 既存doc あり スキップ（--forceで上書き）`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      log(`✓ ${cat.id} (${sizeKB}KB) → would upload + write firestore doc`)
      ok++
      continue
    }

    try {
      const pngBuffer = fs.readFileSync(localPath)
      const storagePath = `stamp_templates/${cat.id}_${version}.png`

      // Step 1: Storage upload
      const { imageUrl } = await uploadStorage(token, storagePath, pngBuffer)
      log(`   ↑ upload OK: ${storagePath}`)

      // Step 2: 実到達性検証（③⑤対策）— 失敗したら Firestore write しない
      const verify = await verifyImageUrl(imageUrl)
      log(`   ✓ verify OK: GET 200 / ${verify.contentType} / ${verify.bytes}B`)

      // Step 3: Firestore write
      await writeFirestoreDoc(token, `stamp_templates/${cat.id}`, {
        imageUrl,
        storagePath,
        color: cat.color,
        label: cat.label,
        is_placeholder: cat.placeholder,
        migrated_at: new Date(),
        migration_source: `public/template-designs-v3/${cat.id}.png`,
        size_bytes: stat.size,
      })

      log(`✅ ${cat.id} (${sizeKB}KB) → firestore doc 書き込み完了 ${cat.placeholder ? '[暫定]' : '[本格]'}`)
      ok++
    } catch (err) {
      log(`❌ ${cat.id}: ${err.message}`)
      errors++
    }
  }

  log(`\n=== 完了 ===`)
  log(`成功: ${ok}  スキップ: ${skipped}  エラー: ${errors}`)
  if (errors > 0) process.exit(1)
}

main().catch(err => {
  log(`致命的エラー: ${err.message}`)
  console.error(err)
  process.exit(1)
})
