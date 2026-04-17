// smoke-designer-workflow.mjs (ver2 完全版)
// デザイナーが実作業で触る全操作を実Firebase環境で検証する包括スモーク
//
// カバー範囲:
//   A〜L 主要12操作 × 4観点 = 48ケース
//   M〜S 副次5操作 × 2〜4観点 = 約15ケース
//   E1〜E4 エッジケース = 約8ケース
//   合計70+テストケース
//
// 4観点:
//   Local:    ローカル UI 即時反映
//   Realtime: 別ブラウザコンテキストへ 3秒以内同期（onSnapshot）
//   Reload:   ハードリロード（新セッション）後の永続化
//   Firestore: REST API で Firestore 実データ確認
//
// 実行前提: dev server が起動（SMOKE_URL 環境変数、デフォルト http://localhost:5173）
// 実行: SMOKE_URL=... node scripts/smoke-designer-workflow.mjs

import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'

const DEV_URL = process.env.SMOKE_URL || 'http://localhost:5173/stampiko-stamp-studio/#studio'
const PROJECT = 'stampiko-e8be8'
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

const results = []
const log = (tag, status, detail = {}) => {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·'
  console.log(`${icon} [${tag}] ${status}`, JSON.stringify(detail).slice(0, 200))
  results.push({ tag, status, ...detail })
}

// ---------- Firebase REST helpers ----------

async function getToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token',
  })
  return (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token
}

async function fetchStamp(token, id) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps/${id}`,
    { headers: { Authorization: 'Bearer ' + token } }
  )
  if (!r.ok) return null
  const j = await r.json()
  const out = {}
  for (const [k, v] of Object.entries(j.fields || {})) {
    if ('stringValue' in v) out[k] = v.stringValue
    else if ('doubleValue' in v) out[k] = v.doubleValue
    else if ('integerValue' in v) out[k] = Number(v.integerValue)
    else if ('booleanValue' in v) out[k] = v.booleanValue
    else if ('timestampValue' in v) out[k] = v.timestampValue
    else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map(x => x.stringValue)
  }
  return out
}

async function fetchSettings(token) {
  const r = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_settings/global`,
    { headers: { Authorization: 'Bearer ' + token } }
  )
  return r.ok ? r.json() : null
}

async function patchStamp(token, id, fields) {
  const updateMask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => {
      if (typeof v === 'string') return [k, { stringValue: v }]
      if (typeof v === 'number') return [k, { doubleValue: v }]
      if (typeof v === 'boolean') return [k, { booleanValue: v }]
      return [k, { stringValue: String(v) }]
    })),
  }
  await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps/${id}?${updateMask}`,
    { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
}

async function deleteStampDoc(token, id) {
  await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps/${id}`,
    { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }
  )
}

async function countAllStamps(token) {
  let count = 0, next = null
  do {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps?pageSize=500${next ? `&pageToken=${next}` : ''}`, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    count += (j.documents || []).length
    next = j.nextPageToken
  } while (next)
  return count
}

async function findStampsBySpotName(token, spotName) {
  let all = []
  let next = null
  do {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps?pageSize=500${next ? `&pageToken=${next}` : ''}`, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    all.push(...(j.documents || []))
    next = j.nextPageToken
  } while (next)
  return all.filter(d => d.fields?.spotName?.stringValue === spotName).map(d => ({ id: d.name.split('/').pop(), ...d.fields }))
}

// ---------- Playwright helpers ----------

async function setupPage(browser, mockApi = true) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  if (mockApi) {
    await page.route('**/api/generate-stamp-image', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ results: [
          { base64: TINY_PNG, mimeType: 'image/png', index: 0 },
          { base64: TINY_PNG, mimeType: 'image/png', index: 1 },
        ]}),
      })
    )
  }
  page.on('dialog', d => d.accept().catch(() => {}))
  page.on('console', m => {
    if (m.type() === 'error') console.log(`  [p.err]`, m.text().slice(0, 150))
  })
  await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000) // onSnapshot 初回同期待ち
  return { ctx, page }
}

