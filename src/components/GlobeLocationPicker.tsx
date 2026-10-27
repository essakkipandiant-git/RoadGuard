import React, { useEffect, useRef, useState, useCallback } from "react"
import * as Cesium from "cesium"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  Check,
  Compass,
  Copy,
  Crosshair,
  Filter,
  Globe as GlobeIcon,
  Layers,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { RoadIssue, SeverityLevel } from "../types/roadguard"

// Optional Cesium Ion Token from environment
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ""
if (CESIUM_ION_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN
}

export type SelectedLocation = {
  lat: number
  lng: number
  height?: number
  address: string
  city?: string
  road?: string
}

type GlobeLocationPickerProps = {
  isOpen: boolean
  onClose: () => void
  onConfirmLocation: (location: SelectedLocation) => void
  initialLocation?: { lat: number; lng: number }
  issues?: RoadIssue[]
  onSelectIssue?: (issue: RoadIssue) => void
}

// Preset quick locations for immediate exploration
const PRESET_LOCATIONS = [
  {
    name: "Harbour Ave (London)",
    lat: 51.5082,
    lng: -0.1245,
    city: "London, UK",
  },
  {
    name: "Marine Drive (Mumbai)",
    lat: 18.9438,
    lng: 72.8232,
    city: "Mumbai, India",
  },
  {
    name: "MG Road (Bengaluru)",
    lat: 12.9756,
    lng: 77.6066,
    city: "Bengaluru, India",
  },
  {
    name: "Connaught Place (Delhi)",
    lat: 28.6315,
    lng: 77.2167,
    city: "New Delhi, India",
  },
  {
    name: "Times Square (New York)",
    lat: 40.758,
    lng: -73.9855,
    city: "New York, USA",
  },
]

