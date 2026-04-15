import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { AREA_LABELS, AREA_COLORS } from '../config/areas'
import { resolveLocationInput } from '../utils/location'

const CATEGORY_ICONS = {
  shrine: { emoji: '⛩', color: '#888' },
  temple: { emoji: '🏛', color: '#888' },
  station: { emoji: '🚉', color: '#888' },
}

const LAYER_OPTIONS = [
  { id: 'landmarks', label: 'ランドマーク' },
  { id: 'shrine', label: '神社' },
  { id: 'temple', label: '寺院' },
  { id: 'station', label: '駅' },
]

function createLandmarkIcon(area, hasApproved) {
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

function createDataSpotIcon(category) {
  const cfg = CATEGORY_ICONS[category] || { emoji: '📍', color: '#888' }
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${cfg.color};
      border:2px solid rgba(255,255,255,0.3);
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;
    ">${cfg.emoji}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  })
}

// マップフォーカス用コンポーネント
function MapFocus({ lat, lng, onDone }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 16, { duration: 1 })
      if (onDone) onDone()
    }
  }, [lat, lng, map, onDone])
  return null
}

export default function MapView({ stamps, updateStamp, setStamps, onSelectSpot, focusSpotId, clearFocusSpot }) {
  const handleEditLocation = async (spotId, spotName) => {
    const input = prompt(
      `「${spotName}」の位置を修正\n\n住所、または "緯度,経度" を入力してください\n例: 東京都台東区浅草2-3-1\n例: 35.7148,139.7967`
    )
    if (!input || !input.trim()) return
    try {
      const result = await resolveLocationInput(input, {
        confirmFn: (geo) => confirm(`検索結果:\n${geo.display}\n\n(${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})\n\nこの位置に更新しますか？`),
      })
      if (!result) return
      setStamps(prev => prev.map(s => s.spotId === spotId ? { ...s, lat: result.lat, lng: result.lng } : s))
    } catch (err) {
      alert(`位置取得エラー: ${err.message}`)
    }
  }

  const [dataPOIs, setDataPOIs] = useState([])
  const [visibleLayers, setVisibleLayers] = useState(['landmarks'])

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'stamps/pilot_pois.json')
      .then(r => r.json())
      .then(setDataPOIs)
      .catch(() => setDataPOIs([]))
  }, [])

  const toggleLayer = (id) => {
    setVisibleLayers(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    )
  }

  // ランドマークスポット（既存スタンプ候補）
  const landmarkSpots = useMemo(() => {
    const map = {}
    stamps.forEach(s => {
      if (!s.lat || !s.lng) return
      if (!map[s.spotId]) {
        map[s.spotId] = {
          spotId: s.spotId, spotName: s.spotName, area: s.area,
          lat: s.lat, lng: s.lng, stamps: [], type: 'landmark',
        }
      }
      map[s.spotId].stamps.push(s)
    })
    return Object.values(map)
  }, [stamps])

  // 地図の中心
  const center = useMemo(() => {
    if (landmarkSpots.length === 0) return [35.68, 139.75]
    const avgLat = landmarkSpots.reduce((sum, s) => sum + s.lat, 0) / landmarkSpots.length
    const avgLng = landmarkSpots.reduce((sum, s) => sum + s.lng, 0) / landmarkSpots.length
    return [avgLat, avgLng]
  }, [landmarkSpots])

  // 統計
  const stats = {
    landmarks: landmarkSpots.length,
    shrine: dataPOIs.filter(p => p.category === 'shrine').length,
    temple: dataPOIs.filter(p => p.category === 'temple').length,
    station: dataPOIs.filter(p => p.category === 'station').length,
  }

  return (
    <div className="map-view">
      {/* レイヤー切り替え */}
      <div className="map-layer-controls">
        {LAYER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            className={`map-layer-btn ${visibleLayers.includes(opt.id) ? 'active' : ''}`}
            onClick={() => toggleLayer(opt.id)}
          >
            {opt.label}
            <span className="map-layer-count">{stats[opt.id] || 0}</span>
          </button>
        ))}
        <span className="map-total">
          合計: {Object.entries(stats).filter(([k]) => visibleLayers.includes(k)).reduce((sum, [, v]) => sum + v, 0)} POI
        </span>
      </div>

      <MapContainer center={center} zoom={12} className="stamp-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* ギャラリーからのフォーカス */}
        {focusSpotId && (() => {
          const target = landmarkSpots.find(s => s.spotId === focusSpotId)
          return target ? <MapFocus lat={target.lat} lng={target.lng} onDone={clearFocusSpot} /> : null
        })()}

        {/* ランドマークスポット */}
        {visibleLayers.includes('landmarks') && landmarkSpots.map(spot => {
          const approved = spot.stamps.filter(s => s.status === 'approved')
          const icon = createLandmarkIcon(spot.area, approved.length > 0)
          return (
            <Marker key={`lm-${spot.spotId}`} position={[spot.lat, spot.lng]} icon={icon}>
              <Popup className="stamp-popup">
                <div className="popup-content">
                  <div className="popup-header">
                    <span className="popup-type-badge landmark">ランドマーク</span>
                    <strong>{spot.spotName}</strong>
                    <span className="popup-area">{AREA_LABELS[spot.area]}</span>
                  </div>
                  <div className="popup-stats">
                    {spot.stamps.length}候補 / <span style={{ color: '#4caf50' }}>{approved.length}承認</span>
                  </div>
                  <div className="popup-stamps">
                    {spot.stamps.slice(0, 4).map(s => (
                      <div key={s.id} className={`popup-stamp-thumb ${s.status}`}
                        onClick={() => onSelectSpot(spot.spotId)}>
                        <img src={`${import.meta.env.BASE_URL}${s.path}`} alt="" />
                      </div>
                    ))}
                  </div>
                  <button className="popup-view-btn" onClick={() => onSelectSpot(spot.spotId)}>
                    ギャラリーで見る
                  </button>
                  <button
                    onClick={() => handleEditLocation(spot.spotId, spot.spotName)}
                    style={{
                      marginTop: 6, width: '100%', padding: '6px',
                      background: 'none', border: '1px solid #4a9eff',
                      borderRadius: 4, color: '#4a9eff',
                      fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    位置を修正
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* データスポット（神社・寺院・駅） */}
        {dataPOIs.filter(p => visibleLayers.includes(p.category) && p.lat != null && p.lng != null).map(poi => {
          const icon = createDataSpotIcon(poi.category)
          const catLabel = { shrine: '神社', temple: '寺院', station: '駅' }[poi.category]
          return (
            <Marker key={`ds-${poi.osm_id}`} position={[poi.lat, poi.lng]} icon={icon}>
              <Popup className="stamp-popup">
                <div className="popup-content">
                  <div className="popup-header">
                    <span className={`popup-type-badge ${poi.category}`}>{catLabel}</span>
                    <strong>{poi.name}</strong>
                  </div>
                  {poi.name_en && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{poi.name_en}</div>
                  )}
                  <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                    データスポット（テンプレートスタンプ）
                  </div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                    {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