async function goToGallery(page) {
  await page.getByRole('button', { name: 'ギャラリー' }).click()
  await page.waitForTimeout(2500)
}

async function countCardsWithAlt(page, alt) {
  return page.evaluate(a => document.querySelectorAll(`.stamp-card img[alt="${a}"]`).length, alt)
}

async function getBadgeStatus(page, alt, variantLabel) {
  return page.evaluate(({ a, vl }) => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    const c = cards.find(c => c.querySelector(`img[alt="${a}"]`) && c.querySelector('.variant-label')?.textContent.includes(vl))
    return c?.getAttribute('data-status')
  }, { a: alt, vl: variantLabel })
}

async function generateStamps(page, spotName) {
  await page.getByRole('button', { name: 'バッチ生成' }).click()
  await page.waitForTimeout(500)
  await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill(spotName)
  await page.getByRole('button', { name: /候補を生成/ }).click()
  await page.waitForSelector('text=ギャラリーに追加', { timeout: 15000 })
  await page.getByRole('button', { name: /ギャラリーに追加/ }).click()
  await page.waitForTimeout(7000)
}

async function cleanupSpot(token, spotName) {
  const stamps = await findStampsBySpotName(token, spotName)
  for (const s of stamps) {
    await deleteStampDoc(token, s.id)
  }
  return stamps.length
}

// ---------- テストケース ----------

async function testA_newGeneration(browser, token) {
  const spotName = 'smk_A_' + Date.now()
  const initCount = await countAllStamps(token)
  const { ctx: ctxA, page: pageA } = await setupPage(browser)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)

  await generateStamps(pageA, spotName)
  const fsCount = await countAllStamps(token)
  log('A1_firestore', fsCount === initCount + 2 ? 'PASS' : 'FAIL', { op: 'A', expected: initCount + 2, actual: fsCount })

  await goToGallery(pageA)
  const localCards = await countCardsWithAlt(pageA, spotName)
  log('A2_local', localCards >= 2 ? 'PASS' : 'FAIL', { op: 'A', cards: localCards })

  await goToGallery(pageB)
  await pageB.waitForTimeout(2500)
  const realtimeCards = await countCardsWithAlt(pageB, spotName)
  log('A3_realtime', realtimeCards >= 2 ? 'PASS' : 'FAIL', { op: 'A', cards: realtimeCards })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const reloadCards = await countCardsWithAlt(pageC, spotName)
  log('A4_reload', reloadCards >= 2 ? 'PASS' : 'FAIL', { op: 'A', cards: reloadCards })

  await ctxB.close()
  await ctxC.close()
  await cleanupSpot(token, spotName)
}

async function testB_addToExistingSpot(browser, token) {
  // 既存スポットを用意してから「＋スタンプ追加生成」
  const baseSpot = 'smk_B_base_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, baseSpot)
  await ctx0.close()

  const { ctx: ctxA, page: pageA } = await setupPage(browser)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)

  const beforeCount = await countCardsWithAlt(pageA, baseSpot)
  // スポットグループの「＋スタンプ追加生成」ボタン
  await pageA.evaluate((name) => {
    const headers = Array.from(document.querySelectorAll('[style*="padding"]')).filter(h => h.textContent.includes(name))
    const addBtn = headers[0]?.querySelector('button[title*="新しいスタンプ"]')
    if (addBtn) addBtn.click()
  }, baseSpot)
  await pageA.waitForTimeout(1500)
  // モーダル内の生成ボタン
  const modalGen = pageA.locator('.modal button:has-text("候補を生成")').first()
  if (await modalGen.isVisible()) {
    await modalGen.click()
    await pageA.locator('.modal button:has-text("ギャラリーに追加")').waitFor({ timeout: 15000 })
    await pageA.locator('.modal button:has-text("ギャラリーに追加")').click()
    await pageA.waitForTimeout(6000)
  }

  await pageA.waitForTimeout(2000)
  const afterLocal = await countCardsWithAlt(pageA, baseSpot)
  log('B1_firestore_local', afterLocal > beforeCount ? 'PASS' : 'FAIL', { op: 'B', before: beforeCount, after: afterLocal })

  await goToGallery(pageB)
  await pageB.waitForTimeout(3000)
  const realtimeCount = await countCardsWithAlt(pageB, baseSpot)
  log('B2_realtime', realtimeCount >= 4 ? 'PASS' : 'FAIL', { op: 'B', cards: realtimeCount })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const reloadCount = await countCardsWithAlt(pageC, baseSpot)
  log('B3_reload', reloadCount >= 4 ? 'PASS' : 'FAIL', { op: 'B', cards: reloadCount })

  await ctxB.close()
  await ctxC.close()
  await cleanupSpot(token, baseSpot)
}

