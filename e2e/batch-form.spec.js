import { test, expect } from '@playwright/test'
import { attachConsoleErrorCollector, clearStudioStorage, gotoTab, gotoStudio } from './_helpers.js'

test.describe('バッチ生成（BatchForm）', () => {
  test.beforeEach(async ({ page }) => {
    await clearStudioStorage(page)
  })

  test('エリアセレクトに25件の正式エリアが表示される', async ({ page }) => {
    const errors = attachConsoleErrorCollector(page)
    await gotoStudio(page)
    await gotoTab(page, 'バッチ生成')

    // 「エリア」ラベル直後の select
    const areaSelect = page.locator('label:has-text("エリア") + select').first()
    await expect(areaSelect).toBeVisible()
    const count = await areaSelect.locator('option').count()
    expect(count).toBe(25)

    // 池袋が option に含まれる
    const ikebukuroOption = areaSelect.locator('option', { hasText: '池袋' })
    await expect(ikebukuroOption).toHaveCount(1)

    expect(errors).toEqual([])
  })

  test('非デフォルトエリア（池袋）を選択して値が反映される', async ({ page }) => {
    await gotoStudio(page)
    await gotoTab(page, 'バッチ生成')

    const areaSelect = page.locator('label:has-text("エリア") + select').first()
    await areaSelect.selectOption('ikebukuro')
    await expect(areaSelect).toHaveValue('ikebukuro')

    // スポット名入力も反映される
    await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill('サンシャイン60')
    await expect(page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点')).toHaveValue('サンシャイン60')

    // 生成ボタンが enable されている
    await expect(page.getByRole('button', { name: /候補を生成/ })).toBeEnabled()
  })

  // 回帰: APIをモックして「クリック→生成中→生成完了→ボタン再活性」を完走させる
  test('生成ボタンクリックで生成フローが完走しボタンが再活性化する', async ({ page }) => {
    // 1x1 PNG（赤）の base64
    const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
    await gotoTab(page, 'バッチ生成')
    await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill('テスト雷門')

    const btn = page.getByRole('button', { name: /候補を生成/ })
    await expect(btn).toBeEnabled()
    await btn.click()

    // 生成完了 → ボタンが「N候補を生成」表示に戻る（10秒以内）
    await expect(page.getByRole('button', { name: /\d+候補を生成/ })).toBeEnabled({ timeout: 10000 })

    // 結果カードが表示される
    await expect(page.getByText(/生成結果/)).toBeVisible()
    await expect(page.getByRole('button', { name: /ギャラリーに追加/ })).toBeVisible()
  })

  // 新機能: 生成後「同じ設定でもう N 枚生成」ボタンで結果がappendされる
  test('追加生成ボタンで既存結果にappendされる', async ({ page }) => {
    const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    let callCount = 0
    await page.route('**/api/generate-stamp-image', route => {
      callCount++
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { base64: TINY_PNG, mimeType: 'image/png', index: 0 },
            { base64: TINY_PNG, mimeType: 'image/png', index: 1 },
          ],
        }),
      })
    })

    await gotoStudio(page)
    await gotoTab(page, 'バッチ生成')
    await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill('テスト')

    // デフォルトcount=2 で初回生成
    await page.getByRole('button', { name: /2候補を生成/ }).click()
    await expect(page.getByText(/生成結果 \(2\/2\)/)).toBeVisible({ timeout: 10000 })

    // 追加生成ボタンが見える
    const addMoreBtn = page.getByRole('button', { name: /同じ設定でもう2枚生成/ })
    await expect(addMoreBtn).toBeVisible()
    await addMoreBtn.click()

    // appendされて 4/4 に
    await expect(page.getByText(/生成結果 \(4\/4\)/)).toBeVisible({ timeout: 10000 })
    expect(callCount).toBe(2)
  })

  // 回帰: APIエラー時もボタンが再活性化する（generating状態が固まらない）
  test('API失敗時にも生成ボタンが再活性化する', async ({ page }) => {
    await page.route('**/api/generate-stamp-image', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'mock failure' }) })
    )
    page.on('dialog', d => d.dismiss().catch(() => {}))

    await gotoStudio(page)
    await gotoTab(page, 'バッチ生成')
    await page.getByPlaceholder('例: 雷門、渋谷スクランブル交差点').fill('テスト')

    const btn = page.getByRole('button', { name: /候補を生成/ })
    await btn.click()

    // 失敗後もボタンは再活性化（5秒以内）
    await expect(page.getByRole('button', { name: /\d+候補を生成/ })).toBeEnabled({ timeout: 5000 })
  })
})
