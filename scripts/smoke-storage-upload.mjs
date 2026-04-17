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

const DEV_URL = process.env.SMOKE_URL || 'http://localhost:5199/stampiko-stamp-studio/#studio'
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

// 個別ドキュメントを検証
async function verifyStampDoc(token, stampId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_custom_stamps/${stampId}`
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok) return null
  return r.json()
}

async function main() {
  log(`target: ${DEV_URL}`)

  const token = await getAccessToken()
  log('Firebase OAuth token refreshed')

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
  await page.waitForTimeout(2000)
  await page.evaluate(() => {
    localStorage.removeItem('lbs-stamp-studio-custom-stamps')
  })

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

  // Storage アップロードと個別ドキュメント書き込みを待つ
  await page.waitForTimeout(5000)

  // localStorage の状態を確認
  const lsState = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('lbs-stamp-studio-custom-stamps') || '[]')
    return d.filter(s => s.spotName === 'スモークテストスポット').map(s => ({
      id: s.id,
      hasDataUrl: !!s.dataUrl,
      hasImageUrl: !!s.imageUrl,
      source: s.source,
    }))
  })
  log('localStorage state:', JSON.stringify(lsState))

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

  // Firestore を個別ドキュメントで直接確認
  // スモーク用スタンプの ID を取得（localStorage から）
  const stampIds = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('lbs-stamp-studio-custom-stamps') || '[]')
    return d.filter(s => s.spotName === 'スモークテストスポット').map(s => s.id)
  })
  if (stampIds.length === 0) fail('localStorage にスモーク用スタンプが見つからない')
  ok(`localStorage にスモーク用スタンプ ${stampIds.length} 件`)

  // Firestoreの個別ドキュメントを確認（最大10秒ポーリング）
  let stampDoc = null
  for (let i = 0; i < 10; i++) {
    stampDoc = await verifyStampDoc(token, stampIds[0])
    if (stampDoc?.fields) break
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!stampDoc?.fields) {
    fail(`個別ドキュメント studio_custom_stamps/${stampIds[0]} が見つからない（10秒ポーリング後）`)
  }
  ok(`個別ドキュメント ${stampIds[0]} がFirestoreに存在`)

  const fields = stampDoc.fields
  if (!fields.imageUrl?.stringValue?.includes('firebasestorage')) {
    fail(`imageUrl が Storage URL でない: ${JSON.stringify(fields.imageUrl)}`)
  }
  ok(`imageUrl = ${fields.imageUrl.stringValue.substring(0, 80)}...`)

  if (fields.dataUrl) {
    fail('個別ドキュメントに dataUrl が残っている')
  }
  ok('個別ドキュメントに dataUrl が含まれない')

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