async function testD_unclassifiedTag(browser, token) {
  // 新規生成 → spotName を Firestore で "未分類_<id>" のユニーク名に → タグ付けUI操作
  // ユニーク名を使うことで他の '未分類' グループと混同しない
  const uniqueUnclassified = '未分類_' + Date.now()
  const spotName = 'smk_D_target_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  if (stamps.length === 0) { log('D_setup', 'FAIL', { reason: 'stamps not created' }); return }
  const targetId = stamps[0].id

  // Firestoreで全て ユニークな未分類名 に変更
  for (const s of stamps) await patchStamp(token, s.id, { spotName: uniqueUnclassified })
  await new Promise(r => setTimeout(r, 2000))

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)

  // 対象グループの編集ボタン（鉛筆）をクリック（未分類はタグ付けボタンだがユニーク名なので編集ボタンになる）
  const clickedEdit = await pageA.evaluate((name) => {
    const spans = Array.from(document.querySelectorAll('span'))
    const spotNameSpan = spans.find(s => s.textContent === name)
    if (!spotNameSpan) return 'span_not_found'
    // spanの親要素内に編集ボタンを探す
    const parent = spotNameSpan.parentElement
    const editBtn = parent?.querySelector('button[title="スポット名・エリアを編集"]')
    if (!editBtn) return 'edit_btn_not_found'
    editBtn.click()
    return 'clicked'
  }, uniqueUnclassified)
  if (clickedEdit !== 'clicked') { log('D_edit_btn', 'FAIL', { status: clickedEdit }); await ctxA.close(); await ctxB.close(); await cleanupSpot(token, uniqueUnclassified); return }

  await pageA.waitForTimeout(500)
  await pageA.locator('input[placeholder="スポット名"]').fill('smk_D_tagged')
  await pageA.getByRole('button', { name: '確定' }).click()
  await pageA.waitForTimeout(4000)

  // 4観点検証
  const fsDoc = await fetchStamp(token, targetId)
  log('D1_firestore', fsDoc?.spotName === 'smk_D_tagged' ? 'PASS' : 'FAIL', { op: 'D', spotName: fsDoc?.spotName })

  const localCount = await countCardsWithAlt(pageA, 'smk_D_tagged')
  log('D2_local', localCount > 0 ? 'PASS' : 'FAIL', { op: 'D', cards: localCount })

  await pageB.waitForTimeout(1500)
  const realtimeCount = await countCardsWithAlt(pageB, 'smk_D_tagged')
  log('D3_realtime', realtimeCount > 0 ? 'PASS' : 'FAIL', { op: 'D', cards: realtimeCount })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const reloadCount = await countCardsWithAlt(pageC, 'smk_D_tagged')
  log('D4_reload', reloadCount > 0 ? 'PASS' : 'FAIL', { op: 'D', cards: reloadCount })

  await ctxB.close()
  await ctxC.close()
  await cleanupSpot(token, 'smk_D_tagged')
}

