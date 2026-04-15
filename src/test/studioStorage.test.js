import { describe, it, expect, vi, beforeEach } from 'vitest'

// firebase/storage と firebase/firestore を完全モック
const uploadStringMock = vi.fn()
const getDownloadURLMock = vi.fn()
const setDocMock = vi.fn()
const getDocMock = vi.fn()

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: (_app, path) => ({ path }),
  uploadString: (...args) => uploadStringMock(...args),
  getDownloadURL: (...args) => getDownloadURLMock(...args),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db, col, id) => ({ col, id }),
  getDoc: (...args) => getDocMock(...args),
  setDoc: (...args) => setDocMock(...args),
  serverTimestamp: () => 'SERVER_TS',
}))

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
  getApps: () => [{}],
}))

vi.mock('../config/firebase', () => ({
  authReady: Promise.resolve({ uid: 'test-user' }),
}))

// localStorage モック
const lsStore = {}
const localStorageMock = {
  getItem: vi.fn((k) => lsStore[k] ?? null),
  setItem: vi.fn((k, v) => { lsStore[k] = v }),
  removeItem: vi.fn((k) => { delete lsStore[k] }),
  clear: vi.fn(() => { Object.keys(lsStore).forEach(k => delete lsStore[k]) }),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

beforeEach(() => {
  Object.keys(lsStore).forEach(k => delete lsStore[k])
  uploadStringMock.mockReset()
  getDownloadURLMock.mockReset()
  setDocMock.mockReset()
  getDocMock.mockReset()
})

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const makeCustom = (overrides = {}) => ({
  id: 'gen_1',
  spotId: 'spot_1',
  spotName: '雷門',
  area: 'asakusa',
  variant: 0,
  source: 'custom',
  createdAt: 1,
  dataUrl: 'data:image/png;base64,STUB',
  status: 'draft',
  ...overrides,
})

describe('studioStorage.saveCustomStamps - Storage 移行', () => {
  it('dataUrl(base64) を持つスタンプを Storage にアップロードして imageUrl に置換する', async () => {
    uploadStringMock.mockResolvedValue({ ref: {} })
    getDownloadURLMock.mockResolvedValue('https://fakestorage/abc.png')

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom()])

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
    const callArgs = uploadStringMock.mock.calls[0]
    expect(callArgs[0]).toEqual({ path: 'studio_custom_stamps/gen_1.png' })
    expect(callArgs[1]).toBe('data:image/png;base64,STUB')
    expect(callArgs[2]).toBe('data_url')
    expect(getDownloadURLMock).toHaveBeenCalledTimes(1)
  })

  it('Firestore へ送るペイロードに base64 dataUrl が含まれない', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/abc.png')

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom()])

    // pushSettingsToFirestore は 600ms デバウンスなので待機
    await sleep(700)

    expect(setDocMock).toHaveBeenCalled()
    const payload = setDocMock.mock.calls[0][1]
    expect(payload.customStamps).toBeDefined()
    expect(payload.customStamps[0].dataUrl).toBeUndefined()
    expect(payload.customStamps[0].imageUrl).toBe('https://fakestorage/abc.png')
    expect(payload.customStamps[0].id).toBe('gen_1')
  })

  it('既に imageUrl を持つスタンプは再アップロードしない', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/new.png')

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_skip', imageUrl: 'https://fakestorage/existing.png', dataUrl: null })])

    expect(uploadStringMock).not.toHaveBeenCalled()
  })

  it('同一セッションで同じ stampId を2回保存してもアップロードは1回だけ', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/once.png')

    const { saveCustomStamps } = await import('../config/studioStorage')
    const stamp = makeCustom({ id: 'gen_dedupe' })
    await saveCustomStamps([stamp])
    // 2回目は React state がまだ dataUrl を持っているケースを再現
    await saveCustomStamps([stamp])

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
  })

  it('複数スタンプを並列でアップロードする', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockImplementation(() => Promise.resolve('https://fakestorage/x.png'))

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([
      makeCustom({ id: 'gen_a' }),
      makeCustom({ id: 'gen_b' }),
      makeCustom({ id: 'gen_c' }),
    ])

    expect(uploadStringMock).toHaveBeenCalledTimes(3)
    const paths = uploadStringMock.mock.calls.map(c => c[0].path).sort()
    expect(paths).toEqual([
      'studio_custom_stamps/gen_a.png',
      'studio_custom_stamps/gen_b.png',
      'studio_custom_stamps/gen_c.png',
    ])
  })

  it('Storage アップロード失敗時は Firestore ペイロードから除外する', async () => {
    uploadStringMock.mockRejectedValue(new Error('storage permission denied'))
    getDownloadURLMock.mockResolvedValue(null)

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_fail' })])

    await sleep(700)

    // setDoc は呼ばれるが customStamps は空配列
    expect(setDocMock).toHaveBeenCalled()
    const payload = setDocMock.mock.calls[0][1]
    expect(payload.customStamps).toEqual([])
  })

  it('localStorage には常に最新の状態（dataUrl 含む）を即時保存', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/local.png')

    const { saveCustomStamps } = await import('../config/studioStorage')
    const stamp = makeCustom({ id: 'gen_ls' })
    await saveCustomStamps([stamp])

    const stored = JSON.parse(lsStore['lbs-stamp-studio-custom-stamps'])
    expect(stored).toHaveLength(1)
    // アップロード完了後、localStorage 側も imageUrl で更新される
    expect(stored[0].imageUrl).toBe('https://fakestorage/local.png')
  })
})
