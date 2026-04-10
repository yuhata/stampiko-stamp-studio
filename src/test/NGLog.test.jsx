import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NGLog from '../components/NGLog'
import { DEFAULT_PROMPT, STORAGE_KEYS } from '../config/promptDefaults'

// localStorage モック
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(key => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = val }),
    removeItem: vi.fn(key => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// alertとconfirmのモック
global.alert = vi.fn()
global.confirm = vi.fn()

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

const makeNgReason = (overrides = {}) => ({
  id: Date.now(),
  createdAt: new Date().toISOString(),
  stampId: 'stamp_1',
  spotName: '雷門',
  area: 'asakusa',
  reason: 'テキスト混入',
  category: 'content',
  promptHint: 'テキスト・文字・数字の禁止を強化',
  customNote: '',
  ...overrides,
})

describe('NGLog - 表示', () => {
  it('NG記録がない場合「NG記録がありません」と表示', () => {
    render(<NGLog ngReasons={[]} setNgReasons={vi.fn()} stamps={[]} />)
    expect(screen.getByText('NG記録がありません')).toBeInTheDocument()
  })

  it('NG記録合計が表示される', () => {
    const reasons = [makeNgReason(), makeNgReason({ id: 2 })]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    // 合計カードの数字（他の「2」テキストと被る可能性があるのでng-summary-numberで確認）
    const summaryCard = document.querySelector('.ng-summary-card[data-highlight] .ng-summary-number')
    expect(summaryCard.textContent).toBe('2')
    expect(screen.getByText('NG記録 合計')).toBeInTheDocument()
  })

  it('NG記録が一覧表示される', () => {
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    // テキスト混入はランキングとログ一覧に表示されるのでgetAllByTextで確認
    expect(screen.getAllByText('テキスト混入').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/雷門/).length).toBeGreaterThanOrEqual(1)
  })

  it('カテゴリバッジが表示される', () => {
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    // カテゴリバッジはサマリーカードとログエントリ両方に表示される
    expect(screen.getAllByText('コンテンツ').length).toBeGreaterThanOrEqual(1)
  })
})