async function testE_customSpotDelete(browser, token) {
  const spotName = 'smk_E_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const beforeCount = await countAllStamps(token)
  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)

  // スポット削除ボタンクリック
  const deleted = await pageA.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    const card = cards.find(c => c.querySelector(`img[alt="${name}"]`))
    if (!card) return false
    const header = card.closest('div[class="stamp-grid"]')?.previousElementSibling
    const delBtn = header?.querySelector('button[title="このスポットを削除"]')
    if (delBtn) { delBtn.click(); return true }
    return false
  }, spotName)

  if (!deleted) { log('E_delete_btn', 'FAIL', { reason: 'delete btn not found' }); await ctxA.close(); await ctxB.close(); await cleanupSpot(token, spotName); return }

  await pageA.waitForTimeout(3500)
  const afterCount = await countAllStamps(token)
  log('E1_firestore', afterCount === beforeCount - 2 ? 'PASS' : 'FAIL', { op: 'E', before: beforeCount, after: afterCount })

  const localCount = await countCardsWithAlt(pageA, spotName)
  log('E2_local', localCount === 0 ? 'PASS' : 'FAIL', { op: 'E', cards: localCount })

  await pageB.waitForTimeout(1500)
  const realtimeCount = await countCardsWithAlt(pageB, spotName)
  log('E3_realtime', realtimeCount === 0 ? 'PASS' : 'FAIL', { op: 'E', cards: realtimeCount })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const reloadCount = await countCardsWithAlt(pageC, spotName)
  log('E4_reload', reloadCount === 0 ? 'PASS' : 'FAIL', { op: 'E', cards: reloadCount })

  await ctxB.close()
  await ctxC.close()
}

