import { describe, it, expect, vi, beforeEach } from 'vitest'

// Firebase モック
const setDocMock = vi.fn()
const deleteDocMock = vi.fn()
const getDocsMock = vi.fn()
const onSnapshotMock = vi.fn()
const uploadStringMock = vi.fn()
const getDownloadURLMock = vi.fn()
const deleteObjectMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ _col: name }),
  doc: (_db, col, id) => ({ _col: col, _id: id }),
  setDoc: (...args) => setDocMock(...args),
  deleteDoc: (...args) => deleteDocMock(...args),
  getDocs: (...args) => getDocsMock(...args),
  onSnapshot: (...args) => onSnapshotMock(...args),
  serverTimestamp: () => 'SERVER_TS',
  getFirestore: () => ({}),
}))

vi.mock('firebase/storage', () => ({
  ref: (_s, p) => ({ _path: p }),
  uploadString: (...args) => uploadStringMock(...args),
  getDownloadURL: (...args) => getDownloadURLMock(...args),
  deleteObject: (...args) => deleteObjectMock(...args),
  getStorage: () => ({}),
}))

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
  getApps: () => [{}],
}))

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  signInAnonymously: () => Promise.resolve({ user: { uid: 'test' } }),
  onAuthStateChanged: (_a, cb) => { cb({ uid: 'test' }) },
}))

vi.mock('../config/firebase', () => ({
  db: {}, storage: {},
  authReady: Promise.resolve({ uid: 'test' }),
}))

beforeEach(() => {
  setDocMock.mockReset()
  deleteDocMock.mockReset()
  getDocsMock.mockReset()
  onSnapshotMock.mockReset()
  uploadStringMock.mockReset()
  getDownloadURLMock.mockReset()
  deleteObjectMock.mockReset()
})

describe('studioStamps.upsertStamp', () => {
  it('単一スタンプを setDoc merge:true で upsert する', async () => {
    setDocMock.mockResolvedValue()
    const { upsertStamp } = await import('../config/studioStamps')
    await upsertStamp('gen_1', { spotName: 'テスト', status: 'approved' })

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const [ref, payload, opts] = setDocMock.mock.calls[0]
    expect(ref._col).toBe('studio_stamps')
    expect(ref._id).toBe('gen_1')
    expect(payload.spotName).toBe('テスト')
    expect(payload.status).toBe('approved')
    expect(payload.updatedAt).toBe('SERVER_TS')
    expect(opts.merge).toBe(true)
  })

  it('dataUrl は Firestore ペイロードから除外される（Storage経由）', async () => {
    setDocMock.mockResolvedValue()
    const { upsertStamp } = await import('../config/studioStamps')
    await upsertStamp('gen_2', { spotName: 'X', dataUrl: 'data:image/png;base64,ABC' })
    const payload = setDocMock.mock.calls[0][1]
    expect(payload.dataUrl).toBeUndefined()
    expect(payload.spotName).toBe('X')
  })

  it('stampId 欠落時はエラー', async () => {
    const { upsertStamp } = await import('../config/studioStamps')
    await expect(upsertStamp('', { x: 1 })).rejects.toThrow(/stampId/)
  })
})

