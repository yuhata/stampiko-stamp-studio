// 位置入力を緯度経度に解釈するユーティリティ
// 受け付ける形式:
//   1. "35.7148,139.7967" / "35.7148, 139.7967" — Google Maps コピペ形式
//   2. 住所文字列 — Nominatim ジオコーディング

export async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = await res.json()
  if (!data || data.length === 0) throw new Error('該当する住所が見つかりませんでした')
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name }
}

export function parseLatLng(input) {
  if (!input) return null
  const m = String(input).trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (!isFinite(lat) || !isFinite(lng)) return null
  return { lat, lng }
}

/**
 * 入力（住所 or "lat,lng"）を解釈して { lat, lng, display? } を返す
 * confirmFn: ジオコード結果をユーザーに確認させるコールバック (true で続行)
 */
export async function resolveLocationInput(input, { confirmFn } = {}) {
  const coord = parseLatLng(input)
  if (coord) return coord
  const geo = await geocodeAddress(input.trim())
  if (confirmFn) {
    const ok = confirmFn(geo)
    if (!ok) return null
  }
  return { lat: geo.lat, lng: geo.lng, display: geo.display }
}