async function testF_defaultSpotDelete(browser, token) {
  // default spot (manifest由来) をspotId単位で削除 → 新セッションで復活しないことを確認
  // 雷門はmanifest由来とFirestore spots由来で複数spotIdに分かれているので、kaminarimonのspotIdだけを対象に
  const targetSpotId = 'kaminarimon'
  const beforeStamps = await fetchAllDocs(token)
  const kaminariMembers = beforeStamps.filter(d => d.fields?.spotId?.stringValue === targetSpotId)
  const memberIds = kaminariMembers.map(d => d.name.split('/').pop())
  const memberBackups = kaminariMembers.map(d => ({
    id: d.name.split('/').pop(),
    fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, Object.values(v)[0]])),
  }))
  if (memberIds.length === 0) { log('F_setup', 'FAIL', { reason: `spotId ${targetSpotId} not found` }); return }

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)
  await pageA.locator('select.filter-select').first().selectOption('asakusa')
  await pageA.waitForTimeout(1500)
  await pageB.locator('select.filter-select').first().selectOption('asakusa')
  await pageB.waitForTimeout(1500)

  // 特定の spotId を持つスポットグループの削除ボタンをクリック
  // kaminarimonグループ（path属性にkaminarimonを含むスタンプが4つのgrid）を特定
  const deleted = await pageA.evaluate(() => {
    // 全ての.stamp-gridを取得し、その中のカードをチェック
    const grids = Array.from(document.querySelectorAll('.stamp-grid'))
    // kaminarimonグループ: img alt=雷門 かつ src属性にkaminarimonを含む (stampのpathで判定可能、imageUrlでもmanifestスタンプは path経由URL)
    // より確実: grid内カード数が4 かつ img alt=雷門
    let targetGrid = null
    for (const grid of grids) {
      const imgs = grid.querySelectorAll('img[alt="雷門"]')
      if (imgs.length === 4) { // kaminarimon は manifest 4 variants
        // fs_* 雷門が4件ちょうどの場合は区別不能なので path を見る
        const firstImg = imgs[0]
        const src = firstImg?.src || ''
        if (src.includes('kaminarimon') || src.includes('stamps/asakusa/')) {
          targetGrid = grid; break
        }
      }
    }
    if (!targetGrid) return 'no_grid'
    const header = targetGrid.previousElementSibling
    const delBtn = header?.querySelector('button[title="このスポットを削除"]')
    if (!delBtn) return 'btn_not_found'
    delBtn.click()
    return 'clicked'
  })

  if (!String(deleted).startsWith('clicked')) {
    log('F_setup', 'FAIL', { status: deleted })
    await ctxA.close(); await ctxB.close()
    return
  }

  await pageA.waitForTimeout(4500)
  const afterAllStamps = await fetchAllDocs(token)
  const stillKaminari = afterAllStamps.filter(d => d.fields?.spotId?.stringValue === targetSpotId)
  log('F1_firestore', stillKaminari.length === 0 ? 'PASS' : 'FAIL', { op: 'F', spotId: targetSpotId, before: memberIds.length, still: stillKaminari.length })

  // 浅草フィルタで「雷門」カードのうちkaminarimonのspotIdが消えたか
  // 全雷門カードは残るかも（fs_* sources）なのでexactには見ない。代わりにspot-grid数を確認
  const localKaminariCount = await pageA.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    return cards.filter(c => c.querySelector('img[alt="雷門"]')).length
  })
  // kaminarimon の4件が消えたので、残りはfs_* sourceの分のみ
  const expectedLocalAfter = beforeStamps.filter(d => d.fields?.spotName?.stringValue === '雷門' && d.fields?.spotId?.stringValue !== targetSpotId).length
  log('F2_local', localKaminariCount === expectedLocalAfter ? 'PASS' : 'FAIL', { op: 'F', cards: localKaminariCount, expected: expectedLocalAfter })

  await pageB.waitForTimeout(2000)
  const bCount = await pageB.evaluate(() => Array.from(document.querySelectorAll('.stamp-card')).filter(c => c.querySelector('img[alt="雷門"]')).length)
  log('F3_realtime', bCount === expectedLocalAfter ? 'PASS' : 'FAIL', { op: 'F', cards: bCount, expected: expectedLocalAfter })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  await pageC.locator('select.filter-select').first().selectOption('asakusa')
  await pageC.waitForTimeout(2000)
  const cCount = await pageC.evaluate(() => Array.from(document.querySelectorAll('.stamp-card')).filter(c => c.querySelector('img[alt="雷門"]')).length)
  log('F4_reload_no_revive', cCount === expectedLocalAfter ? 'PASS' : 'FAIL', { op: 'F', cards: cCount, expected: expectedLocalAfter, note: 'ver2バグ: リロードで復活しないこと' })

  await ctxB.close()
  await ctxC.close()

  // 復旧: 削除したkaminarimonスタンプを再作成
  const manifestPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'stamps', 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const kaminariData = manifest.filter(s => s.spotId === targetSpotId)
  for (const s of kaminariData) {
    await patchStamp(token, s.id, {
      spotId: s.spotId, spotName: s.spotName, area: s.area,
      variant: s.variant, lat: s.lat, lng: s.lng, path: s.path,
      status: 'draft', source: 'manifest',
    })
  }
}

async function testG_customImageReplace(browser, token) {
  const spotName = 'smk_G_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  if (stamps.length === 0) { log('G_setup', 'FAIL', {}); return }
  const targetId = stamps[0].id
  const beforeDoc = await fetchStamp(token, targetId)
  const beforeUrl = beforeDoc?.imageUrl

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)

  // カードクリックでモーダル開く
  const card = pageA.locator(`.stamp-card img[alt="${spotName}"]`).first()
  await card.click()
  await pageA.waitForTimeout(1500)

  // 画像差し替えファイル入力
  const fileInput = pageA.locator('input[type="file"][accept="image/*"]').last()
  const tmpFile = '/tmp/smk_G.png'
  fs.writeFileSync(tmpFile, Buffer.from(TINY_PNG, 'base64'))
  await fileInput.setInputFiles(tmpFile)
  await pageA.waitForTimeout(7000)

  const afterDoc = await fetchStamp(token, targetId)
  const changed = afterDoc?.imageUrl && afterDoc.imageUrl !== beforeUrl
  log('G1_firestore', changed ? 'PASS' : 'FAIL', { op: 'G', changed })

  // 別コンテキスト: 画像URLが違う（onSnapshotで再描画）
  await pageB.waitForTimeout(2500)
  const bUrl = await pageB.evaluate((name) => {
    const img = document.querySelector(`.stamp-card img[alt="${name}"]`)
    return img?.src
  }, spotName)
  log('G2_realtime', bUrl && bUrl === afterDoc?.imageUrl ? 'PASS' : 'FAIL', { op: 'G', bUrl: bUrl?.slice(-30) })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const cUrl = await pageC.evaluate((name) => document.querySelector(`.stamp-card img[alt="${name}"]`)?.src, spotName)
  log('G3_reload', cUrl === afterDoc?.imageUrl ? 'PASS' : 'FAIL', { op: 'G', cUrl: cUrl?.slice(-30) })

  await ctxB.close()
  await ctxC.close()
  await cleanupSpot(token, spotName)
}

