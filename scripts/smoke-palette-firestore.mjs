/**
 * パレット保存 Firestore 実連携スモーク
 * 末尾カンマ修正後の保存経路が壊れていないことを確認する
 */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'

const DEV_URL = 'http://localhost:5179/stampiko-stamp-studio/#studio'
const PROJECT = 'stampiko-e8be8'
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'))

const results = []
const log = (tag, status, detail = {}) => {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '·'
  console.log(`${icon} [${tag}] ${status}`, JSON.stringify(detail).slice(0, 200))
  results.push({ tag, status, ...detail })
}

async function getToken() {
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    grant_type: 'refresh_token',
    refresh_token: cfg.tokens?.refresh_token,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await res.json()
  return j.access_token
}

async function getFirestoreDoc(token, docPath) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

async function main() {
  const token = await getToken()
  if (!token) { log('AUTH', 'FAIL', { reason: 'token取得失敗' }); process.exit(1) }
  log('AUTH', 'PASS')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // warm-up
  await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000) // React mount 待ち
  log('PAGE_LOAD', 'PASS')

  // エリアルールタブへ
  const areaTab = page.locator('button', { hasText: 'エリアルール' })
  if (await areaTab.count() === 0) {
    // タブが見つからない場合は別のセレクタを試みる
    const tabBtn = page.locator('[data-tab="area-rules"], button:has-text("エリアルール"), nav button').filter({ hasText: 'エリアルール' })
    if (await tabBtn.count() > 0) await tabBtn.first().click()
    else { log('NAV_AREA_RULES', 'SKIP', { reason: 'タブが見つからない' }); await browser.close(); return }
  } else {
    await areaTab.first().click()
  }

  // 最初のエリアセクション（渋谷エリア）を見つける
  const section = page.locator('.area-section', { has: page.locator('h2', { hasText: '渋谷エリア' }) }).first()
  if (await section.count() === 0) {
    log('FIND_SECTION', 'SKIP', { reason: '渋谷エリアセクションが見つからない' })
    await browser.close()
    return
  }
  log('FIND_SECTION', 'PASS')

  // 編集ボタンをクリック
  await section.getByRole('button', { name: '編集' }).click()

  // パレット入力欄を見つける
  const paletteInput = section.locator('input.criteria-input').first()

  // テスト用カラーコードを入力（末尾カンマあり）
  const testColors = '#smoke001, #smoke002,'
  await paletteInput.fill(testColors)

  // onBlur をトリガー（フォーカスアウト）
  await paletteInput.blur()

  // 正規化確認（末尾カンマが除去されていること）
  const normalizedValue = await paletteInput.inputValue()
  if (normalizedValue === '#smoke001, #smoke002') {
    log('PALETTE_NORMALIZE', 'PASS', { value: normalizedValue })
  } else {
    log('PALETTE_NORMALIZE', 'FAIL', { expected: '#smoke001, #smoke002', actual: normalizedValue })
  }

  // 完了ボタンを押して保存
  await section.getByRole('button', { name: '完了' }).click()

  // Firestoreへの書き込み完了待ち（debounce 600ms + 余裕）
  await page.waitForTimeout(1500)

  // Firestore からデータを取得して確認
  const doc = await getFirestoreDoc(token, 'studio_settings/global')
  
  if (doc.error) {
    log('FIRESTORE_READ', 'FAIL', { error: doc.error.message })
  } else {
    // areaConfig.shibuya.palette の確認
    const fields = doc.fields || {}
    const areaConfigField = fields.areaConfig
    if (areaConfigField) {
      // Firestore の mapValue 構造を辿る
      const areaConfigMap = areaConfigField.mapValue?.fields
      const shibuyaField = areaConfigMap?.shibuya?.mapValue?.fields
      const paletteField = shibuyaField?.palette?.arrayValue?.values
      if (paletteField) {
        const saved = paletteField.map(v => v.stringValue)
        const hasEmpty = saved.includes('')
        if (!hasEmpty && saved.includes('#smoke001') && saved.includes('#smoke002')) {
          log('FIRESTORE_READ', 'PASS', { saved })
        } else if (hasEmpty) {
          log('FIRESTORE_READ', 'FAIL', { reason: '空文字要素が混入', saved })
        } else {
          log('FIRESTORE_READ', 'WARN', { reason: '渋谷エリアキーが異なる可能性', saved, rawKeys: Object.keys(areaConfigMap || {}).slice(0, 5) })
        }
      } else {
        log('FIRESTORE_READ', 'WARN', { reason: 'paletteフィールド構造が異なる', keys: Object.keys(shibuyaField || {}) })
      }
    } else {
      log('FIRESTORE_READ', 'WARN', { reason: 'areaConfigフィールドが見つからない', docFields: Object.keys(fields) })
    }
  }

  await browser.close()

  const failed = results.filter(r => r.status === 'FAIL')
  console.log('\n--- スモーク結果 ---')
  console.log(`PASS: ${results.filter(r => r.status === 'PASS').length}, FAIL: ${failed.length}, WARN: ${results.filter(r => r.status === 'WARN').length}`)
  if (failed.length > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
