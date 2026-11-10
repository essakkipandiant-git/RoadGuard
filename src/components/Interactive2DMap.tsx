import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import { RoadIssue, SeverityLevel } from "../types/roadguard"
import { SelectedLocation } from "./GlobeLocationPicker"
import { validateMumbaiLocation } from "../services/mumbaiBoundaryClient"

interface Interactive2DMapProps {
  selectedLocation?: SelectedLocation | null
  onSelectLocation?: (location: SelectedLocation) => void
  issues?: RoadIssue[]
  onSelectIssue?: (issue: RoadIssue) => void
  initialCenter?: { lat: number; lng: number }
  initialZoom?: number
  height?: string | number
  className?: string
  showControls?: boolean
  showLayerToggle?: boolean
  showBoundaryIndicator?: boolean
  presetButtons?: boolean
}

// Preset urban exploration locations
const QUICK_PRESETS = [
  { name: "Marine Drive", lat: 18.9438, lng: 72.8232, ward: "Ward A" },
  { name: "Bandra Promenade", lat: 19.0434, lng: 72.8197, ward: "Ward H/West" },
  { name: "Dadar TT Circle", lat: 19.0178, lng: 72.8478, ward: "Ward G/North" },
  { name: "Andheri Link Road", lat: 19.1197, lng: 72.8468, ward: "Ward K/West" },
]

// Web Mercator coordinate conversion functions
function lon2tile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom)
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  )
}

function tile2lon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180
}

function tile2lat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom)
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

