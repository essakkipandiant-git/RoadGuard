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
  Radio,
} from "lucide-react"
import { RoadIssue, SeverityLevel } from "../types/roadguard"
import { SelectedLocation } from "./GlobeLocationPicker"
import { validateMumbaiLocation } from "../services/mumbaiBoundaryClient"

export interface Interactive2DMapProps {
  selectedLocation?: SelectedLocation | null
  onSelectLocation?: (location: SelectedLocation) => void
  issues?: RoadIssue[]
  selectedIssueId?: string
  onSelectIssue?: (issue: RoadIssue) => void
  initialCenter?: { lat: number; lng: number }
  initialZoom?: number
  height?: string | number
  className?: string
  showControls?: boolean
  showLayerToggle?: boolean
  showBoundaryIndicator?: boolean
  presetButtons?: boolean
  enableCircleScans?: boolean
  showRadarSweep?: boolean
}

// Preset urban exploration locations in Greater Mumbai
const QUICK_PRESETS = [
  { name: "Marine Drive", lat: 18.9438, lng: 72.8232, ward: "Ward A" },
  { name: "Bandra Bandstand", lat: 19.0544, lng: 72.8267, ward: "Ward H/W" },
  { name: "Dadar TT Circle", lat: 19.0178, lng: 72.8478, ward: "Ward G/N" },
  { name: "Andheri WEH Corridor", lat: 19.1136, lng: 72.8697, ward: "Ward K/E" },
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
  selectedIssueId,
  onSelectIssue,
  initialCenter = { lat: 19.0544, lng: 72.8267 }, // Greater Mumbai Bandra / Sea Link
  initialZoom = 13,
  height = "420px",
  className = "",
  showControls = true,
  showLayerToggle = true,
  showBoundaryIndicator = true,
  presetButtons = true,
  enableCircleScans = true,
  showRadarSweep = true,
}: Interactive2DMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tileBufferCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [center, setCenter] = useState<{ lat: number; lng: number }>(
    selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : initialCenter
  )
  const [zoom, setZoom] = useState<number>(initialZoom)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [layerType, setLayerType] = useState<"streets" | "satellite">("satellite")
  const [isLocating, setIsLocating] = useState(false)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [hoveredIssue, setHoveredIssue] = useState<RoadIssue | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [activePin, setActivePin] = useState<{ lat: number; lng: number } | null>(
    selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : null
  )

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
        const data = await res.json()
        const road = data.address?.road || data.address?.suburb || "City Roadway"
        const boundary = validateMumbaiLocation(lat, lng)
        const wardLabel = boundary.wardName ? ` (Ward ${boundary.wardName})` : ""
        const address =
          data.display_name?.split(",").slice(0, 3).join(",") ||
          `Municipal Roadway, Ward ${boundary.wardName || "Mumbai"}${wardLabel}`

        if (onSelectLocation) {
          onSelectLocation({
            lat,
            lng,
            address,
            city: "Mumbai",
            road,
          })
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

  // Handle click on canvas to select an issue or place location pin
  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const tileX = lon2tile(center.lng, zoom)
    const tileY = lat2tile(center.lat, zoom)
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    // Check if clicked near an existing issue
    for (const issue of issues) {
      const issueX = lon2tile(issue.coordinates.lng, zoom)
      const issueY = lat2tile(issue.coordinates.lat, zoom)
      const px = centerX + (issueX - tileX) * 256
      const py = centerY + (issueY - tileY) * 256

      const dist = Math.hypot(clickX - px, clickY - py)
      if (dist <= 22) {
        if (onSelectIssue) {
          onSelectIssue(issue)
          setActivePin({ lat: issue.coordinates.lat, lng: issue.coordinates.lng })
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

  // Mouse hover detection to identify issues under cursor
  const handleMapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    setMousePos({ x: mouseX, y: mouseY })

    if (isDragging) {
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
      return
    }

    // Hit test for hover tooltip
    const tileX = lon2tile(center.lng, zoom)
    const tileY = lat2tile(center.lat, zoom)
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    let found: RoadIssue | null = null
    for (const issue of issues) {
      const issueX = lon2tile(issue.coordinates.lng, zoom)
      const issueY = lat2tile(issue.coordinates.lat, zoom)
      const px = centerX + (issueX - tileX) * 256
      const py = centerY + (issueY - tileY) * 256

      if (Math.hypot(mouseX - px, mouseY - py) <= 16) {
        found = issue
        break
      }
    }
    setHoveredIssue(found)
  }

  // Pan via mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
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

  // Geolocation
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

  // Render Map Tiles into an Offscreen Tile Buffer Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    if (!tileBufferCanvasRef.current) {
      tileBufferCanvasRef.current = document.createElement("canvas")
    }
    const bufCanvas = tileBufferCanvasRef.current
    bufCanvas.width = canvas.width
    bufCanvas.height = canvas.height
    const bufCtx = bufCanvas.getContext("2d")
    if (!bufCtx) return

    const width = bufCanvas.width
    const height = bufCanvas.height
    const centerX = width / 2
    const centerY = height / 2

    // Dark charcoal base background
    bufCtx.fillStyle = layerType === "satellite" ? "#0D0E0C" : "#181916"
    bufCtx.fillRect(0, 0, width, height)

    // Compute tile range to draw
    const centerTileX = lon2tile(center.lng, zoom)
    const centerTileY = lat2tile(center.lat, zoom)

    const minTileX = Math.floor(centerTileX - centerX / 256) - 1
    const maxTileX = Math.floor(centerTileX + centerX / 256) + 1
    const minTileY = Math.floor(centerTileY - centerY / 256) - 1
    const maxTileY = Math.floor(centerTileY + centerY / 256) + 1

    const numTiles = Math.pow(2, zoom)

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
          if (!bufCtx) return
          bufCtx.drawImage(img, px, py, 256, 256)
        }
      }
    }

    // Grid markings
    bufCtx.strokeStyle = "rgba(255, 255, 255, 0.04)"
    bufCtx.lineWidth = 1
    for (let i = 0; i < width; i += 64) {
      bufCtx.beginPath()
      bufCtx.moveTo(i, 0)
      bufCtx.lineTo(i, height)
      bufCtx.stroke()
    }
    for (let j = 0; j < height; j += 64) {
      bufCtx.beginPath()
      bufCtx.moveTo(0, j)
      bufCtx.lineTo(width, j)
      bufCtx.stroke()
    }
  }, [center, zoom, layerType])

  // Continuous 60fps Scan Circle & Radar Sweep Animation Loop
  useEffect(() => {
    let animFrame: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const startTime = performance.now()

    const renderLoop = (now: number) => {
      const elapsed = now - startTime
      // Pulse cycles 0 -> 1 every 2.4s
      const pulse = (elapsed % 2400) / 2400
      // Radar beam rotates 360deg every 8s
      const sweepAngle = ((elapsed % 8000) / 8000) * Math.PI * 2

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 1. Draw cached map tiles from offscreen buffer
      if (tileBufferCanvasRef.current) {
        ctx.drawImage(tileBufferCanvasRef.current, 0, 0)
      }

      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const centerTileX = lon2tile(center.lng, zoom)
      const centerTileY = lat2tile(center.lat, zoom)

      // 2. Optional Radar Scanner Sweep Layer
      if (showRadarSweep) {
        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(sweepAngle)

        const maxRadius = Math.hypot(centerX, centerY)
        const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius)
        sweepGrad.addColorStop(0, "rgba(230, 83, 54, 0.12)")
        sweepGrad.addColorStop(1, "rgba(230, 83, 54, 0.0)")

        ctx.fillStyle = sweepGrad
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, maxRadius, -0.32, 0)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = "rgba(230, 83, 54, 0.45)"
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(maxRadius, 0)
        ctx.stroke()
        ctx.restore()
      }

      // 3. Render Live Pothole Reports with Red, Green, Yellow Circle Scan Layers
      issues.forEach((issue) => {
        const ix = lon2tile(issue.coordinates.lng, zoom)
        const iy = lat2tile(issue.coordinates.lat, zoom)
        const px = centerX + (ix - centerTileX) * 256
        const py = centerY + (iy - centerTileY) * 256

        // Skip if outside viewport
        if (px < -60 || px > canvas.width + 60 || py < -60 || py > canvas.height + 60) return

        const isResolved =
          issue.status === "verified_repaired" ||
          issue.status === "repair_completed" ||
          issue.status === "closed"
        const isCritical = issue.severity === "critical" || (issue.risk && issue.risk.score >= 80)
        const isHigh = issue.severity === "high" || (issue.risk && issue.risk.score >= 60)
        const isSelected = selectedIssueId === issue.id || selectedLocation?.address === issue.address

        // Define Color & RGB Channels
        let hexColor = "#E65336" // Red (Critical)
        let rgbColor = "230, 83, 54"

        if (isResolved) {
          hexColor = "#10B981" // Green (Repaired & Safe)
          rgbColor = "16, 185, 129"
        } else if (!isCritical && (isHigh || issue.severity === "moderate")) {
          hexColor = "#E69D36" // Yellow / Amber (High/Moderate Monitored)
          rgbColor = "230, 157, 54"
        } else if (issue.severity === "low") {
          hexColor = "#687567" // Grey-Olive (Low Distress)
          rgbColor = "104, 117, 103"
        }

        // --- CONCENTRIC CIRCLE SCAN LAYERS ---
        if (enableCircleScans) {
          // Ring 1 (Primary Wave)
          const r1 = 8 + pulse * 34
          const a1 = Math.max(0, 1 - pulse) * 0.7
          ctx.strokeStyle = `rgba(${rgbColor}, ${a1})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(px, py, r1, 0, Math.PI * 2)
          ctx.stroke()

          // Ring 2 (Secondary Phase Wave)
          const pulse2 = (pulse + 0.5) % 1
          const r2 = 8 + pulse2 * 34
          const a2 = Math.max(0, 1 - pulse2) * 0.4
          ctx.strokeStyle = `rgba(${rgbColor}, ${a2})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(px, py, r2, 0, Math.PI * 2)
          ctx.stroke()

          // Ring 3 (Wide Alert Ring for Critical Potholes Only)
          if (isCritical) {
            const pulse3 = (pulse + 0.25) % 1
            const r3 = 10 + pulse3 * 50
            const a3 = Math.max(0, 1 - pulse3) * 0.25
            ctx.strokeStyle = `rgba(230, 83, 54, ${a3})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(px, py, r3, 0, Math.PI * 2)
            ctx.stroke()
          }
        }

        // --- SOLID CORE BEACON PIN ---
        ctx.save()
        ctx.fillStyle = hexColor
        ctx.shadowColor = hexColor
        ctx.shadowBlur = isCritical ? 14 : 8
        ctx.beginPath()
        ctx.arc(px, py, isCritical ? 7.5 : 6, 0, Math.PI * 2)
        ctx.fill()

        // White inner core
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // --- TACTICAL TARGETING RETICLE FOR SELECTED DEFECT ---
        if (isSelected) {
          ctx.save()
          ctx.strokeStyle = "#FFFFFF"
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(px, py, 19, 0, Math.PI * 2)
          ctx.stroke()

          // Reticle tick crosshairs
          ctx.strokeStyle = hexColor
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(px - 24, py)
          ctx.lineTo(px - 14, py)
          ctx.moveTo(px + 14, py)
          ctx.lineTo(px + 24, py)
          ctx.moveTo(px, py - 24)
          ctx.lineTo(px, py - 14)
          ctx.moveTo(px, py + 14)
          ctx.lineTo(px, py + 24)
          ctx.stroke()

          // Pill tag above pin
          ctx.fillStyle = "rgba(18, 19, 17, 0.9)"
          ctx.strokeStyle = hexColor
          ctx.lineWidth = 1
          const tagText = `#${issue.trackingCode}`
          ctx.font = "bold 10px monospace"
          const tw = ctx.measureText(tagText).width + 12
          ctx.fillRect(px - tw / 2, py - 36, tw, 16)
          ctx.strokeRect(px - tw / 2, py - 36, tw, 16)
          ctx.fillStyle = "#FFFFFF"
          ctx.textAlign = "center"
          ctx.fillText(tagText, px, py - 24)
          ctx.restore()
        }
      })

      // 4. Render Active GPS or Custom Clicked Pin
      if (activePin) {
        const pinX = lon2tile(activePin.lng, zoom)
        const pinY = lat2tile(activePin.lat, zoom)
        const px = centerX + (pinX - centerTileX) * 256
        const py = centerY + (pinY - centerTileY) * 256

        ctx.save()
        // Pulse ring around pin
        const pinPulse = 14 + ((elapsed % 1800) / 1800) * 24
        const pinAlpha = Math.max(0, 1 - (elapsed % 1800) / 1800) * 0.8
        ctx.strokeStyle = `rgba(230, 83, 54, ${pinAlpha})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, pinPulse, 0, Math.PI * 2)
        ctx.stroke()

        // Pin head
        ctx.fillStyle = "#E65336"
        ctx.shadowColor = "#E65336"
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.arc(px, py - 18, 11, 0, Math.PI * 2)
        ctx.fill()

        // Pin needle
        ctx.beginPath()
        ctx.moveTo(px - 8, py - 14)
        ctx.lineTo(px, py)
        ctx.lineTo(px + 8, py - 14)
        ctx.closePath()
        ctx.fill()

        // Inner white dot
        ctx.fillStyle = "#FFFFFF"
        ctx.beginPath()
        ctx.arc(px, py - 18, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      animFrame = requestAnimationFrame(renderLoop)
    }

    animFrame = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(animFrame)
  }, [center, zoom, layerType, issues, activePin, selectedIssueId, enableCircleScans, showRadarSweep])

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
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden select-none border border-[#242522]/15 shadow-inner bg-[#121311] ${className}`}
      style={{ height }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Interactive 2D Street and Satellite Map with live pothole scans"
    >
      <canvas
        ref={canvasRef}
        onClick={handleMapClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp()
          setHoveredIssue(null)
          setMousePos(null)
        }}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Hover Tooltip */}
      {hoveredIssue && mousePos && (
        <div
          className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-lg bg-[#121311]/95 text-white border border-white/20 text-xs font-mono shadow-2xl backdrop-blur-md transform -translate-x-1/2 -translate-y-full mb-2"
          style={{ left: mousePos.x, top: mousePos.y - 12 }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                hoveredIssue.severity === "critical"
                  ? "bg-rose-500 animate-ping"
                  : hoveredIssue.severity === "high"
                    ? "bg-orange-500"
                    : "bg-emerald-500"
              }`}
            />
            <strong className="text-white text-[11px] font-sans">{hoveredIssue.title}</strong>
          </div>
          <div className="text-[10px] text-gray-300 flex items-center justify-between gap-3 mt-0.5">
            <span>{hoveredIssue.address.split(",")[0]}</span>
            <span className="text-orange-400 font-bold">RISK {hoveredIssue.risk?.score || 85}</span>
          </div>
        </div>
      )}

      {/* Live Scanning HUD Badge */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2">
        <div className="px-3 py-1 rounded-full bg-[#121311]/85 border border-white/15 text-[10px] font-mono text-white/90 backdrop-blur-md flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>LIVE POTHOLE TELEMETRY · 24 MCGM WARDS</span>
        </div>
      </div>

      {/* Top Right Map Controls */}
      {showControls && (
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
          {showLayerToggle && (
            <button
              type="button"
              onClick={() => setLayerType((l) => (l === "streets" ? "satellite" : "streets"))}
              className="p-2 rounded-xl bg-[#121311]/85 hover:bg-[#121311] text-white border border-white/15 backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 text-[11px] font-mono font-bold cursor-pointer"
              title="Toggle Street / Satellite Imagery"
            >
              <Layers size={14} className="text-orange-400" />
              <span>{layerType === "satellite" ? "Satellite" : "Street"}</span>
            </button>
          )}

          <div className="flex flex-col rounded-xl bg-[#121311]/85 border border-white/15 backdrop-blur-md overflow-hidden shadow-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(18, z + 1))}
              className="p-2 hover:bg-white/10 text-white transition-colors cursor-pointer border-b border-white/10"
              title="Zoom In (+)"
              aria-label="Zoom in"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(9, z - 1))}
              className="p-2 hover:bg-white/10 text-white transition-colors cursor-pointer"
              title="Zoom Out (-)"
              aria-label="Zoom out"
            >
              <Minus size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleLocateMe}
            disabled={isLocating}
            className="p-2 rounded-xl bg-[#121311]/85 hover:bg-[#121311] text-white border border-white/15 backdrop-blur-md transition-all shadow-lg cursor-pointer"
            title="Locate my position (GPS)"
            aria-label="Locate my GPS position"
          >
            {isLocating ? (
              <Loader2 size={14} className="animate-spin text-orange-400" />
            ) : (
              <LocateFixed size={14} className="text-orange-400" />
            )}
          </button>
        </div>
      )}

      {/* Bottom Bar: Presets & Boundary Jurisdiction Status */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {presetButtons && (
          <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap">
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
                className="px-2.5 py-1 rounded-lg bg-[#121311]/80 hover:bg-[#242522] text-white/90 border border-white/15 text-[10px] font-mono transition-all backdrop-blur-md cursor-pointer"
              >
                📍 {p.name}
              </button>
            ))}
          </div>
        )}

        {showBoundaryIndicator && boundaryStatus && (
          <div
            className={`pointer-events-auto px-2.5 py-1 rounded-xl text-[10px] font-mono font-semibold flex items-center gap-1.5 backdrop-blur-md border shadow-lg ${
              boundaryStatus.isInsideMumbai
                ? "bg-emerald-950/85 text-emerald-400 border-emerald-500/30"
                : "bg-red-950/85 text-red-400 border-red-500/30"
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