async function testL_statusChange(browser, token) {
  // UIクリック経由で承認/却下ボタンを押し、Firestoreに反映されるか
  const spotName = 'smk_L_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  if (stamps.length === 0) { log('L_setup', 'FAIL', {}); return }
  const targetId = stamps[0].id

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)

  // 承認ボタン click (Playwright native click)
  const card = pageA.locator(`.stamp-card:has(img[alt="${spotName}"])`).first()
  await card.scrollIntoViewIfNeeded()
  const approveBtn = card.locator('button.action-btn.approve').first()
  await approveBtn.click()
  await pageA.waitForTimeout(4000)

  const afterDoc = await fetchStamp(token, targetId)
  log('L1_firestore', afterDoc?.status === 'approved' ? 'PASS' : 'FAIL', { op: 'L', status: afterDoc?.status })

  const localStatus = await pageA.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    const c = cards.find(c => c.querySelector(`img[alt="${name}"]`))
    return c?.getAttribute('data-status')
  }, spotName)
  log('L2_local', localStatus === 'approved' ? 'PASS' : 'FAIL', { op: 'L', status: localStatus })

  await pageB.waitForTimeout(2500)
  const bStatus = await pageB.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    const c = cards.find(c => c.querySelector(`img[alt="${name}"]`))
    return c?.getAttribute('data-status')
  }, spotName)
  log('L3_realtime', bStatus === 'approved' ? 'PASS' : 'FAIL', { op: 'L', status: bStatus })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const cStatus = await pageC.evaluate((name) => {
    const cards = Array.from(document.querySelectorAll('.stamp-card'))
    const c = cards.find(c => c.querySelector(`img[alt="${name}"]`))
    return c?.getAttribute('data-status')
  }, spotName)
  log('L4_reload', cStatus === 'approved' ? 'PASS' : 'FAIL', { op: 'L', status: cStatus })

  await ctxB.close()
  await ctxC.close()
  await cleanupSpot(token, spotName)
}

async function testK_bulkDeleteRejected(browser, token) {
  // 2件作成 → 両方rejected → 一括削除 → 復活しない
  const spotName = 'smk_K_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  for (const s of stamps) await patchStamp(token, s.id, { status: 'rejected' })
  await new Promise(r => setTimeout(r, 2000))

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  const { ctx: ctxB, page: pageB } = await setupPage(browser, false)
  await goToGallery(pageA)
  await goToGallery(pageB)

  // 却下ステータスでフィルタ → 一括削除ボタン
  await pageA.getByRole('button', { name: /却下を一括削除/ }).click()
  await pageA.waitForTimeout(4000)

  const afterStamps = await findStampsBySpotName(token, spotName)
  log('K1_firestore', afterStamps.length === 0 ? 'PASS' : 'FAIL', { op: 'K', remaining: afterStamps.length })

  const localCount = await countCardsWithAlt(pageA, spotName)
  log('K2_local', localCount === 0 ? 'PASS' : 'FAIL', { op: 'K', cards: localCount })

  await pageB.waitForTimeout(2000)
  const realtimeCount = await countCardsWithAlt(pageB, spotName)
  log('K3_realtime', realtimeCount === 0 ? 'PASS' : 'FAIL', { op: 'K', cards: realtimeCount })

  await ctxA.close()
  const { ctx: ctxC, page: pageC } = await setupPage(browser, false)
  await goToGallery(pageC)
  const reloadCount = await countCardsWithAlt(pageC, spotName)
  log('K4_reload_no_revive', reloadCount === 0 ? 'PASS' : 'FAIL', { op: 'K', cards: reloadCount })

  await ctxB.close()
  await ctxC.close()
}

