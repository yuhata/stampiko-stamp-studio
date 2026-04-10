import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BatchForm from '../components/BatchForm'

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

// fetch モック
global.fetch = vi.fn()

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('BatchForm - レンダリング', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('スポット名入力欄が表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByPlaceholderText(/雷門/)).toBeInTheDocument()
  })

  it('生成ボタンが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText(/候補を生成/)).toBeInTheDocument()
  })

  it('スポット名未入力時は生成ボタンが無効', () => {
    render(<BatchForm {...defaultProps} />)
    const btn = screen.getByText(/候補を生成/)
    expect(btn).toBeDisabled()
  })

  it('スポット名入力後は生成ボタンが有効になる', () => {
    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: '東京タワー' } })
    const btn = screen.getByText(/候補を生成/)
    expect(btn).not.toBeDisabled()
  })
})

describe('BatchForm - デザインオプション', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('雰囲気オプションが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText('シンプル')).toBeInTheDocument()
    expect(screen.getByText('モダン')).toBeInTheDocument()
    expect(screen.getByText('伝統的')).toBeInTheDocument()
    expect(screen.getByText('かわいい')).toBeInTheDocument()
    expect(screen.getByText('エレガント')).toBeInTheDocument()
  })

  it('色数オプションが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText('単色')).toBeInTheDocument()
    expect(screen.getByText('2色')).toBeInTheDocument()
    expect(screen.getByText('3色')).toBeInTheDocument()
  })

  it('構成要素オプションが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText('建物')).toBeInTheDocument()
    expect(screen.getByText('風景')).toBeInTheDocument()
    expect(screen.getByText('動物')).toBeInTheDocument()
  })

  it('雰囲気ボタンをクリックするとactiveクラスが付く', () => {
    render(<BatchForm {...defaultProps} />)
    const btn = screen.getByText('シンプル')
    fireEvent.click(btn)
    expect(btn.className).toContain('active')
  })

  it('構成要素は複数選択可能', () => {
    render(<BatchForm {...defaultProps} />)
    const building = screen.getByText('建物')
    const animal = screen.getByText('動物')
    fireEvent.click(building)
    fireEvent.click(animal)
    expect(building.className).toContain('active')
    expect(animal.className).toContain('active')
  })

  it('構成要素の再クリックで選択解除', () => {
    render(<BatchForm {...defaultProps} />)
    const building = screen.getByText('建物')
    fireEvent.click(building)
    expect(building.className).toContain('active')
    fireEvent.click(building)
    expect(building.className).not.toContain('active')
  })
})

describe('BatchForm - 参考写真アップロード', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('参考写真ラベルが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText(/参考写真/)).toBeInTheDocument()
  })

  it('アップロードボタンが表示される', () => {
    render(<BatchForm {...defaultProps} />)
    expect(screen.getByText('写真をアップロード...')).toBeInTheDocument()
  })
})

describe('BatchForm - API呼び出し', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('生成時にAPIにプロンプトを送信する', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: '東京タワー' } })
    fireEvent.click(screen.getByText(/候補を生成/))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/generate-stamp-image')
    const body = JSON.parse(options.body)
    expect(body.prompt).toContain('東京タワー')
    expect(body.count).toBe(4) // デフォルト
  })

  it('referenceImageなしの場合はbodyに含まれない', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: 'テスト' } })
    fireEvent.click(screen.getByText(/候補を生成/))

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.referenceImage).toBeUndefined()
  })

  it('デザインオプション選択時にプロンプトにDESIGN OPTIONSが含まれる', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: 'テスト' } })
    fireEvent.click(screen.getByText('シンプル'))
    fireEvent.click(screen.getByText(/候補を生成/))

    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.prompt).toContain('DESIGN OPTIONS')
    expect(body.prompt).toContain('Minimalist')
  })

  it('生成結果が表示される', async () => {
    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUg=='
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ index: 0, base64: fakeBase64, mimeType: 'image/png' }],
      }),
    })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: 'テスト' } })
    fireEvent.click(screen.getByText(/候補を生成/))

    // 非同期処理待ち
    await vi.waitFor(() => {
      expect(screen.getByText(/生成結果/)).toBeInTheDocument()
    })
  })
})

describe('BatchForm - プロンプトlocalStorage同期', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('localStorageにプロンプトが保存されていない場合はDEFAULT_PROMPTを使用', () => {
    render(<BatchForm {...defaultProps} />)
    const textarea = document.querySelector('textarea')
    expect(textarea.value).toContain('STAMP FORMAT')
  })

  it('プロンプト編集時にlocalStorageに保存される', () => {
    render(<BatchForm {...defaultProps} />)
    const textarea = document.querySelector('textarea')
    fireEvent.change(textarea, { target: { value: 'custom prompt {SPOT_NAME}' } })
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'lbs-stamp-studio-prompt',
      'custom prompt {SPOT_NAME}'
    )
  })
})
