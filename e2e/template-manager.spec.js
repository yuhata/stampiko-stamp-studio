import { test, expect } from '@playwright/test'
import { attachConsoleErrorCollector, clearStudioStorage, gotoTab, gotoStudio } from './_helpers.js'

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.describe('テンプレート管理', () => {
  test.beforeEach(async ({ page }) => {
    await clearStudioStorage(page)
  })

  test('テンプレートタブに16カテゴリカードが表示される', async ({ page }) => {
    const errors = attachConsoleErrorCollector(page)
    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByText('テンプレートスタンプ管理')).toBeVisible({ timeout: 5000 })
    // 16カテゴリ分の「差し替え」ボタンが存在する
    await expect(page.getByRole('button', { name: /差し替え/ })).toHaveCount(16, { timeout: 8000 })
    expect(errors).toEqual([])
  })

  test('差し替えボタンでモーダルが開きGeminiモードが表示される', async ({ page }) => {
    const errors = attachConsoleErrorCollector(page)
    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByRole('button', { name: /差し替え/ }).first()).toBeVisible({ timeout: 8000 })

    await page.getByRole('button', { name: /差し替え/ }).first().click()

    // モーダルが開く（heading限定でpromt template編集と区別）
    await expect(page.getByRole('heading', { name: /テンプレート編集/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Gemini で生成/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /ローカルからアップロード/ })).toBeVisible()
    await expect(page.locator('textarea').first()).toBeVisible()

    // 生成ボタン（「N枚生成」）が表示される
    await expect(page.getByRole('button', { name: /枚生成/ })).toBeVisible()

    expect(errors).toEqual([])
  })

  // 回帰: CORS修正後の正常生成フロー（APIモック）
  test('Gemini生成フローが完走し候補画像が表示される', async ({ page }) => {
    await page.route('**/api/generate-stamp-image', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { base64: TINY_PNG, mimeType: 'image/png', index: 0 },
            { base64: TINY_PNG, mimeType: 'image/png', index: 1 },
          ],
        }),
      })
    )

    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByRole('button', { name: /差し替え/ }).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /差し替え/ }).first().click()

    await expect(page.getByRole('button', { name: /枚生成/ })).toBeVisible()
    await page.getByRole('button', { name: /枚生成/ }).click()

    // 生成完了 → 候補画像が表示される（alt="candidate"）
    await expect(page.locator('img[alt="candidate"]').first()).toBeVisible({ timeout: 15000 })
    // 採用ボタンが出現する（候補未選択時は「候補を選択してください」）
    await expect(page.getByRole('button', { name: /候補を選択|このデザインを採用/ })).toBeVisible({ timeout: 10000 })
  })

  // 回帰: Failed to fetch（CORSエラー等）時にエラー表示 + ボタン再活性化
  test('fetch失敗時に生成エラーが表示されボタンが再活性化する', async ({ page }) => {
    await page.route('**/api/generate-stamp-image', route => route.abort('failed'))
    page.on('dialog', d => d.dismiss().catch(() => {}))

    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByRole('button', { name: /差し替え/ }).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /差し替え/ }).first().click()

    await expect(page.getByRole('button', { name: /枚生成/ })).toBeVisible()
    await page.getByRole('button', { name: /枚生成/ }).click()

    // エラーメッセージが表示される
    await expect(page.getByText(/生成エラー/)).toBeVisible({ timeout: 10000 })
    // ボタンが再活性化する（generating状態が固まらない）
    await expect(page.getByRole('button', { name: /枚生成/ })).toBeEnabled({ timeout: 5000 })
  })

  // 回帰: API 500 時もエラー表示 + ボタン再活性化
  test('API 500 エラー時にエラーが表示されボタンが再活性化する', async ({ page }) => {
    await page.route('**/api/generate-stamp-image', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal error' }) })
    )
    page.on('dialog', d => d.dismiss().catch(() => {}))

    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByRole('button', { name: /差し替え/ }).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /差し替え/ }).first().click()

    await page.getByRole('button', { name: /枚生成/ }).click()

    await expect(page.getByText(/生成エラー/)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /枚生成/ })).toBeEnabled({ timeout: 5000 })
  })

  test('×ボタンでモーダルが閉じる', async ({ page }) => {
    await gotoStudio(page)
    await gotoTab(page, 'テンプレート')
    await expect(page.getByRole('button', { name: /差し替え/ }).first()).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: /差し替え/ }).first().click()
    await expect(page.getByRole('heading', { name: /テンプレート編集/ })).toBeVisible()

    // 閉じるボタンは ✕ (U+2715)
    await page.locator('button', { hasText: '✕' }).click()
    await expect(page.getByRole('heading', { name: /テンプレート編集/ })).not.toBeVisible({ timeout: 3000 })
  })
})
