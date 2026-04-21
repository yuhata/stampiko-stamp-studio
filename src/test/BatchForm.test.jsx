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

// Image / Canvas モック（cropToCircle が jsdom 環境で完走するようにする）
class MockImageForTest {
  constructor() { this.width = 0; this.height = 0; this.onload = null; this.onerror = null }
  set src(_v) {
    queueMicrotask(() => {
      this.width = 1024
      this.height = 1024
      this.onload && this.onload()
    })
  }
}
globalThis.Image = MockImageForTest
const _origCreateElement = document.createElement.bind(document)
document.createElement = (tag) => {
  if (tag === 'canvas') {
    return {
      width: 0, height: 0,
      getContext: () => ({
        drawImage: () => {}, beginPath: () => {}, arc: () => {}, closePath: () => {}, fill: () => {},
        fillRect: () => {},
        set fillStyle(_v) {},
        set globalCompositeOperation(_v) {},
      }),
      toDataURL: (type = 'image/png') => `data:${type};base64,STUB`,
    }
  }
  return _origCreateElement(tag)
}

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

describe('BatchForm - エリア選択（全25エリア）', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('エリア <select> に25個の <option> が含まれる', () => {
    render(<BatchForm {...defaultProps} />)
    // エリアラベルの次の select を特定
    const selects = document.querySelectorAll('select')
    // 1番目が area, 2番目が style（構図スタイル）
    const areaSelect = selects[0]
    expect(areaSelect.options.length).toBe(25)
  })

  it('25エリアに主要エリア（池袋・銀座・上野など）が含まれる', () => {
    render(<BatchForm {...defaultProps} />)
    const areaSelect = document.querySelectorAll('select')[0]
    const values = [...areaSelect.options].map(o => o.value)
    for (const expected of ['asakusa', 'shibuya', 'shinjuku', 'ikebukuro', 'ueno', 'ginza', 'roppongi']) {
      expect(values).toContain(expected)
    }
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
    expect(body.count).toBe(2) // デフォルト（コスト削減のため 4→2 に変更）
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

  it('生成後に「同じ設定でもう N 枚生成」ボタンが表示され、appendされる', async () => {
    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUg=='
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, base64: fakeBase64, mimeType: 'image/png' },
            { index: 1, base64: fakeBase64, mimeType: 'image/png' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { index: 0, base64: fakeBase64, mimeType: 'image/png' },
            { index: 1, base64: fakeBase64, mimeType: 'image/png' },
          ],
        }),
      })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: 'テスト' } })
    fireEvent.click(screen.getByText(/候補を生成/))

    // 初回生成結果の2/2 を確認
    await vi.waitFor(() => {
      expect(screen.getByText(/2\/2/)).toBeInTheDocument()
    })

    // 追加生成ボタンをクリック
    const addMoreBtn = screen.getByText(/同じ設定でもう2枚生成/)
    fireEvent.click(addMoreBtn)

    // appendされて4枚に
    await vi.waitFor(() => {
      expect(screen.getByText(/4\/4/)).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('BatchForm - 参照画像アップロード時リサイズ', () => {
  const defaultProps = { stamps: [], setStamps: vi.fn(), ngReasons: [] }

  it('画像アップロード後はJPEGにリサイズされた状態でAPIに送信される', async () => {
    // FileReader が対応していない環境でも dataURL が生成されるよう Image モックは上で定義済み
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    render(<BatchForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText(/雷門/), { target: { value: 'テスト' } })

    const fileInput = document.querySelector('input[type="file"]')
    const file = new File(['dummy-bytes'], 'photo.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    // アップロード処理（Promise-based）が完走して削除ボタンが見えるまで待機
    await vi.waitFor(() => {
      expect(screen.getByText('削除')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/候補を生成/))

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })
    const body = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(body.referenceImage).toBeDefined()
    // Canvas 経由でリサイズ→JPEGに変換されていること
    expect(body.referenceImage.mimeType).toBe('image/jpeg')
    expect(typeof body.referenceImage.base64).toBe('string')
    expect(body.referenceImage.base64.length).toBeGreaterThan(0)
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
