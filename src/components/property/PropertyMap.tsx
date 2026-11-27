import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L, { type LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { DEFAULT_CENTER } from '@/lib/constants'
import { BUCKETS, publicUrl } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import type { Listing } from '@/types/db'

function priceIcon(rent: number, active: boolean) {
  const label = rent >= 100000 ? `₹${(rent / 100000).toFixed(1)}L` : rent >= 1000 ? `₹${Math.round(rent / 1000)}k` : `₹${rent}`
  return L.divIcon({ className: '', html: `<span class="price-marker${active ? ' active' : ''}">${label}</span>`, iconSize: [0, 0] })
}

export const userIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.3);transform:translate(-50%,-50%)"></span>',
  iconSize: [0, 0],
})

function BoundsWatcher({ onChange }: { onChange?: (b: LatLngBounds) => void }) {
  const map = useMapEvents({ moveend: () => onChange?.(map.getBounds()) })
  useEffect(() => { onChange?.(map.getBounds()) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function FlyTo({ center, zoom }: { center?: [number, number] | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => { if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 }) }, [center, zoom, map])
  return null
}

export function PropertyMap({ listings, onBoundsChange, activeId, onMarkerClick, center, userLocation, className, zoom = 13 }: {
  listings: Listing[]
  onBoundsChange?: (b: LatLngBounds) => void
  activeId?: string | null
  onMarkerClick?: (id: string) => void
  center?: [number, number] | null
  userLocation?: [number, number] | null
  className?: string
  zoom?: number
}) {
  const points = useMemo(() => listings.filter((l) => l.latitude != null && l.longitude != null), [listings])
  return (
    <MapContainer center={center ?? DEFAULT_CENTER} zoom={zoom} className={className ?? 'h-full w-full'} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <BoundsWatcher onChange={onBoundsChange} />
      <FlyTo center={center} />
      {userLocation && <Marker position={userLocation} icon={userIcon}><Popup>You are here</Popup></Marker>}
      {points.map((l) => (
        <Marker key={l.id} position={[l.latitude!, l.longitude!]} icon={priceIcon(Number(l.rent_amount), l.id === activeId)} eventHandlers={{ click: () => onMarkerClick?.(l.id) }}>
          <Popup>
            <Link to={`/property/${l.id}`} className="block w-48 text-inherit no-underline">
              {l.cover_path && <img src={publicUrl(BUCKETS.propertyImages, l.cover_path)!} alt="" className="mb-1 h-24 w-full rounded object-cover" />}
              <strong className="block text-sm">{l.title}</strong>
              <span className="text-xs">{l.configuration} · {formatINR(l.rent_amount)}/mo</span>
              <span className="block text-xs text-gray-500">{l.area}</span>
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

/** Click-to-place single marker, used in the property form. */
export function LocationPicker({ value, onChange, className }: {
  value: { lat: number; lng: number } | null
  onChange: (v: { lat: number; lng: number }) => void
  className?: string
}) {
  function ClickHandler() {
    useMapEvents({ click: (e) => onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }) })
    return null
  }
  const pin = L.divIcon({
    className: '',
    html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;background:hsl(190 77% 24%);border:3px solid #fff;transform:translate(-50%,-100%) rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>',
    iconSize: [0, 0],
  })
  const center: [number, number] = value ? [value.lat, value.lng] : DEFAULT_CENTER
  return (
    <MapContainer center={center} zoom={value ? 16 : 13} className={className ?? 'h-64 w-full rounded-lg'}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler />
      <FlyTo center={value ? [value.lat, value.lng] : null} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={pin}
          draggable
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onChange({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) }) } }}
        />
      )}
    </MapContainer>
  )
}
