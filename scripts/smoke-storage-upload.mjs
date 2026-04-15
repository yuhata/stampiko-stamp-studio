// 実 Firebase バックエンドに対して customStamps の Storage 移行を検証するスモークテスト
//
// 手順:
//   1. Playwright で dev server を開く
//   2. /api/generate-stamp-image をモックして決定的な PNG を返す
//   3. バッチ生成 → ギャラリー追加
//   4. firebasestorage.googleapis.com への upload リクエストを観測
//   5. Firebase REST API で studio_settings/global を直接 fetch し、
//      customStamps[].imageUrl が入っていて dataUrl が含まれないことを確認
//
// 実行: node scripts/smoke-storage-upload.mjs

import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'

const DEV_URL = process.env.SMOKE_URL || 'http://localhost:5177/stampiko-stamp-studio/#studio'
const PROJECT = 'stampiko-e8be8'
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const log = (msg, ...rest) => console.log(`[smoke] ${msg}`, ...rest)
const fail = (msg) => { console.error(`[smoke] FAIL: ${msg}`); process.exit(1) }
const ok = (msg) => console.log(`[smoke] ✓ ${msg}`)

// Firebase access token を取得（refresh_token から）
async function getAccessToken() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await r.json()
  if (!j.access_token) throw new Error('refresh failed: ' + JSON.stringify(j))
  return j.access_token
}

// Firestore REST で studio_settings/global を取得
async function fetchSettingsDoc(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_settings/global`
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok) throw new Error(`Firestore GET ${r.status}`)
  return r.json()
}

// 検証前に既存 customStamps を消しておく（テスト独立性）
async function resetCustomStamps(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_settings/global?updateMask.fieldPaths=customStamps`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { customStamps: { arrayValue: { values: [] } } } }),
  })
  if (!r.ok) throw new Error(`Firestore PATCH ${r.status}: ${await r.text()}`)
}

async function main() {
  log(`target: ${DEV_URL}`)

  const token = await getAccessToken()
  log('Firebase OAuth token refreshed')

  await resetCustomStamps(token)
  ok('Firestore studio_settings/global.customStamps をリセット')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') {
      consoleErrors.push(m.text())
    }
  })

  // Storage upload リクエストを観測
  const storageUploads = []
  const allFirebaseReqs = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('firebasestorage') || url.includes('firestore') || url.includes('googleapis')) {
      allFirebaseReqs.push(`${req.method()} ${url.substring(0, 120)}`)
    }
    if (url.includes('firebasestorage.googleapis.com') && req.method() === 'POST') {
      storageUploads.push(url)
    }
  })

  // ブラウザコンソール出力もキャプチャ
  page.on('console', (m) => {
    if (m.type() === 'log' || m.type() === 'warn') {
      console.log(`  [browser ${m.type()}]`, m.text().substring(0, 200))
    }
  })

  // gemini API モック
  await page.route('**/api/generate-stamp-image', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{ base64: TINY_PNG, mimeType: 'image/png', index: 0 }],
      }),
    })
  )

  await page.goto(DEV_URL)
  ok('ページロード')

  // localStorage クリア（前回のセッションの dataUrl を残さない）
  await page.evaluate(() => {
    localStorage.removeItem('lbs-stamp-studio-custom-stamps')
  })
  await page.reload()

  // バッチ生成タブに移動
  await page.getByRole('button', { name: 'バッチ生成' }).click()
  await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill('スモークテストスポット')
  ok('スポット名入力')

  await page.getByRole('button', { name: /候補を生成/ }).click()
  // 生成完了を待つ
  await page.waitForSelector('text=ギャラリーに追加', { timeout: 15000 })
  ok('生成完了')

  await page.getByRole('button', { name: /ギャラリーに追加/ }).click()
  ok('ギャラリーに追加クリック')

  // Storage アップロードと Firestore push (600ms debounce) の両方を待つ
  await page.waitForTimeout(3000)

  // Storage upload リクエストが発生したか
  if (storageUploads.length === 0) {
    log('--- 全 Firebase リクエスト ---')
    allFirebaseReqs.forEach(r => log(' ', r))
    log('--- end ---')
    fail('Storage upload リクエストが観測されなかった')
  }
  ok(`Storage upload ${storageUploads.length} 件観測`)

  // Console エラーが致命的でないか
  const fatalErrors = consoleErrors.filter((e) =>
    !e.includes('UGCQueue') && !e.includes('insufficient permissions for ugc')
  )
  if (fatalErrors.length > 0) {
    log('console errors:', fatalErrors)
    fail(`致命的 console error が ${fatalErrors.length} 件`)
  }
  ok('致命的 console error なし')

  // Firestore を直接確認（最大10秒ポーリング）
  let doc, customStampsField
  for (let i = 0; i < 10; i++) {
    doc = await fetchSettingsDoc(token)
    customStampsField = doc.fields?.customStamps?.arrayValue?.values || []
    if (customStampsField.length > 0) break
    await new Promise(r => setTimeout(r, 1000))
  }
  if (customStampsField.length === 0) {
    log('--- Firestore doc state ---')
    log(JSON.stringify(doc, null, 2).substring(0, 1500))
    fail('Firestore studio_settings.customStamps が空（10秒ポーリング後）')
  }
  ok(`Firestore に customStamps ${customStampsField.length} 件保存済み`)

  const first = customStampsField[0].mapValue.fields
  if (!first.imageUrl?.stringValue) {
    fail('customStamps[0].imageUrl が無い')
  }
  if (!first.imageUrl.stringValue.includes('firebasestorage')) {
    fail(`imageUrl が Storage URL でない: ${first.imageUrl.stringValue}`)
  }
  ok(`customStamps[0].imageUrl = ${first.imageUrl.stringValue.substring(0, 80)}...`)

  if (first.dataUrl) {
    fail(`customStamps[0] に dataUrl が残っている (Firestore 1MB 上限のリスク)`)
  }
  ok('customStamps[0] に dataUrl が含まれない')

  // 別ブラウザコンテキストで開いて画像が表示されるか確認
  log('別ブラウザコンテキストで再ロード...')
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await page2.goto(DEV_URL)
  await page2.getByRole('button', { name: 'ギャラリー' }).click()

  // Storage URL の img が描画されるまで待機
  const imgs = await page2.locator('img[src*="firebasestorage"]').count()
  if (imgs === 0) {
    // セッション間同期は authReady → pullSettingsFromFirestore を待つ必要あり
    await page2.waitForTimeout(3000)
    const retry = await page2.locator('img[src*="firebasestorage"]').count()
    if (retry === 0) fail('別ブラウザでも Storage URL の img が描画されない')
  }
  ok('別ブラウザコンテキストで Storage URL 画像が描画された')

  await browser.close()
  log('=== ALL CHECKS PASSED ===')
}

main().catch((err) => {
  console.error('[smoke] EXCEPTION:', err)
  process.exit(1)
})
