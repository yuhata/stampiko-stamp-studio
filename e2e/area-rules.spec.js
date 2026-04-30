import { test, expect } from '@playwright/test'
import { attachConsoleErrorCollector, clearStudioStorage, seedLegacyAreas, gotoTab, gotoStudio } from './_helpers.js'

// AreaRules の「編集→完了でラベルが消える」回帰テスト

async function openAreaRules(page) {
  await gotoStudio(page)
  await gotoTab(page, 'エリアルール')
}

async function getAreaSection(page, labelText) {
  // h2 に該当ラベルを含む .area-section
  return page.locator('.area-section', { has: page.locator('h2', { hasText: labelText }) }).first()
}

test.describe('AreaRules パレット編集後の regression', () => {
  test.beforeEach(async ({ page }) => {
    await clearStudioStorage(page)
  })

  for (const [label, newColor] of [
    ['渋谷エリア', '#123456'],
    ['池袋エリア', '#abcdef'],
    ['六本木・麻布エリア', '#ff00aa'],
  ]) {
    test(`${label}: 編集→完了でラベルが消えない`, async ({ page }) => {
      const errors = attachConsoleErrorCollector(page)
      await openAreaRules(page)

      const section = await getAreaSection(page, label)
      await expect(section).toBeVisible()
      await expect(section.locator('h2', { hasText: label })).toBeVisible()

      // 編集ボタン
      await section.getByRole('button', { name: '編集' }).click()

      // パレット入力を差し替え
      const paletteInput = section.locator('input.criteria-input').first()
      await paletteInput.fill(newColor)

      // 完了ボタン
      await section.getByRole('button', { name: '完了' }).click()

      // h2 は依然として表示されている
      const h2 = section.locator('h2', { hasText: label })
      await expect(h2).toBeVisible()

      // パレットに新しい色が反映されている
      await expect(section.locator('.area-palette')).toContainText(newColor)

      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})

test.describe('localStorage マイグレーション（旧14エリア→25エリア）', () => {
  test('旧形式がseedされていても25エリア全てが描画される', async ({ page }) => {
    await clearStudioStorage(page)
    await seedLegacyAreas(page)
    await openAreaRules(page)

    const h2s = page.locator('.area-section h2')
    // 「品質基準チェックリスト」の h2 も1つあるので 25 + 1
    const count = await h2s.count()
    expect(count).toBeGreaterThanOrEqual(26)

    // 正式マスターにしか存在しないエリアが表示されている
    await expect(page.locator('h2', { hasText: 'お台場・豊洲エリア' })).toBeVisible()
    await expect(page.locator('h2', { hasText: '品川エリア' })).toBeVisible()
  })
})

test.describe('パレット末尾カンマ入力バグ回帰防止', () => {
  test('末尾にカンマを打っても入力値が維持される', async ({ page }) => {
    const errors = attachConsoleErrorCollector(page)
    await clearStudioStorage(page)
    await openAreaRules(page)

    const section = await getAreaSection(page, '渋谷エリア')
    await section.getByRole('button', { name: '編集' }).click()

    const paletteInput = section.locator('input.criteria-input').first()
    // 既存値をクリアしてカンマ末尾の文字列を入力
    await paletteInput.fill('#ff0000, #00ff00,')

    // フォーカスを外す前の時点で末尾カンマが残っているか確認
    await expect(paletteInput).toHaveValue('#ff0000, #00ff00,')

    // blur（完了ボタンをクリック → blur が先に発火）
    await section.getByRole('button', { name: '完了' }).click()

    // blur 後: parse されて 2色のスウォッチが表示される
    await expect(section.locator('.area-palette')).toContainText('#ff0000')
    await expect(section.locator('.area-palette')).toContainText('#00ff00')

    // 再度編集を開くと正規化済みの値が表示される
    await section.getByRole('button', { name: '編集' }).click()
    const paletteInput2 = section.locator('input.criteria-input').first()
    await expect(paletteInput2).toHaveValue('#ff0000, #00ff00')

    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('クロスタブ状態保持', () => {
  test('エリア編集 → 他タブへ → 戻ると編集内容が保持される', async ({ page }) => {
    await clearStudioStorage(page)
    await openAreaRules(page)

    const section = await getAreaSection(page, '渋谷エリア')
    await section.getByRole('button', { name: '編集' }).click()

    const descInput = section.locator('input.criteria-input').nth(2)
    await descInput.fill('E2E テスト説明')
    await section.getByRole('button', { name: '完了' }).click()

    // 他タブへ
    await gotoTab(page, 'バッチ生成')
    await expect(page.locator('label:has-text("エリア")').first()).toBeVisible()

    // 戻る
    await gotoTab(page, 'エリアルール')
    const section2 = await getAreaSection(page, '渋谷エリア')
    await expect(section2).toContainText('E2E テスト説明')
  })
})