export default function GlobeLocationPicker({
  isOpen,
  onClose,
  onConfirmLocation,
  initialLocation,
  issues = [],
  onSelectIssue,
}: GlobeLocationPickerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const markerEntityRef = useRef<Cesium.Entity | null>(null)
  const pulseEntityRef = useRef<Cesium.Entity | null>(null)
  const issueEntitiesRef = useRef<Cesium.Entity[]>([])

  // UI state
  const [searchQuery, setSearchQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [selectedLoc, setSelectedLoc] = useState<SelectedLocation | null>(null)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [mapMode, setMapMode] = useState<"satellite" | "streets">("satellite")
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<"space" | "regional" | "street">(
    "space",
  )

  // Filters for globe issue markers
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [severityFilter, setSeverityFilter] = useState<string>("all")

  // Generate high-tech colored pin icon data URL
  const getMarkerIcon = useCallback(
    (color: string = "#E65336") => {
      const canvas = document.createElement("canvas")
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext("2d")
      if (!ctx) return ""

      // Outer glow
      ctx.shadowColor = color
      ctx.shadowBlur = 12

      // Pin head circle
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(32, 22, 14, 0, Math.PI * 2)
      ctx.fill()

      // Pin needle triangle pointing downward
      ctx.beginPath()
      ctx.moveTo(22, 26)
      ctx.lineTo(32, 54)
      ctx.lineTo(42, 26)
      ctx.closePath()
      ctx.fill()

      // Inner bright cream core
      ctx.shadowBlur = 0
      ctx.fillStyle = "#F5F1E8"
      ctx.beginPath()
      ctx.arc(32, 22, 5.5, 0, Math.PI * 2)
      ctx.fill()

      return canvas.toDataURL()
    },
    [],
  )

  // Update or place marker at specific lat/lng for user selection
  const placeMarker = useCallback(
    (lat: number, lng: number, addressText: string) => {
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return

      // Remove existing marker and pulse
      if (markerEntityRef.current) {
        viewer.entities.remove(markerEntityRef.current)
        markerEntityRef.current = null
      }
      if (pulseEntityRef.current) {
        viewer.entities.remove(pulseEntityRef.current)
        pulseEntityRef.current = null
      }

      // Add radar pulse ring on ground
      pulseEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 2),
        ellipse: {
          semiMinorAxis: 24.0,
          semiMajorAxis: 24.0,
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString("rgba(230, 83, 54, 0.45)"),
          ),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#E65336"),
          outlineWidth: 2,
        },
      })

      // Add Vermilion Pin Billboard
      markerEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 10),
        billboard: {
          image: getMarkerIcon("#E65336"),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          width: 48,
          height: 48,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      setSelectedLoc({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        address: addressText,
      })
    },
    [getMarkerIcon],
  )

  // Reverse geocode coordinates using OSM Nominatim
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setIsGeocoding(true)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              "Accept-Language": "en",
            },
          },
        )
        if (response.ok) {
          const data = await response.json()
          const road =
            data.address?.road ||
            data.address?.pedestrian ||
            data.address?.suburb ||
            data.address?.neighbourhood ||
            "Street Location"
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.municipality ||
            data.address?.county ||
            data.address?.country ||
            ""
          const fullAddress = data.display_name || `${road}, ${city}`
          placeMarker(lat, lng, fullAddress)
        } else {
          placeMarker(
            lat,
            lng,
            `Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
          )
        }
      } catch (err) {
        placeMarker(
          lat,
          lng,
          `Selected Point (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`,
        )
      } finally {
        setIsGeocoding(false)
      }
    },
    [placeMarker],
  )

  // Fly camera to destination coordinates
  const flyToCoords = useCallback(
    (
      lat: number,
      lng: number,
      targetHeight: number = 600,
      address?: string,
    ) => {
      const viewer = viewerRef.current
      if (!viewer || viewer.isDestroyed()) return

      setLocationError(null)
      setSearchError(null)

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, targetHeight),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-50),
          roll: 0.0,
        },
        duration: 2.2,
        complete: () => {
          if (address) {
            placeMarker(lat, lng, address)
          } else {
            reverseGeocode(lat, lng)
          }
        },
      })
    },
    [placeMarker, reverseGeocode],
  )

  // Reset to full orbital Earth view
  const flyToWholeGlobe = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-0.1245, 51.5082, 16000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0.0,
      },
      duration: 2.0,
    })
  }, [])

  // Update live issues rendered on the 3D Globe
  const updateIssueEntitiesOnGlobe = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    // Remove existing issue markers
    issueEntitiesRef.current.forEach((entity) => {
      viewer.entities.remove(entity)
    })
    issueEntitiesRef.current = []

    // Filter issues
    const filtered = issues.filter((issue) => {
      if (statusFilter !== "all" && issue.status !== statusFilter) return false
      if (severityFilter !== "all" && issue.severity !== severityFilter)
        return false
      return true
    })

    // Add each issue as a 3D pin with severity color
    filtered.forEach((issue) => {
      let pinColor = "#E65336" // Vermilion (critical)
      if (issue.status === "verified_repaired") {
        pinColor = "#10B981" // Emerald
      } else if (issue.severity === "high") {
        pinColor = "#F16649" // Coral
      } else if (issue.severity === "moderate") {
        pinColor = "#E69D36" // Amber
      } else if (issue.severity === "low") {
        pinColor = "#687567" // Olive
      }

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          issue.coordinates.lng,
          issue.coordinates.lat,
          12,
        ),
        billboard: {
          image: getMarkerIcon(pinColor),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          width: 44,
          height: 44,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `#${issue.trackingCode} (${issue.risk.score}/100)`,
          font: "bold 12px 'DM Mono', monospace, sans-serif",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.fromCssColorString("#F5F1E8"),
          outlineColor: Cesium.Color.fromCssColorString("#242522"),
          outlineWidth: 3,
          pixelOffset: new Cesium.Cartesian2(0, -48),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0.0,
            50000.0,
          ),
        },
      })

      // Attach issue reference to entity
      ;(entity as any)._issueData = issue
      issueEntitiesRef.current.push(entity)
    })
  }, [issues, statusFilter, severityFilter, getMarkerIcon])

  // Geolocation API: "Use My Location"
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.")
      return
    }

    setIsLocating(true)
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        const { latitude, longitude } = pos.coords
        flyToCoords(latitude, longitude, 500)
      },
      (err) => {
        setIsLocating(false)
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError(
              "Location access was denied. Please allow location access or search your street.",
            )
            break
          case err.POSITION_UNAVAILABLE:
            setLocationError(
              "GPS signal unavailable. Please use the search bar.",
            )
            break
          case err.TIMEOUT:
            setLocationError("Location request timed out. Please try again.")
            break
          default:
            setLocationError("Unable to acquire location.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  // Search geocoding
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) return

    // Check if input is direct coordinates e.g. "51.5074, -0.1278"
    const coordMatch = searchQuery.match(
      /^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/,
    )
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[3])
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSuggestions([])
        flyToCoords(lat, lng, 500)
        return
      }
    }

    setIsSearching(true)
    setSearchError(null)

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery,
        )}&addressdetails=1&limit=5`,
        {
          headers: { "Accept-Language": "en" },
        },
      )
      if (res.ok) {
        const data = await res.json()
        if (data && data.length > 0) {
          setSuggestions(data)
        } else {
          setSearchError(
            "No locations found. Try entering a city, neighbourhood or street name.",
          )
          setSuggestions([])
        }
      } else {
        setSearchError("Geocoding service unavailable. Please try again.")
      }
    } catch {
      setSearchError("Network error while searching locations.")
    } finally {
      setIsSearching(false)
    }
  }

  // Zoom controls
  const handleZoomIn = () => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const currentHeight = viewerRef.current.camera.positionCartographic.height
    viewerRef.current.camera.zoomIn(Math.max(currentHeight * 0.4, 50))
  }

  const handleZoomOut = () => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return
    const currentHeight = viewerRef.current.camera.positionCartographic.height
    viewerRef.current.camera.zoomOut(Math.max(currentHeight * 0.5, 100))
  }

  // Initialize Cesium Viewer
  useEffect(() => {
    if (!isOpen || !cesiumContainerRef.current) return

    ;(window as any).CESIUM_BASE_URL = "/cesium/"

    // Satellite base layer
    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "© Esri, Maxar, Earthstar Geographics",
    })

    satelliteProvider.errorEvent.addEventListener((e) => {
      console.warn("Satellite imagery notice:", e)
    })

    const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyBox: false,
      baseLayer: new Cesium.ImageryLayer(satelliteProvider),
      skyAtmosphere: new Cesium.SkyAtmosphere(),
    })

    // Suppress fatal error modal popup and keep rendering smoothly
    viewer.cesiumWidget.showErrorPanel = (title: string, message: string, error: any) => {
      console.warn("Cesium render notice:", title, message, error)
    }

    viewerRef.current = viewer

    // Road lines overlay
    const roadOverlayProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
    })

    roadOverlayProvider.errorEvent.addEventListener((e) => {
      console.warn("Road overlay imagery notice:", e)
    })

    viewer.imageryLayers.addImageryProvider(roadOverlayProvider)

    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.depthTestAgainstTerrain = false
    viewer.scene.globe.show = true
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#181916")
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()

    if (CESIUM_ION_TOKEN) {
      Cesium.createWorldTerrainAsync()
        .then((tp) => {
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.terrainProvider = tp
          }
        })
        .catch(() => {})
    }

    // Screen Space Left Click: Ray Picking or Issue Pin Click
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

    handler.setInputAction((movement: any) => {
      // Check if user clicked on an existing road issue marker
      const pickedObject = viewer.scene.pick(movement.position)
      if (
        Cesium.defined(pickedObject) &&
        pickedObject.id &&
        (pickedObject.id as any)._issueData
      ) {
        if (onSelectIssue) {
          onSelectIssue((pickedObject.id as any)._issueData)
          return
        }
      }

      // Otherwise pick coordinates on the terrain
      const ray = viewer.camera.getPickRay(movement.position)
      if (!ray) return

      const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
      if (Cesium.defined(cartesian)) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        const lat = Cesium.Math.toDegrees(cartographic.latitude)
        const lng = Cesium.Math.toDegrees(cartographic.longitude)
        reverseGeocode(lat, lng)
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // Initial camera placement
    if (initialLocation) {
      flyToCoords(initialLocation.lat, initialLocation.lng, 500)
    } else {
      // Start centered on London
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-0.1245, 51.5082, 3500),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
      })
    }

    // Camera height zoom listener
    const removeCameraListener = viewer.camera.changed.addEventListener(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return
      const height = viewerRef.current.camera.positionCartographic.height
      if (height > 2000000) setZoomLevel("space")
      else if (height > 50000) setZoomLevel("regional")
      else setZoomLevel("street")
    })

    return () => {
      removeCameraListener()
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
    }
  }, [isOpen, initialLocation, flyToCoords, reverseGeocode, onSelectIssue])

  // Sync issue entities whenever issues or filters change
  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      updateIssueEntitiesOnGlobe()
    }
  }, [issues, statusFilter, severityFilter, updateIssueEntitiesOnGlobe])

  // Toggle map layers (Satellite vs Streets)
  const toggleMapMode = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const newMode = mapMode === "satellite" ? "streets" : "satellite"
    setMapMode(newMode)

    viewer.imageryLayers.removeAll()

    if (newMode === "streets") {
      const osmProvider = new Cesium.UrlTemplateImageryProvider({
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maximumLevel: 19,
        credit: "© OpenStreetMap contributors",
      })
      osmProvider.errorEvent.addEventListener((e) => {
        console.warn("OSM imagery notice:", e)
      })
      viewer.imageryLayers.addImageryProvider(osmProvider)
    } else {
      const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
        credit: "© Esri, Maxar",
      })
      satelliteProvider.errorEvent.addEventListener((e) => {
        console.warn("Satellite imagery notice:", e)
      })
      viewer.imageryLayers.addImageryProvider(satelliteProvider)

      const roadOverlay = new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
      })
      roadOverlay.errorEvent.addEventListener((e) => {
        console.warn("Road overlay imagery notice:", e)
      })
      viewer.imageryLayers.addImageryProvider(roadOverlay)
    }
  }

  const copyCoordinates = () => {
    if (!selectedLoc) return
    navigator.clipboard.writeText(`${selectedLoc.lat}, ${selectedLoc.lng}`)
    setCopiedCoords(true)
    setTimeout(() => setCopiedCoords(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="globe-modal-overlay">
      {/* 3D Earth Cesium Canvas */}
      <div ref={cesiumContainerRef} className="cesium-viewport" />

      {/* Top Floating Glass Bar: Search & Location Controls */}
      <div className="globe-top-bar">
        {/* Back Button */}
        <button
          onClick={onClose}
          className="globe-back-btn glass"
          aria-label="Return to website"
        >
          <ArrowLeft size={18} />
          <span className="desktop-only">BACK TO OVERVIEW</span>
        </button>

        {/* Search Bar */}
        <div className="globe-search-wrapper">
          <form
            onSubmit={handleSearchSubmit}
            className="globe-search-form glass"
          >
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search street, city, or coordinates (lat, lng)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (searchError) setSearchError(null)
              }}
              className="globe-search-input"
            />
            {isSearching && (
              <Loader2 size={16} className="search-spinner animate-spin" />
            )}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSuggestions([])
                }}
                className="search-clear-btn"
              >
                <X size={14} />
              </button>
            )}
            <button type="submit" className="search-submit-btn">
              SCAN
            </button>
          </form>

          {/* Autocomplete Suggestions Dropdown */}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                className="globe-suggestions-dropdown glass"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const lat = parseFloat(item.lat)
                      const lng = parseFloat(item.lon)
                      setSuggestions([])
                      setSearchQuery(item.display_name.split(",")[0])
                      flyToCoords(lat, lng, 500, item.display_name)
                    }}
                    className="suggestion-item"
                  >
                    <MapPin
                      size={14}
                      className="text-vermilion flex-shrink-0"
                    />
                    <span>{item.display_name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {searchError && (
            <div className="search-error-msg">
              <span>{searchError}</span>
            </div>
          )}
        </div>

        {/* Use My Location Button */}
        <button
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="globe-locate-btn glass"
          title="Detect and fly to current GPS position"
        >
          {isLocating ? (
            <Loader2 size={16} className="animate-spin text-vermilion" />
          ) : (
            <LocateFixed size={16} />
          )}
          <span className="desktop-only">USE MY LOCATION</span>
        </button>
      </div>

      {/* Preset Quick Locations Bar & Issue Legend */}
      <div className="globe-presets-bar desktop-only">
        <span className="presets-label">QUICK CITIES:</span>
        {PRESET_LOCATIONS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => {
              setSearchQuery(preset.name)
              flyToCoords(
                preset.lat,
                preset.lng,
                500,
                `${preset.name}, ${preset.city}`,
              )
            }}
            className="preset-chip glass"
          >
            <MapPin size={11} className="text-vermilion" />
            <span>{preset.name}</span>
          </button>
        ))}

        <div className="globe-pins-legend glass ml-auto">
          <span className="legend-chip">
            <span className="legend-dot-crit" /> Critical
          </span>
          <span className="legend-chip">
            <span className="legend-dot-high" /> High
          </span>
          <span className="legend-chip">
            <span className="legend-dot-mod" /> Moderate
          </span>
          <span className="legend-chip">
            <span className="legend-dot-rep" /> Repaired
          </span>
        </div>
      </div>

      {/* Floating Right Navigation Controls: Zoom, Reset, Layer Toggle */}
      <div className="globe-nav-controls">
        <button
          onClick={handleZoomIn}
          className="ctrl-btn glass"
          title="Zoom in"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={handleZoomOut}
          className="ctrl-btn glass"
          title="Zoom out"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={flyToWholeGlobe}
          className="ctrl-btn glass"
          title="Return to whole Earth"
        >
          <GlobeIcon size={18} />
        </button>
        <button
          onClick={toggleMapMode}
          className={`ctrl-btn glass ${mapMode === "streets" ? "active" : ""}`}
          title="Toggle Satellite / Street map view"
        >
          <Layers size={18} />
        </button>
      </div>

      {/* Live Zoom / Scale Status Badge */}
      <div className="globe-status-badge glass desktop-only">
        <span className="live-pulse-dot" />
        <span>
          VIEW: {zoomLevel.toUpperCase()} LEVEL · CLICK TERRAIN TO PIN · CLICK
          PIN TO INSPECT
        </span>
      </div>

      {/* Location Error Notice */}
      {locationError && (
        <div className="location-error-alert glass">
          <AlertTriangle size={16} className="text-vermilion flex-shrink-0" />
          <span>{locationError}</span>
          <button
            onClick={() => setLocationError(null)}
            className="error-close-btn"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Floating Bottom Confirmation Panel: Verified Coordinates & Road Pin */}
      <AnimatePresence>
        {selectedLoc && (
          <motion.div
            className="globe-confirm-panel glass"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          >
            <div className="confirm-top">
              <div className="confirm-title-group">
                <span className="confirm-tag">
                  <span className="tag-pulse" />
                  PINNED INCIDENT LOCATION
                </span>
                <span
                  className="confirm-coords"
                  onClick={copyCoordinates}
                  title="Click to copy coordinates"
                >
                  {selectedLoc.lat.toFixed(5)}° N, {selectedLoc.lng.toFixed(5)}°
                  W
                  {copiedCoords ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                </span>
              </div>
              <button
                onClick={() => setSelectedLoc(null)}
                className="confirm-close-btn"
                aria-label="Dismiss selection"
              >
                <X size={16} />
              </button>
            </div>

            <div className="confirm-body">
              <MapPin size={22} className="confirm-pin-icon text-vermilion" />
              <div className="confirm-address">
                <h3>{selectedLoc.address}</h3>
                <p>
                  Exact roadway coordinates recorded. Click below to inspect AI
                  damage evidence and file report.
                </p>
              </div>
            </div>

            <div className="confirm-actions">
              <button
                onClick={() => setSelectedLoc(null)}
                className="confirm-btn-secondary"
              >
                Clear Pin
              </button>
              <button
                onClick={() => onConfirmLocation(selectedLoc)}
                className="confirm-btn-primary"
              >
                <span>Confirm & Report Pothole</span>
                <ArrowDownRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Geocoding Loading Indicator */}
      {isGeocoding && (
        <div className="geocoding-indicator glass">
          <Loader2 size={16} className="animate-spin text-vermilion" />
          <span>Resolving street address...</span>
        </div>
      )}

      {/* Attribution */}
      <div className="cesium-custom-attribution">
        <span>
          © CesiumJS · Imagery © Esri, Maxar, OpenStreetMap contributors
        </span>
      </div>
    </div>
  )
}
