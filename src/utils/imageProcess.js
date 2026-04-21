// 生成スタンプ画像の後処理ユーティリティ

const CROP_TIMEOUT_MS = 8000
const RESIZE_TIMEOUT_MS = 8000

/**
 * アップロード画像を長辺 maxDim px までリサイズし、JPEG化した data URL を返す。
 * Gemini API に送る参照画像の入力トークン削減とアップロード時間短縮が目的。
 * @param {File} file - 入力 File
 * @param {number} maxDim - リサイズ後の長辺上限 px（既定 1024）
 * @param {number} quality - JPEG 品質 0.0〜1.0（既定 0.9）
 * @returns {Promise<{ base64: string, mimeType: string, preview: string }>}
 */
export function resizeImageFile(file, maxDim = 1024, quality = 0.9) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, val) => { if (settled) return; settled = true; fn(val) }
    const timer = setTimeout(() => {
      finish(reject, new Error(`resizeImageFile timeout after ${RESIZE_TIMEOUT_MS}ms`))
    }, RESIZE_TIMEOUT_MS)

    const reader = new FileReader()
    reader.onerror = (e) => { clearTimeout(timer); finish(reject, e instanceof Error ? e : new Error('file read failed')) }
    reader.onload = () => {
      const srcDataUrl = reader.result
      const img = new Image()
      img.onerror = (e) => { clearTimeout(timer); finish(reject, e instanceof Error ? e : new Error('image load failed')) }
      img.onload = () => {
        try {
          const longSide = Math.max(img.width, img.height)
          const scale = longSide > maxDim ? maxDim / longSide : 1
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          // JPEG化前提でα消失防止のため白背景を敷く
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          const mimeType = 'image/jpeg'
          const dataUrl = canvas.toDataURL(mimeType, quality)
          const base64 = dataUrl.split(',')[1] || ''
          clearTimeout(timer)
          finish(resolve, { base64, mimeType, preview: dataUrl })
        } catch (err) {
          clearTimeout(timer)
          finish(reject, err)
        }
      }
      img.src = srcDataUrl
    }
    reader.readAsDataURL(file)
  })
}

/**
 * 画像を円形にトリミング（円外を透過）
 * 必ずタイムアウト内に決着する。失敗時は reject されるので呼び出し側で原画像にフォールバックする想定。
 * @param {string} dataUrl - 入力画像のdata URL
 * @returns {Promise<string>} PNG形式のdata URL
 */
export function cropToCircle(dataUrl) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, val) => { if (settled) return; settled = true; fn(val) }

    const timer = setTimeout(() => {
      finish(reject, new Error(`cropToCircle timeout after ${CROP_TIMEOUT_MS}ms`))
    }, CROP_TIMEOUT_MS)

    const img = new Image()
    img.onload = () => {
      try {
        const size = Math.min(img.width, img.height)
        if (!size || !isFinite(size)) {
          throw new Error('invalid image size')
        }
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')

        const sx = (img.width - size) / 2
        const sy = (img.height - size) / 2
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size)

        ctx.globalCompositeOperation = 'destination-in'
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        clearTimeout(timer)
        finish(resolve, canvas.toDataURL('image/png'))
      } catch (err) {
        clearTimeout(timer)
        finish(reject, err)
      }
    }
    img.onerror = (e) => {
      clearTimeout(timer)
      finish(reject, e instanceof Error ? e : new Error('image load failed'))
    }
    img.src = dataUrl
  })
}