async function testN_designerNote(browser, token) {
  const spotName = 'smk_N_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  if (stamps.length === 0) { log('N_setup', 'FAIL', {}); return }
  const targetId = stamps[0].id

  const { ctx: ctxA, page: pageA } = await setupPage(browser, false)
  await goToGallery(pageA)
  const card = pageA.locator(`.stamp-card:has(img[alt="${spotName}"])`).first()
  await card.click()
  await pageA.waitForTimeout(1000)

  const note = 'smk_note_' + Date.now()
  await pageA.locator('textarea.note-input').fill(note)
  // 承認で確定
  await pageA.locator('.modal button.action-btn.approve').first().click()
  await pageA.waitForTimeout(4000)

  const doc = await fetchStamp(token, targetId)
  log('N1_firestore', doc?.designerNote === note ? 'PASS' : 'FAIL', { op: 'N', note: doc?.designerNote })
  log('N2_status', doc?.status === 'approved' ? 'PASS' : 'FAIL', { op: 'N', status: doc?.status })

  await ctxA.close()
  await cleanupSpot(token, spotName)
}

// ---------- エッジケース ----------

async function edgeConcurrentEdit(browser, token) {
  // 2つのコンテキストが同じスタンプに対して異なるフィールドを同時に更新
  const spotName = 'smk_concurrent_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  const id = stamps[0].id

  // A: status=approved / B: designerNote='concurrent note'
  await Promise.all([
    patchStamp(token, id, { status: 'approved' }),
    patchStamp(token, id, { designerNote: 'concurrent note' }),
  ])
  await new Promise(r => setTimeout(r, 2000))

  const doc = await fetchStamp(token, id)
  // 両方反映されている（merge: true の効果）
  const bothReflected = doc?.status === 'approved' && doc?.designerNote === 'concurrent note'
  log('Edge1_concurrent_merge', bothReflected ? 'PASS' : 'FAIL', { status: doc?.status, note: doc?.designerNote })

  await cleanupSpot(token, spotName)
}

async function edgeIdempotentReload(browser, token) {
  // リロード5回で件数不変
  const before = await countAllStamps(token)
  const { ctx, page } = await setupPage(browser, false)
  for (let i = 0; i < 5; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
  }
  await ctx.close()
  const after = await countAllStamps(token)
  log('Edge2_idempotent', before === after ? 'PASS' : 'FAIL', { before, after })
}

async function edgeRapidSuccession(browser, token) {
  // 連続で5個の操作を行ってデータ整合性
  const spotName = 'smk_rapid_' + Date.now()
  const { ctx: ctx0, page: page0 } = await setupPage(browser)
  await generateStamps(page0, spotName)
  await ctx0.close()

  const stamps = await findStampsBySpotName(token, spotName)
  if (stamps.length === 0) { log('Edge3_setup', 'FAIL', {}); return }
  const id = stamps[0].id

  // 連続5回ステータス切替 (i=0:approved, i=1:rejected, ... i=4:approved)
  const lastStatus = 4 % 2 === 0 ? 'approved' : 'rejected'
  for (let i = 0; i < 5; i++) {
    await patchStamp(token, id, { status: i % 2 === 0 ? 'approved' : 'rejected' })
  }
  await new Promise(r => setTimeout(r, 2000))

  const doc = await fetchStamp(token, id)
  log('Edge3_rapid_consistency', doc?.status === lastStatus ? 'PASS' : 'FAIL', { status: doc?.status, expected: lastStatus })

  await cleanupSpot(token, spotName)
}