describe('NGLog - プロンプト改善提案', () => {
  it('2回未満のNG理由では提案セクションが表示されない', () => {
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    expect(screen.queryByText('プロンプト改善提案')).not.toBeInTheDocument()
  })

  it('2回以上のNG理由で提案セクションが表示される', () => {
    const reasons = [
      makeNgReason({ id: 1 }),
      makeNgReason({ id: 2 }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    expect(screen.getByText('プロンプト改善提案')).toBeInTheDocument()
    expect(screen.getByText('2回')).toBeInTheDocument()
  })

  it('「学習してプロンプトを改善」ボタンが表示される', () => {
    const reasons = [
      makeNgReason({ id: 1 }),
      makeNgReason({ id: 2 }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    expect(screen.getByText(/学習してプロンプトを改善/)).toBeInTheDocument()
  })
})

describe('NGLog - 学習ルール適用', () => {
  it('学習ボタンクリックでlocalStorageにプロンプトが保存される', () => {
    localStorageMock.getItem.mockReturnValue(DEFAULT_PROMPT)
    const reasons = [
      makeNgReason({ id: 1, reason: 'テキスト混入' }),
      makeNgReason({ id: 2, reason: 'テキスト混入' }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    fireEvent.click(screen.getByText(/学習してプロンプトを改善/))
    // localStorageにプロンプトが保存される
    expect(localStorageMock.setItem).toHaveBeenCalled()
    const savedPrompt = localStorageMock.setItem.mock.calls.find(c => c[0] === STORAGE_KEYS.PROMPT)
    expect(savedPrompt).toBeTruthy()
    // LEARNED RULESが含まれる
    expect(savedPrompt[1]).toContain('LEARNED RULES')
    // テキスト混入に対応するルールが含まれる
    expect(savedPrompt[1]).toContain('NO text')
  })

  it('学習ルール適用後もベースプロンプトのSTAMP FORMATが保持される', () => {
    localStorageMock.getItem.mockReturnValue(DEFAULT_PROMPT)
    const reasons = [
      makeNgReason({ id: 1, reason: 'テキスト混入' }),
      makeNgReason({ id: 2, reason: 'テキスト混入' }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    fireEvent.click(screen.getByText(/学習してプロンプトを改善/))
    const savedPrompt = localStorageMock.setItem.mock.calls.find(c => c[0] === STORAGE_KEYS.PROMPT)
    expect(savedPrompt[1]).toContain('STAMP FORMAT')
    expect(savedPrompt[1]).toContain('BACKGROUND')
  })

  it('学習ルール適用後のプロンプトに対して再学習してもLEARNED RULESは1箇所のみ', () => {
    // 既に学習ルールが含まれたプロンプトを設定
    const promptWithRules = DEFAULT_PROMPT + '\n\n=== LEARNED RULES (from NG log) ===\n- Old rule'
    localStorageMock.getItem.mockReturnValue(promptWithRules)
    const reasons = [
      makeNgReason({ id: 1, reason: 'テキスト混入' }),
      makeNgReason({ id: 2, reason: 'テキスト混入' }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    fireEvent.click(screen.getByText(/学習してプロンプトを改善/))

    const saved = localStorageMock.setItem.mock.calls.find(c => c[0] === STORAGE_KEYS.PROMPT)
    expect(saved).toBeTruthy()
    const newPrompt = saved[1]
    // LEARNED RULESセクションは1箇所のみ（置換されている）
    const matches = newPrompt.match(/LEARNED RULES/g)
    expect(matches.length).toBe(1)
    // 古いルール "Old rule" は消えている
    expect(newPrompt).not.toContain('Old rule')
    // 新しいルール（テキスト禁止）が含まれる
    expect(newPrompt).toContain('NO text')
  })
})

describe('NGLog - クリア・リセット', () => {
  it('全クリアボタンでconfirmが呼ばれる', () => {
    global.confirm.mockReturnValue(false)
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    fireEvent.click(screen.getByText('全クリア'))
    expect(global.confirm).toHaveBeenCalled()
  })

  it('全クリア確認でNG記録がクリアされプロンプトがリセットされる', () => {
    global.confirm.mockReturnValue(true)
    const setNgReasons = vi.fn()
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={setNgReasons} stamps={[]} />)
    fireEvent.click(screen.getByText('全クリア'))
    expect(setNgReasons).toHaveBeenCalledWith([])
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.NG_LOG)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.PROMPT, DEFAULT_PROMPT)
  })

  it('プロンプトリセットボタンでconfirmが呼ばれる', () => {
    global.confirm.mockReturnValue(false)
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    fireEvent.click(screen.getByText('プロンプトリセット'))
    expect(global.confirm).toHaveBeenCalled()
  })

  it('プロンプトリセット確認でプロンプトのみリセットされNG記録は残る', () => {
    global.confirm.mockReturnValue(true)
    const setNgReasons = vi.fn()
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={setNgReasons} stamps={[]} />)
    fireEvent.click(screen.getByText('プロンプトリセット'))
    // プロンプトがリセットされる
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEYS.PROMPT, DEFAULT_PROMPT)
    // NG記録はクリアされない
    expect(setNgReasons).not.toHaveBeenCalled()
  })
})

describe('NGLog - エクスポート', () => {
  it('エクスポートボタンが表示される', () => {
    const reasons = [makeNgReason()]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    expect(screen.getByText('エクスポート')).toBeInTheDocument()
  })
})

describe('NGLog - カテゴリフィルタ', () => {
  it('カテゴリカードクリックでフィルタが切り替わる', () => {
    const reasons = [
      makeNgReason({ id: 1, category: 'content', reason: 'テキスト混入' }),
      makeNgReason({ id: 2, category: 'composition', reason: '構図が偏っている' }),
    ]
    render(<NGLog ngReasons={reasons} setNgReasons={vi.fn()} stamps={[]} />)
    // コンテンツカテゴリカードをクリック（サマリーカード内のもの）
    const summaryCards = document.querySelectorAll('.ng-summary-card:not([data-highlight])')
    const contentCard = Array.from(summaryCards).find(c => c.textContent.includes('コンテンツ'))
    fireEvent.click(contentCard)
    // フィルタ適用後、ログ一覧で構図カテゴリのエントリは表示されない
    const logEntries = document.querySelectorAll('.ng-log-entry')
    const reasons_shown = Array.from(logEntries).map(e => e.querySelector('.ng-log-reason')?.textContent)
    expect(reasons_shown).toContain('テキスト混入')
    expect(reasons_shown).not.toContain('構図が偏っている')
  })
})