export default function Interactive2DMap({
  selectedLocation,
  onSelectLocation,
  issues = [],
  onSelectIssue,
  initialCenter = { lat: 19.076, lng: 72.8777 }, // Mumbai Municipal Corporation Center
  initialZoom = 13,
  height = "420px",
  className = "",
  showControls = true,
  showLayerToggle = true,
  showBoundaryIndicator = true,
  presetButtons = true,
}: Interactive2DMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : initialCenter
  )
  const [zoom, setZoom] = useState<number>(initialZoom)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [layerType, setLayerType] = useState<"streets" | "satellite">("streets")
  const [isLocating, setIsLocating] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [activePin, setActivePin] = useState<{ lat: number; lng: number } | null>(
    selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : null
  )
  const [tileErrorCount, setTileErrorCount] = useState(0)

  // Sync activePin if selectedLocation prop changes from outside
  useEffect(() => {
    if (selectedLocation) {
      setActivePin({ lat: selectedLocation.lat, lng: selectedLocation.lng })
      setCenter({ lat: selectedLocation.lat, lng: selectedLocation.lng })
    }
  }, [selectedLocation])

  // Boundary verification for current pin
  const boundaryStatus = useMemo(() => {
    if (!activePin) return null
    return validateMumbaiLocation(activePin.lat, activePin.lng)
  }, [activePin])

  // Reverse geocode clicked coordinates
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setIsGeocoding(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: { "Accept-Language": "en" },
          }
        )
        if (res.ok) {
          const data = await res.json()
          const road =
            data.address?.road ||
            data.address?.pedestrian ||
            data.address?.suburb ||
            data.address?.neighbourhood ||
            "City Roadway"
          const city =
            data.address?.city ||
            data.address?.state_district ||
            data.address?.state ||
            "Greater Mumbai"
          const fullAddress = data.display_name || `${road}, ${city}`

          if (onSelectLocation) {
            onSelectLocation({
              lat,
              lng,
              address: fullAddress,
              city,
              road,
            })
          }
        } else {
          fallbackLocation(lat, lng)
        }
      } catch {
        fallbackLocation(lat, lng)
      } finally {
        setIsGeocoding(false)
      }
    },
    [onSelectLocation]
  )

  const fallbackLocation = (lat: number, lng: number) => {
    const boundary = validateMumbaiLocation(lat, lng)
    const wardLabel = boundary.wardName ? ` (Ward ${boundary.wardName})` : ""
    const address = boundary.isInsideMumbai
      ? `Municipal Roadway, Ward ${boundary.wardName || "Mumbai"}${wardLabel}`
      : `Coordinates ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`

    if (onSelectLocation) {
      onSelectLocation({
        lat,
        lng,
        address,
        city: "Mumbai",
        road: "City Roadway",
      })
    }
  }

  // Handle click on canvas to place location pin
  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Check if clicked near an existing issue
    const tileX = lon2tile(center.lng, zoom)
    const tileY = lat2tile(center.lat, zoom)
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    for (const issue of issues) {
      const issueX = lon2tile(issue.coordinates.lng, zoom)
      const issueY = lat2tile(issue.coordinates.lat, zoom)
      const px = centerX + (issueX - tileX) * 256
      const py = centerY + (issueY - tileY) * 256

      const dist = Math.hypot(clickX - px, clickY - py)
      if (dist <= 18) {
        if (onSelectIssue) {
          onSelectIssue(issue)
          return
        }
      }
    }

    // Convert pixel to lat/lng
    const clickedTileX = tileX + (clickX - centerX) / 256
    const clickedTileY = tileY + (clickY - centerY) / 256
    const clickedLng = tile2lon(clickedTileX, zoom)
    const clickedLat = tile2lat(clickedTileY, zoom)

    setActivePin({ lat: clickedLat, lng: clickedLng })
    reverseGeocode(clickedLat, clickedLng)
  }

  // Pan via mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      const tileX = lon2tile(center.lng, zoom) - dx / 256
      const tileY = lat2tile(center.lat, zoom) - dy / 256
      setCenter({
        lat: tile2lat(tileY, zoom),
        lng: tile2lon(tileX, zoom),
      })
      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(18, z + 1))
    } else {
      setZoom((z) => Math.max(9, z - 1))
    }
  }

  // Geolocation: locate current user
  const handleLocateMe = () => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCenter({ lat, lng })
        setZoom(16)
        setActivePin({ lat, lng })
        reverseGeocode(lat, lng)
      },
      () => {
        setIsLocating(false)
      },
      { timeout: 8000 }
    )
  }

  // Render map tiles and pins onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions to display size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2

    // Dark charcoal base background
    ctx.fillStyle = layerType === "satellite" ? "#0D0E0C" : "#181916"
    ctx.fillRect(0, 0, width, height)

    // Compute tile range to draw
    const centerTileX = lon2tile(center.lng, zoom)
    const centerTileY = lat2tile(center.lat, zoom)

    const minTileX = Math.floor(centerTileX - centerX / 256) - 1
    const maxTileX = Math.floor(centerTileX + centerX / 256) + 1
    const minTileY = Math.floor(centerTileY - centerY / 256) - 1
    const maxTileY = Math.floor(centerTileY + centerY / 256) + 1

    const numTiles = Math.pow(2, zoom)

    // Load and draw raster tiles
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        if (y < 0 || y >= numTiles) continue
        const wrappedX = ((x % numTiles) + numTiles) % numTiles

        const tileUrl =
          layerType === "satellite"
            ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${wrappedX}`
            : `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`

        const px = centerX + (x - centerTileX) * 256
        const py = centerY + (y - centerTileY) * 256

        const img = new Image()
        img.crossOrigin = "anonymous"
        img.src = tileUrl
        img.onload = () => {
          if (!canvas) return
          ctx.drawImage(img, px, py, 256, 256)
          // Re-render pins over loaded tiles
          renderOverlayElements(ctx, centerX, centerY, centerTileX, centerTileY)
        }
        img.onerror = () => {
          setTileErrorCount((c) => c + 1)
        }
      }
    }

    // Grid fallback if offline / tiles delayed
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"
    ctx.lineWidth = 1
    for (let i = 0; i < width; i += 64) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, height)
      ctx.stroke()
    }
    for (let j = 0; j < height; j += 64) {
      ctx.beginPath()
      ctx.moveTo(0, j)
      ctx.lineTo(width, j)
      ctx.stroke()
    }

    renderOverlayElements(ctx, centerX, centerY, centerTileX, centerTileY)
  }, [center, zoom, layerType, issues, activePin])

  // Helper to render pins and boundary overlays
  const renderOverlayElements = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    centerTileX: number,
    centerTileY: number
  ) => {
    // 1. Draw existing issues on map
    issues.forEach((issue) => {
      const ix = lon2tile(issue.coordinates.lng, zoom)
      const iy = lat2tile(issue.coordinates.lat, zoom)
      const px = centerX + (ix - centerTileX) * 256
      const py = centerY + (iy - centerTileY) * 256

      let color = "#E65336" // Critical (Vermilion)
      if (issue.status === "verified_repaired" || issue.status === "repair_completed" || issue.status === "closed") {
        color = "#10B981" // Emerald
      } else if (issue.severity === "high") {
        color = "#F16649" // Coral
      } else if (issue.severity === "moderate") {
        color = "#E69D36" // Amber
      } else if (issue.severity === "low") {
        color = "#687567" // Olive
      }

      // Outer glow circle
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // White inner ring
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fill()
    })

    // 2. Draw user active selected pin
    if (activePin) {
      const pinX = lon2tile(activePin.lng, zoom)
      const pinY = lat2tile(activePin.lat, zoom)
      const px = centerX + (pinX - centerTileX) * 256
      const py = centerY + (pinY - centerTileY) * 256

      // Radar pulse ring
      ctx.strokeStyle = "rgba(230, 83, 54, 0.75)"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, 18, 0, Math.PI * 2)
      ctx.stroke()

      // Pin head
      ctx.fillStyle = "#E65336"
      ctx.shadowColor = "#E65336"
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(px, py - 18, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Pin needle
      ctx.beginPath()
      ctx.moveTo(px - 9, py - 14)
      ctx.lineTo(px, py)
      ctx.lineTo(px + 9, py - 14)
      ctx.closePath()
      ctx.fill()

      // Inner cream dot
      ctx.fillStyle = "#F5F1E8"
      ctx.beginPath()
      ctx.arc(px, py - 18, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const panStep = 0.005 / Math.pow(2, zoom - 13)
    if (e.key === "ArrowUp") {
      setCenter((c) => ({ ...c, lat: c.lat + panStep }))
      e.preventDefault()
    } else if (e.key === "ArrowDown") {
      setCenter((c) => ({ ...c, lat: c.lat - panStep }))
      e.preventDefault()
    } else if (e.key === "ArrowLeft") {
      setCenter((c) => ({ ...c, lng: c.lng - panStep }))
      e.preventDefault()
    } else if (e.key === "ArrowRight") {
      setCenter((c) => ({ ...c, lng: c.lng + panStep }))
      e.preventDefault()
    } else if (e.key === "+" || e.key === "=") {
      setZoom((z) => Math.min(18, z + 1))
      e.preventDefault()
    } else if (e.key === "-") {
      setZoom((z) => Math.max(9, z - 1))
      e.preventDefault()
    } else if (e.key === "Enter" || e.key === " ") {
      setActivePin(center)
      reverseGeocode(center.lat, center.lng)
      e.preventDefault()
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl overflow-hidden border border-white/10 bg-slate-950/80 shadow-2xl select-none ${className}`}
      style={{ height }}
      tabIndex={0}
      role="region"
      aria-label="Interactive 2D Street Map: Click or use Arrow Keys to pan and Enter to select location pin"
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair block"
        onClick={handleMapClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Crosshair indicator in center */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
        <Crosshair className="w-8 h-8 text-amber-500" />
      </div>

      {/* Top Left: Layer Toggle & Presets */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 z-10">
        {showLayerToggle && (
          <div className="flex bg-slate-900/85 backdrop-blur-md p-0.5 rounded-lg border border-white/10 shadow-lg text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setLayerType("streets")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                layerType === "streets"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Streets
            </button>
            <button
              type="button"
              onClick={() => setLayerType("satellite")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                layerType === "satellite"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Satellite
            </button>
          </div>
        )}

        {presetButtons && (
          <div className="hidden sm:flex items-center gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setCenter({ lat: p.lat, lng: p.lng })
                  setZoom(15)
                  setActivePin({ lat: p.lat, lng: p.lng })
                  reverseGeocode(p.lat, p.lng)
                }}
                className="px-2 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-amber-400 text-[10px] font-mono rounded-md border border-white/10 backdrop-blur-md transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top Right: Zoom & Locate Controls */}
      {showControls && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(18, z + 1))}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 shadow-lg transition-colors focus:ring-2 focus:ring-amber-500 outline-none"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(9, z - 1))}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 shadow-lg transition-colors focus:ring-2 focus:ring-amber-500 outline-none"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={isLocating}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-amber-400 flex items-center justify-center border border-white/10 shadow-lg transition-colors focus:ring-2 focus:ring-amber-500 outline-none"
            aria-label="Find my location"
            title="Use current GPS position"
          >
            {isLocating ? <Loader2 size={16} className="animate-spin text-amber-500" /> : <LocateFixed size={16} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setCenter(initialCenter)
              setZoom(initialZoom)
            }}
            className="w-8 h-8 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-white/10 shadow-lg transition-colors"
            aria-label="Reset map view"
            title="Reset to Mumbai Center"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      )}

      {/* Bottom Bar: Coordinate readout and Municipal boundary feedback */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
          <MapPin size={13} className="text-amber-500 flex-shrink-0" />
          <span className="text-[11px] font-mono text-slate-200">
            {activePin
              ? `${activePin.lat.toFixed(5)}° N, ${activePin.lng.toFixed(5)}° E`
              : "Click anywhere on map to pin road defect"}
          </span>
          {isGeocoding && <Loader2 size={12} className="animate-spin text-amber-400 ml-1" />}
        </div>

        {showBoundaryIndicator && boundaryStatus && (
          <div
            className={`pointer-events-auto px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold flex items-center gap-1.5 backdrop-blur-md border shadow-lg ${
              boundaryStatus.isInsideMumbai
                ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/80 text-red-400 border-red-500/30"
            }`}
          >
            {boundaryStatus.isInsideMumbai ? (
              <>
                <ShieldCheck size={12} className="text-emerald-400" />
                <span>MCGM MUMBAI JURISDICTION (WARD {boundaryStatus.wardName || "VALID"})</span>
              </>
            ) : (
              <>
                <ShieldAlert size={12} className="text-red-400" />
                <span>OUTSIDE GREATER MUMBAI</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