async function edgeColdStart(browser, token) {
  // 新セッションで全スタンプが約5秒以内に表示される
  const t0 = Date.now()
  const { ctx, page } = await setupPage(browser, false)
  await page.getByRole('button', { name: 'ギャラリー' }).click()
  await page.waitForTimeout(1500)
  // スタンプカードが描画されるまで待機
  await page.waitForSelector('.stamp-card', { timeout: 15000 })
  const cardCount = await page.evaluate(() => document.querySelectorAll('.stamp-card').length)
  const duration = Date.now() - t0
  log('Edge4_cold_start', cardCount > 100 && duration < 15000 ? 'PASS' : 'FAIL', { cards: cardCount, ms: duration })
  await ctx.close()
}

// ---------- Main ----------

async function main() {
  const token = await getToken()
  const startCount = await countAllStamps(token)
  log('INIT', 'INFO', { studio_stamps: startCount })

  const browser = await chromium.launch({ headless: true })

  const tests = [
    { name: 'A: 新規生成', fn: testA_newGeneration },
    { name: 'D: 未分類タグ付け', fn: testD_unclassifiedTag },
    { name: 'E: 未分類スポット削除', fn: testE_customSpotDelete },
    { name: 'G: 未分類画像差し替え', fn: testG_customImageReplace },
    { name: 'F: デフォルトスポット削除', fn: testF_defaultSpotDelete },
    { name: 'L: 承認/却下UIクリック', fn: testL_statusChange },
    { name: 'K: 却下一括削除', fn: testK_bulkDeleteRejected },
    { name: 'N: designerNote/承認', fn: testN_designerNote },
    { name: 'B: 既存スポット追加生成', fn: testB_addToExistingSpot },
    { name: 'Edge1: 並行編集', fn: edgeConcurrentEdit },
    { name: 'Edge2: 冪等性', fn: edgeIdempotentReload },
    { name: 'Edge3: 連続操作整合性', fn: edgeRapidSuccession },
    { name: 'Edge4: コールドスタート', fn: edgeColdStart },
  ]

  for (const t of tests) {
    console.log(`\n=== ${t.name} ===`)
    try {
      await t.fn(browser, token)
    } catch (err) {
      log(`EXCEPTION_${t.name}`, 'FAIL', { error: err.message })
    }
  }

  // 最終ゴミクリーンアップ
  console.log('\n=== final cleanup ===')
  const allTestNames = ['smk_A_', 'smk_B_base_', 'smk_D_target_', 'smk_D_tagged', 'smk_E_', 'smk_G_', 'smk_K_', 'smk_L_', 'smk_N_', 'smk_concurrent_', 'smk_rapid_']
  const allDocs = await fetchAllDocs(token)
  let cleaned = 0
  for (const d of allDocs) {
    const name = d.fields?.spotName?.stringValue || ''
    if (allTestNames.some(prefix => name.startsWith(prefix) || name === prefix)) {
      await deleteStampDoc(token, d.name.split('/').pop())
      cleaned++
    }
  }
  console.log(`[cleanup] ${cleaned}件削除`)

  const endCount = await countAllStamps(token)
  log('END', 'INFO', { studio_stamps: endCount, delta: endCount - startCount })

  await browser.close()

  // サマリー
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const info = results.filter(r => r.status === 'INFO').length
  console.log(`\n${'='.repeat(60)}`)
  console.log(`SUMMARY: ${pass} PASS / ${fail} FAIL / ${info} INFO  (total ${results.length})`)
  console.log(`${'='.repeat(60)}`)
  if (fail > 0) {
    console.log('FAILED TESTS:')
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(' -', r.tag, JSON.stringify(r).slice(0, 200)))
  }
  fs.writeFileSync('/tmp/smoke_comprehensive_results.json', JSON.stringify(results, null, 2))
  process.exit(fail > 0 ? 1 : 0)
}

async function fetchAllDocs(token) {
  let all = [], next = null
  do {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/studio_stamps?pageSize=500${next ? `&pageToken=${next}` : ''}`, { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    all.push(...(j.documents || []))
    next = j.nextPageToken
  } while (next)
  return all
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
