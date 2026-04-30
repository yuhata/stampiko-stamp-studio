import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import AreaRules from '../components/AreaRules'
import { CANONICAL_AREAS } from '../config/areas'

// localStorage モック
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(k => store[k] ?? null),
    setItem: vi.fn((k, v) => { store[k] = v }),
    removeItem: vi.fn(k => { delete store[k] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('AreaRules - 全25エリア表示', () => {
  it('デフォルト設定で25エリアすべてのラベルが表示される', () => {
    render(<AreaRules stamps={[]} areas={[]} />)
    // 各エリアは「〜エリア」見出しとして h2 に出る
    for (const a of CANONICAL_AREAS) {
      const label = `${a.name}エリア`
      // getAllByText: 品質基準など他の要素と衝突しないよう includes で検索
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })
})

describe('AreaRules - パレット編集バグ回帰テスト', () => {
  it('パレットを編集してもエリア名（h2）が消えない', () => {
    render(<AreaRules stamps={[]} areas={[]} />)

    // 渋谷エリアの section を特定
    const shibuyaHeading = screen.getAllByText('渋谷エリア')[0]
    const section = shibuyaHeading.closest('.area-section')
    expect(section).toBeTruthy()

    // 「編集」ボタンを押す
    const editBtn = within(section).getByText('編集')
    fireEvent.click(editBtn)

    // パレット入力欄を編集
    const paletteInput = within(section).getByDisplayValue(/^#/)
    fireEvent.change(paletteInput, { target: { value: '#111111, #222222' } })

    // h2 はまだ「渋谷エリア」のまま
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('渋谷エリア')

    // 完了して閉じる
    fireEvent.click(within(section).getByText('完了'))
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('渋谷エリア')
  })

  it('パレット末尾にカンマを入力できる（入力中はカンマが消えない）', () => {
    render(<AreaRules stamps={[]} areas={[]} />)

    // 渋谷エリアを編集モードへ
    const shibuyaHeading = screen.getAllByText('渋谷エリア')[0]
    const section = shibuyaHeading.closest('.area-section')
    fireEvent.click(within(section).getByText('編集'))

    // パレット入力欄を取得（最初の色コードで始まる value を持つ input）
    const paletteInput = within(section).getByDisplayValue(/^#/)

    // 末尾にカンマを追加入力
    const valueWithTrailingComma = paletteInput.value + ','
    fireEvent.change(paletteInput, { target: { value: valueWithTrailingComma } })

    // 入力中は末尾カンマが保持されること（即座に消えない）
    expect(paletteInput.value).toBe(valueWithTrailingComma)
  })

  it('パレット末尾カンマ入力後に blur するとパレット配列が正しく確定される', () => {
    render(<AreaRules stamps={[]} areas={[]} />)

    const shibuyaHeading = screen.getAllByText('渋谷エリア')[0]
    const section = shibuyaHeading.closest('.area-section')
    fireEvent.click(within(section).getByText('編集'))

    const paletteInput = within(section).getByDisplayValue(/^#/)

    // 新しい色を末尾カンマ付きで入力
    fireEvent.change(paletteInput, { target: { value: '#aabbcc, #ddeeff,' } })

    // blur でコミット
    fireEvent.blur(paletteInput)

    // コミット後は trailing カンマが除去された正規形（', ' 区切り）になること
    expect(paletteInput.value).toBe('#aabbcc, #ddeeff')

    // 完了後も h2 は維持される
    fireEvent.click(within(section).getByText('完了'))
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('渋谷エリア')
  })

  it('未登録エリア（stampsから来たもの）を編集してもラベルが維持される', () => {
    // areas prop に DEFAULT に無いキーを渡す
    render(<AreaRules stamps={[]} areas={['mystery_area']} />)
    const heading = screen.getByText('mystery_area')
    const section = heading.closest('.area-section')

    fireEvent.click(within(section).getByText('編集'))

    const styleInput = within(section).getByDisplayValue('-')
    fireEvent.change(styleInput, { target: { value: '円形・新スタイル' } })

    // ラベルが消えていないこと
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('mystery_area')
  })
})

describe('AreaRules - 品質基準', () => {
  it('デフォルト品質基準（7行）が表示される', () => {
    render(<AreaRules stamps={[]} areas={[]} />)
    expect(screen.getByText('ランドマーク認識性')).toBeInTheDocument()
    expect(screen.getByText('インクテクスチャ')).toBeInTheDocument()
    expect(screen.getByText('透過品質')).toBeInTheDocument()
  })

  it('基準を追加できる', () => {
    render(<AreaRules stamps={[]} areas={[]} />)
    fireEvent.click(screen.getByText('+ 基準を追加'))
    fireEvent.change(screen.getByPlaceholderText('基準名'), { target: { value: 'テスト基準' } })
    fireEvent.change(screen.getByPlaceholderText('OK条件'), { target: { value: 'OK' } })
    fireEvent.change(screen.getByPlaceholderText('NG条件'), { target: { value: 'NG' } })
    fireEvent.click(screen.getByText('追加'))
    expect(screen.getByText('テスト基準')).toBeInTheDocument()
  })
})
