import { describe, it, expect, vi, beforeEach } from 'vitest'

// firebase/storage と firebase/firestore を完全モック
const uploadStringMock = vi.fn()
const getDownloadURLMock = vi.fn()
const setDocMock = vi.fn()
const getDocMock = vi.fn()
const deleteDocMock = vi.fn()
const getDocsMock = vi.fn()

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: (_app, path) => ({ path }),
  uploadString: (...args) => uploadStringMock(...args),
  getDownloadURL: (...args) => getDownloadURLMock(...args),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db, col, id) => ({ col, id }),
  collection: (_db, name) => ({ name }),
  getDoc: (...args) => getDocMock(...args),
  getDocs: (...args) => getDocsMock(...args),
  setDoc: (...args) => setDocMock(...args),
  deleteDoc: (...args) => deleteDocMock(...args),
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
  deleteDocMock.mockReset()
  getDocsMock.mockReset()
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

describe('studioStorage.saveCustomStamps - 個別ドキュメント方式', () => {
  it('dataUrl(base64) を持つスタンプを Storage にアップロードする', async () => {
    uploadStringMock.mockResolvedValue({ ref: {} })
    getDownloadURLMock.mockResolvedValue('https://fakestorage/abc.png')
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom()])

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
    expect(uploadStringMock.mock.calls[0][2]).toBe('data_url')
    expect(getDownloadURLMock).toHaveBeenCalledTimes(1)
  })

  it('個別ドキュメントとして setDoc が呼ばれ、dataUrl は含まれない', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/abc.png')
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_doc_test' })])

    const stampCalls = setDocMock.mock.calls.filter(c => c[0]?.col === 'studio_custom_stamps')
    expect(stampCalls.length).toBeGreaterThanOrEqual(1)
    const call = stampCalls.find(c => c[0].id === 'gen_doc_test')
    expect(call).toBeTruthy()
    const payload = call[1]
    expect(payload.dataUrl).toBeUndefined()
    expect(payload.imageUrl).toBe('https://fakestorage/abc.png')
    expect(payload.source).toBe('custom')
  })

  it('既に imageUrl を持つスタンプは再アップロードしない', async () => {
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_skip', imageUrl: 'https://fakestorage/existing.png', dataUrl: null })])

    expect(uploadStringMock).not.toHaveBeenCalled()
  })

  it('同一セッションで同じ stampId を2回保存してもアップロードは1回だけ', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/once.png')
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    const stamp = makeCustom({ id: 'gen_dedupe' })
    await saveCustomStamps([stamp])
    await saveCustomStamps([stamp])

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
  })

  it('複数スタンプがそれぞれ個別ドキュメントとして保存される', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockImplementation(() => Promise.resolve('https://fakestorage/x.png'))
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([
      makeCustom({ id: 'gen_a' }),
      makeCustom({ id: 'gen_b' }),
      makeCustom({ id: 'gen_c' }),
    ])

    // 3件の個別setDoc
    const stampDocs = setDocMock.mock.calls.filter(c => c[0]?.col === 'studio_custom_stamps')
    expect(stampDocs.length).toBe(3)
    const ids = stampDocs.map(c => c[0].id).sort()
    expect(ids).toEqual(['gen_a', 'gen_b', 'gen_c'])
  })

  it('Storage アップロード失敗でもメタデータドキュメントは保存される', async () => {
    uploadStringMock.mockRejectedValue(new Error('storage permission denied'))
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_fail' })])

    // メタデータは保存される（imageUrl無しでもドキュメントは残る）
    const stampDocs = setDocMock.mock.calls.filter(c => c[0]?.col === 'studio_custom_stamps')
    expect(stampDocs.length).toBe(1)
    expect(stampDocs[0][0].id).toBe('gen_fail')
  })

  it('localStorage には常に最新の状態を即時保存', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/local.png')
    setDocMock.mockResolvedValue()

    const { saveCustomStamps } = await import('../config/studioStorage')
    await saveCustomStamps([makeCustom({ id: 'gen_ls' })])

    const stored = JSON.parse(lsStore['lbs-stamp-studio-custom-stamps'])
    expect(stored).toHaveLength(1)
    expect(stored[0].imageUrl).toBe('https://fakestorage/local.png')
  })

  it('削除されたスタンプは deleteDoc される', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://fakestorage/del.png')
    setDocMock.mockResolvedValue()
    deleteDocMock.mockResolvedValue()

    const { saveCustomStamps, deleteCustomStamp } = await import('../config/studioStorage')
    // deleteCustomStamp で直接削除
    await deleteCustomStamp('gen_to_delete')

    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    expect(deleteDocMock.mock.calls[0][0].id).toBe('gen_to_delete')
  })
})