describe('studioStamps.upsertStampsMany', () => {
  it('複数スタンプをそれぞれ setDoc で並列書き込み', async () => {
    setDocMock.mockResolvedValue()
    const { upsertStampsMany } = await import('../config/studioStamps')
    await upsertStampsMany([
      { id: 'a', spotName: 'A' },
      { id: 'b', spotName: 'B' },
      { id: 'c', spotName: 'C' },
    ])
    expect(setDocMock).toHaveBeenCalledTimes(3)
    const ids = setDocMock.mock.calls.map(c => c[0]._id).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('一部失敗でも全件処理し、結果に ok:false を含める', async () => {
    setDocMock.mockImplementation((ref) => {
      if (ref._id === 'b') return Promise.reject(new Error('fail B'))
      return Promise.resolve()
    })
    const { upsertStampsMany } = await import('../config/studioStamps')
    const res = await upsertStampsMany([
      { id: 'a' }, { id: 'b' }, { id: 'c' },
    ])
    expect(res).toHaveLength(3)
    expect(res[0].ok).toBe(true)
    expect(res[1].ok).toBe(false)
    expect(res[1].error).toBe('fail B')
    expect(res[2].ok).toBe(true)
  })
})

describe('studioStamps.deleteStamp / deleteStampsMany', () => {
  it('deleteStamp は deleteDoc を1回呼ぶ', async () => {
    deleteDocMock.mockResolvedValue()
    const { deleteStamp } = await import('../config/studioStamps')
    await deleteStamp('x1')
    expect(deleteDocMock).toHaveBeenCalledTimes(1)
    expect(deleteDocMock.mock.calls[0][0]._id).toBe('x1')
  })

  it('deleteStampsMany は並列で全件削除', async () => {
    deleteDocMock.mockResolvedValue()
    const { deleteStampsMany } = await import('../config/studioStamps')
    const res = await deleteStampsMany(['a', 'b', 'c'])
    expect(deleteDocMock).toHaveBeenCalledTimes(3)
    expect(res.every(r => r.ok)).toBe(true)
  })

  it('deleteStampsBySpotId は spotId一致のみ削除', async () => {
    deleteDocMock.mockResolvedValue()
    const { deleteStampsBySpotId } = await import('../config/studioStamps')
    const allStamps = [
      { id: 'v0', spotId: 'kaminarimon' },
      { id: 'v1', spotId: 'kaminarimon' },
      { id: 'other', spotId: 'shibuya' },
    ]
    await deleteStampsBySpotId('kaminarimon', allStamps)
    expect(deleteDocMock).toHaveBeenCalledTimes(2)
    const deletedIds = deleteDocMock.mock.calls.map(c => c[0]._id).sort()
    expect(deletedIds).toEqual(['v0', 'v1'])
  })
})

describe('studioStamps.replaceStampImage', () => {
  it('dataUrl を Storage にアップロードし imageUrl を Firestore に反映', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://storage/new.png')
    setDocMock.mockResolvedValue()

    const { replaceStampImage } = await import('../config/studioStamps')
    const result = await replaceStampImage('s1', 'data:image/png;base64,ABC', null)

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
    expect(uploadStringMock.mock.calls[0][2]).toBe('data_url')
    expect(getDownloadURLMock).toHaveBeenCalledTimes(1)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    expect(setDocMock.mock.calls[0][1].imageUrl).toBe('https://storage/new.png')
    expect(result.imageUrl).toBe('https://storage/new.png')
  })

  it('base64以外の dataUrl はエラー', async () => {
    const { replaceStampImage } = await import('../config/studioStamps')
    await expect(replaceStampImage('s1', 'invalid')).rejects.toThrow(/data:/)
  })

  it('旧 imageUrl が Storage パスを含む場合、旧画像を削除する（best-effort）', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://storage/new.png')
    setDocMock.mockResolvedValue()
    deleteObjectMock.mockResolvedValue()

    const { replaceStampImage } = await import('../config/studioStamps')
    await replaceStampImage(
      's1', 'data:image/png;base64,ABC',
      'https://firebasestorage.googleapis.com/v0/b/project.firebasestorage.app/o/studio_stamps%2Fold.png?alt=media'
    )
    expect(deleteObjectMock).toHaveBeenCalledTimes(1)
  })

  it('旧画像削除が失敗しても処理は継続', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://storage/new.png')
    setDocMock.mockResolvedValue()
    deleteObjectMock.mockRejectedValue(new Error('not found'))

    const { replaceStampImage } = await import('../config/studioStamps')
    const result = await replaceStampImage(
      's1', 'data:image/png;base64,ABC',
      'https://firebasestorage.googleapis.com/v0/b/project.firebasestorage.app/o/studio_stamps%2Fold.png?alt=media'
    )
    expect(result.imageUrl).toBe('https://storage/new.png')
  })
})

describe('studioStamps.createStampWithImage', () => {
  it('Storage upload → Firestore setDoc をワンストップで実行', async () => {
    uploadStringMock.mockResolvedValue({})
    getDownloadURLMock.mockResolvedValue('https://storage/created.png')
    setDocMock.mockResolvedValue()

    const { createStampWithImage } = await import('../config/studioStamps')
    const meta = {
      id: 'gen_new',
      dataUrl: 'data:image/png;base64,XYZ',
      spotName: 'test',
      area: 'asakusa',
      source: 'custom',
    }
    const result = await createStampWithImage(meta)

    expect(uploadStringMock).toHaveBeenCalledTimes(1)
    expect(setDocMock).toHaveBeenCalledTimes(1)
    const payload = setDocMock.mock.calls[0][1]
    expect(payload.imageUrl).toBe('https://storage/created.png')
    expect(payload.dataUrl).toBeUndefined()
    expect(payload.spotName).toBe('test')
    expect(result.id).toBe('gen_new')
  })
})

describe('studioStamps.subscribeStamps', () => {
  it('onSnapshot のコールバックで deleted:true を除外して callback 発火', async () => {
    let snapshotCallback = null
    onSnapshotMock.mockImplementation((_ref, cb) => {
      snapshotCallback = cb
      return () => {}
    })
    const { subscribeStamps } = await import('../config/studioStamps')
    const received = []
    subscribeStamps(stamps => received.push(stamps))

    // authReady 解決を待つ
    await new Promise(r => setTimeout(r, 10))
    expect(snapshotCallback).toBeTruthy()

    const mockSnap = {
      forEach(fn) {
        fn({ id: 'a', data: () => ({ spotName: 'A' }) })
        fn({ id: 'b', data: () => ({ spotName: 'B', deleted: true }) })
        fn({ id: 'c', data: () => ({ spotName: 'C' }) })
      },
    }
    snapshotCallback(mockSnap)

    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(2) // b 除外
    expect(received[0].map(s => s.id).sort()).toEqual(['a', 'c'])
  })
})
