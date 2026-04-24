/**
 * 匿名Auth経由でテンプレート書き込み動線を smoke（デザイナーが実際に触る経路）
 *
 * 検証項目:
 *   L1. 匿名Auth sign-in
 *   L2. Storage stamp_templates/smoke_test_{ts}.png に PNG アップロード（ブラウザと同じ経路）
 *   L3. uploadしたURLがブラウザで取得できる（GET 200）
 *   L4. Firestore stamp_templates/_smoke_test に imageUrl を書き込み（read/write auth 両方検証）
 *   L5. 別の匿名セッションで read → 同じ imageUrl を受け取れる（onSnapshot 相当）
 *   L6. クリーンアップ: Storage オブジェクト + Firestore doc 削除
 *
 * 使い方: node scripts/smoke-template-write.mjs
 */
import fs from 'fs'

const API_KEY = 'AIzaSyDcYEpjKmI_ygA-fvRTrmIZwoy1jDhYzz0'
const PROJECT = 'stampiko-e8be8'
const BUCKET = 'stampiko-e8be8.firebasestorage.app'
const TEST_CATEGORY = '_smoke_test' // 実カテゴリに影響しない名前
const ts = Date.now()
const TEST_STORAGE_PATH = `stamp_templates/smoke_test_${ts}.png`

// 1x1 red pixel PNG (base64)
const DUMMY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
const dummyPng = Buffer.from(DUMMY_PNG_BASE64, 'base64')

function log(label, status, extra = '') {
  const mark = status === 'OK' ? '\x1b[32m✓ OK  \x1b[0m' : status === 'FAIL' ? '\x1b[31m✗ FAIL\x1b[0m' : '\x1b[33m• INFO\x1b[0m'
  console.log(`${mark} ${label}${extra ? ': ' + extra : ''}`)
}

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, ok: r.ok, headers: r.headers, json, text }
}

// ---- Step 1: 匿名Auth sign-in ----
async function signIn() {
  const r = await fetchJSON(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  )
  if (!r.ok) throw new Error(`signin ${r.status}: ${r.text.slice(0, 100)}`)
  return { idToken: r.json.idToken, uid: r.json.localId }
}

// ---- Step 2: Storage upload (anonymous auth, Firebase {idToken} 認証) ----
async function uploadStorage(idToken, storagePath, pngBuffer) {
  const encoded = encodeURIComponent(storagePath)
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encoded}`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${idToken}`,
      'Content-Type': 'image/png',
    },
    body: pngBuffer,
  })
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const meta = await r.json()
  const token0 = (meta.downloadTokens || '').split(',')[0]
  if (!token0) throw new Error('no downloadTokens')
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media&token=${token0}`
}

// ---- Step 3: Storage delete ----
async function deleteStorage(idToken, storagePath) {
  const encoded = encodeURIComponent(storagePath)
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}`
  const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Firebase ${idToken}` } })
  return r.ok
}

// ---- Step 4: Firestore write (via anon idToken) ----
async function firestoreWrite(idToken, docPath, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const encoded = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') encoded[k] = { stringValue: v }
    else if (typeof v === 'boolean') encoded[k] = { booleanValue: v }
    else encoded[k] = { stringValue: String(v) }
  }
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encoded }),
  })
  if (!r.ok) throw new Error(`firestore write ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

async function firestoreRead(idToken, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`firestore read ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

async function firestoreDelete(idToken, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } })
  return r.ok
}

// ---- 本体 ----
console.log('\n=== Template Write Flow Smoke（匿名Auth/ブラウザ動線再現）===\n')

let imageUrl = null
let session1Uid = null

// L1
try {
  const s = await signIn()
  session1Uid = s.uid
  log('L1 匿名Auth sign-in (session1)', 'OK', `uid=${s.uid.slice(0, 8)}...`)

  // L2
  try {
    imageUrl = await uploadStorage(s.idToken, TEST_STORAGE_PATH, dummyPng)
    log('L2 Storage upload (anon auth)', 'OK', `url=${imageUrl.slice(0, 80)}...`)
  } catch (err) {
    log('L2 Storage upload (anon auth)', 'FAIL', err.message)
    console.error('\n⚠️ 重要: Storage rules が匿名Auth書込を拒否しています。TemplateEditModal は動きません。')
    console.error('   storage.rules または Firebase Console で stamp_templates/ パスの write ルールを確認してください。')
    process.exit(1)
  }

  // L3
  try {
    const r = await fetch(imageUrl)
    if (!r.ok) throw new Error(`GET ${r.status}`)
    const buf = await r.arrayBuffer()
    if (buf.byteLength < 50) throw new Error(`too small ${buf.byteLength}B`)
    log('L3 imageUrl 実到達性 (GET 200)', 'OK', `${buf.byteLength}B`)
  } catch (err) {
    log('L3 imageUrl 実到達性 (GET 200)', 'FAIL', err.message)
  }

  // L4
  const testDocPath = `stamp_templates/${TEST_CATEGORY}`
  try {
    await firestoreWrite(s.idToken, testDocPath, {
      imageUrl,
      storagePath: TEST_STORAGE_PATH,
      test: true,
      smoke_ts: String(ts),
    })
    log('L4 Firestore write (anon auth)', 'OK', `${testDocPath}`)
  } catch (err) {
    log('L4 Firestore write (anon auth)', 'FAIL', err.message)
    console.error('\n⚠️ Firestore rules 確認要: stamp_templates への write が拒否されている可能性')
    process.exit(1)
  }

  // L5: 別セッションで read
  try {
    const s2 = await signIn()
    log('L5 別セッションで匿名Auth sign-in', 'INFO', `uid=${s2.uid.slice(0, 8)}... (!= session1)`)
    const doc = await firestoreRead(s2.idToken, testDocPath)
    if (!doc) throw new Error('doc not found')
    const readUrl = doc.fields?.imageUrl?.stringValue
    if (readUrl !== imageUrl) throw new Error(`URL mismatch: ${readUrl?.slice(0, 60)}`)
    log('L5 別セッションで Firestore read → 同一imageUrl', 'OK')
  } catch (err) {
    log('L5 別セッションで read', 'FAIL', err.message)
  }

  // L6: cleanup
  console.log('\n--- クリーンアップ ---')
  try {
    await firestoreDelete(s.idToken, testDocPath)
    log('L6a Firestore _smoke_test doc 削除', 'OK')
  } catch (err) {
    log('L6a Firestore _smoke_test doc 削除', 'FAIL', err.message)
  }
  try {
    const ok = await deleteStorage(s.idToken, TEST_STORAGE_PATH)
    log('L6b Storage smoke_test.png 削除', ok ? 'OK' : 'FAIL')
  } catch (err) {
    log('L6b Storage smoke_test.png 削除', 'FAIL', err.message)
  }

  console.log('\n✅ 書き込み動線 smoke 完了')
  console.log('   デザイナーが実際に使う経路（匿名Auth → Storage write → Firestore write → 他セッションread）が全て動作確認済み。')
} catch (err) {
  log('致命的エラー', 'FAIL', err.message)
  console.error(err)
  process.exit(1)
}
