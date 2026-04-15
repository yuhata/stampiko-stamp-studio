import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StampGallery from '../components/StampGallery'

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

global.fetch = vi.fn()

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

const makeStamp = (overrides = {}) => ({
  id: 'stamp_1',
  spotId: 'spot_1',
  spotName: '雷門',
  area: 'asakusa',
  lat: 35.7148,
  lng: 139.7967,
  variant: 0,
  path: null,
  dataUrl: 'data:image/png;base64,abc',
  status: 'draft',
  designerNote: '',
  ngTags: [],
  ...overrides,
})

const defaultProps = {
  stamps: [],
  setStamps: vi.fn(),
  areas: ['asakusa', 'shibuya'],
  filterArea: 'all',
  setFilterArea: vi.fn(),
  filterStatus: 'all',
  setFilterStatus: vi.fn(),
  updateStamp: vi.fn(),
  addNgReason: vi.fn(),
  ngReasons: [],
  focusSpotId: null,
  clearFocusSpot: vi.fn(),
  onShowOnMap: vi.fn(),
}

describe('StampGallery - フィルタリング', () => {
  it('スタンプがない場合「該当するスタンプがありません」と表示', () => {
    render(<StampGallery {...defaultProps} />)
    expect(screen.getByText('該当するスタンプがありません')).toBeInTheDocument()
  })

  it('ステータスフィルタボタンが表示される', () => {
    render(<StampGallery {...defaultProps} />)
    // 「全て」はエリアドロップダウンのoptionとステータスフィルタのbuttonの両方にある
    const filterBtns = document.querySelectorAll('.filter-group .filter-btn')
    const labels = Array.from(filterBtns).map(b => b.textContent)
    expect(labels).toContain('全て')
    expect(labels).toContain('未レビュー')
    expect(labels).toContain('承認済み')
    expect(labels).toContain('却下')
  })

  it('ステータスフィルタをクリックするとコールバックが呼ばれる', () => {
    render(<StampGallery {...defaultProps} />)
    fireEvent.click(screen.getByText('承認済み'))
    expect(defaultProps.setFilterStatus).toHaveBeenCalledWith('approved')
  })

  it('スタンプカードが表示される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    expect(screen.getByText('雷門')).toBeInTheDocument()
  })

  it('エリアフィルタで絞り込まれる', () => {
    const stamps = [
      makeStamp({ id: '1', spotId: 'sp1', spotName: '雷門', area: 'asakusa' }),
      makeStamp({ id: '2', spotId: 'sp2', spotName: 'ハチ公', area: 'shibuya' }),
    ]
    render(<StampGallery {...defaultProps} stamps={stamps} filterArea="asakusa" />)
    expect(screen.getByText('雷門')).toBeInTheDocument()
    expect(screen.queryByText('ハチ公')).not.toBeInTheDocument()
  })

  it('ステータスフィルタで絞り込まれる', () => {
    const stamps = [
      makeStamp({ id: '1', spotId: 'sp1', spotName: '雷門', status: 'approved' }),
      makeStamp({ id: '2', spotId: 'sp2', spotName: 'ハチ公', status: 'rejected' }),
    ]
    render(<StampGallery {...defaultProps} stamps={stamps} filterStatus="approved" />)
    expect(screen.getByText('雷門')).toBeInTheDocument()
    expect(screen.queryByText('ハチ公')).not.toBeInTheDocument()
  })
})

describe('StampGallery - スタンプカード', () => {
  it('承認ボタンでupdateStampが呼ばれる', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    const approveBtn = screen.getAllByText('承認')[0]
    fireEvent.click(approveBtn)
    expect(defaultProps.updateStamp).toHaveBeenCalledWith('stamp_1', { status: 'approved' })
  })

  it('却下ボタンでupdateStampが呼ばれる', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    // カード内の.action-btn.reject を取得
    const rejectBtn = document.querySelector('.stamp-actions .action-btn.reject')
    fireEvent.click(rejectBtn)
    expect(defaultProps.updateStamp).toHaveBeenCalledWith('stamp_1', { status: 'rejected' })
  })

  it('要修正ボタンは表示されない（needs_edit廃止）', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    const editBtn = document.querySelector('.stamp-actions .action-btn.edit')
    expect(editBtn).toBeNull()
  })
})

describe('StampGallery - モーダル', () => {
  it('カードクリックでモーダルが開く', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    // stamp-card をクリック
    const card = document.querySelector('.stamp-card')
    fireEvent.click(card)
    // モーダルの内容が表示される
    expect(screen.getByText(/雷門 — 候補 1/)).toBeInTheDocument()
  })

  it('モーダルにNG理由タグが表示される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    expect(screen.getByText('テキスト混入')).toBeInTheDocument()
    expect(screen.getByText('ランドマーク不明瞭')).toBeInTheDocument()
  })

  it('モーダルに「マップで位置を確認」ボタンが表示される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    expect(screen.getByText('マップで位置を確認')).toBeInTheDocument()
  })

  it('「マップで位置を確認」クリックでonShowOnMapが呼ばれる', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    fireEvent.click(screen.getByText('マップで位置を確認'))
    expect(defaultProps.onShowOnMap).toHaveBeenCalledWith('spot_1')
  })

  it('モーダルに「バリエーション生成」ボタンが表示される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    expect(screen.getByText('バリエーション生成')).toBeInTheDocument()
  })

  it('バリエーション生成パネルの展開（BatchForm埋め込み）', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    const varBtn = screen.getByText('バリエーション生成')
    fireEvent.click(varBtn)
    // BatchFormが埋め込まれ、lockedSpotヘッダーが表示される
    expect(screen.getByText(/既存スポット/)).toBeInTheDocument()
    // 候補生成ボタンが表示される
    expect(screen.getByText(/候補を生成/)).toBeInTheDocument()
  })

  it('モーダルに「画像を差し替え...」ボタンが表示される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    expect(screen.getByText('画像を差し替え...')).toBeInTheDocument()
  })

  it('NG理由タグをクリックすると選択される', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    const tag = screen.getByText('テキスト混入')
    fireEvent.click(tag)
    expect(tag.className).toContain('selected')
  })

  it('閉じるボタンでモーダルが閉じる', () => {
    const stamps = [makeStamp()]
    render(<StampGallery {...defaultProps} stamps={stamps} />)
    fireEvent.click(document.querySelector('.stamp-card'))
    expect(screen.getByText(/雷門 — 候補 1/)).toBeInTheDocument()
    // 閉じるボタン（モーダル下部）
    fireEvent.click(screen.getByText('閉じる'))
    expect(screen.queryByText(/雷門 — 候補 1/)).not.toBeInTheDocument()
  })
})
