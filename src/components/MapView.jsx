import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const AREA_LABELS = {
  asakusa: '浅草',
  shibuya: '渋谷',
  shinjuku: '新宿',
}

const AREA_COLORS = {
  asakusa: '#C0392B',
  shibuya: '#6A1B9A',
  shinjuku: '#BF360C',
}

// エリア別のカスタムマーカーアイコン
function createIcon(area, hasApproved) {
  const color = AREA_COLORS[area] || '#ff6b35'
  const ring = hasApproved ? '#4caf50' : '#888'
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};
      border:3px solid ${ring};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

export default function MapView({ stamps, updateStamp, onSelectSpot }) {
  // スポットごとに集約
  const spots = useMemo(() => {
    const map = {}
    stamps.forEach(s => {
      if (!s.lat || !s.lng) return
      if (!map[s.spotId]) {
        map[s.spotId] = {
          spotId: s.spotId,
          spotName: s.spotName,
          area: s.area,
          lat: s.lat,
          lng: s.lng,
          stamps: [],
        }
      }
      map[s.spotId].stamps.push(s)
    })
    return Object.values(map)
  }, [stamps])

  // 地図の中心（全スポットの中央）
  const center = useMemo(() => {
    if (spots.length === 0) return [35.68, 139.75]
    const avgLat = spots.reduce((sum, s) => sum + s.lat, 0) / spots.length
    const avgLng = spots.reduce((sum, s) => sum + s.lng, 0) / spots.length
    return [avgLat, avgLng]
  }, [spots])

  return (
    <div className="map-view">
      <MapContainer center={center} zoom={12} className="stamp-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {spots.map(spot => {
          const approved = spot.stamps.filter(s => s.status === 'approved')
          const total = spot.stamps.length
          const icon = createIcon(spot.area, approved.length > 0)

          return (
            <Marker key={spot.spotId} position={[spot.lat, spot.lng]} icon={icon}>
              <Popup className="stamp-popup">
                <div className="popup-content">
                  <div className="popup-header">
                    <strong>{spot.spotName}</strong>
                    <span className="popup-area">{AREA_LABELS[spot.area]}</span>
                  </div>
                  <div className="popup-stats">
                    {total}候補 / <span style={{ color: '#4caf50' }}>{approved.length}承認</span>
                  </div>
                  <div className="popup-stamps">
                    {spot.stamps.slice(0, 4).map(s => (
                      <div
                        key={s.id}
                        className={`popup-stamp-thumb ${s.status}`}
                        onClick={() => onSelectSpot(spot.spotId)}
                      >
                        <img src={`${import.meta.env.BASE_URL}${s.path}`} alt="" />
                      </div>
                    ))}
                  </div>
                  <button
                    className="popup-view-btn"
                    onClick={() => onSelectSpot(spot.spotId)}
                  >
                    ギャラリーで見る
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
