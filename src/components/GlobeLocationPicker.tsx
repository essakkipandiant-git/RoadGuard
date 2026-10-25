import React, { useEffect, useRef, useState, useCallback } from "react";
import * as Cesium from "cesium";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  Check,
  Compass,
  Copy,
  Crosshair,
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
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

// Optional Cesium Ion Token from environment
const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || "";
if (CESIUM_ION_TOKEN) {
  Cesium.Ion.defaultAccessToken = CESIUM_ION_TOKEN;
}

export type SelectedLocation = {
  lat: number;
  lng: number;
  height?: number;
  address: string;
  city?: string;
  road?: string;
};

type GlobeLocationPickerProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLocation: (location: SelectedLocation) => void;
  initialLocation?: { lat: number; lng: number };
};

// Preset quick locations for immediate exploration
const PRESET_LOCATIONS = [
  { name: "Marine Drive (Mumbai)", lat: 18.9438, lng: 72.8232, city: "Mumbai, Maharashtra" },
  { name: "MG Road (Bengaluru)", lat: 12.9756, lng: 77.6066, city: "Bengaluru, Karnataka" },
  { name: "Connaught Place (Delhi)", lat: 28.6315, lng: 77.2167, city: "New Delhi, Delhi" },
  { name: "Anna Salai (Chennai)", lat: 13.0604, lng: 80.2496, city: "Chennai, Tamil Nadu" },
  { name: "Hitec City (Hyderabad)", lat: 17.4474, lng: 78.3762, city: "Hyderabad, Telangana" },
];

export default function GlobeLocationPicker({
  isOpen,
  onClose,
  onConfirmLocation,
  initialLocation,
}: GlobeLocationPickerProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const markerEntityRef = useRef<Cesium.Entity | null>(null);
  const pulseEntityRef = useRef<Cesium.Entity | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<SelectedLocation | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapMode, setMapMode] = useState<"satellite" | "streets">("satellite");
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<"space" | "regional" | "street">("space");

  // Generate high-tech vermilion pin icon data URL
  const getMarkerIcon = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Outer glow
    ctx.shadowColor = "rgba(230, 83, 54, 0.85)";
    ctx.shadowBlur = 12;

    // Pin head circle
    ctx.fillStyle = "#E65336";
    ctx.beginPath();
    ctx.arc(32, 22, 14, 0, Math.PI * 2);
    ctx.fill();

    // Pin needle triangle pointing downward
    ctx.beginPath();
    ctx.moveTo(22, 26);
    ctx.lineTo(32, 54);
    ctx.lineTo(42, 26);
    ctx.closePath();
    ctx.fill();

    // Inner bright cream core
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#F5F1E8";
    ctx.beginPath();
    ctx.arc(32, 22, 5.5, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL();
  }, []);

  // Update or place marker at specific lat/lng
  const placeMarker = useCallback(
    (lat: number, lng: number, addressText: string) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      // Remove existing marker and pulse
      if (markerEntityRef.current) {
        viewer.entities.remove(markerEntityRef.current);
        markerEntityRef.current = null;
      }
      if (pulseEntityRef.current) {
        viewer.entities.remove(pulseEntityRef.current);
        pulseEntityRef.current = null;
      }

      // Add radar pulse ring on ground
      pulseEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 2),
        ellipse: {
          semiMinorAxis: 24.0,
          semiMajorAxis: 24.0,
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString("rgba(230, 83, 54, 0.45)")
          ),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#E65336"),
          outlineWidth: 2,
        },
      });

      // Add Vermilion Pin Billboard
      markerEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 10),
        billboard: {
          image: getMarkerIcon(),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          width: 48,
          height: 48,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // Ensure pin is always visible above surface
        },
      });

      setSelectedLoc({
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        address: addressText,
      });
    },
    [getMarkerIcon]
  );

  // Reverse geocode coordinates using OSM Nominatim
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setIsGeocoding(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              "Accept-Language": "en",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const road =
            data.address?.road ||
            data.address?.pedestrian ||
            data.address?.suburb ||
            data.address?.neighbourhood ||
            "Street Location";
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.municipality ||
            data.address?.county ||
            data.address?.country ||
            "";
          const fullAddress = data.display_name || `${road}, ${city}`;
          placeMarker(lat, lng, fullAddress);
        } else {
          placeMarker(lat, lng, `Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`);
        }
      } catch (err) {
        placeMarker(lat, lng, `Selected Point (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`);
      } finally {
        setIsGeocoding(false);
      }
    },
    [placeMarker]
  );

  // Fly camera to destination coordinates
  const flyToCoords = useCallback(
    (lat: number, lng: number, targetHeight: number = 600, address?: string) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;

      setLocationError(null);
      setSearchError(null);

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, targetHeight),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-50),
          roll: 0.0,
        },
        duration: 2.5,
        complete: () => {
          if (address) {
            placeMarker(lat, lng, address);
          } else {
            reverseGeocode(lat, lng);
          }
        },
      });
    },
    [placeMarker, reverseGeocode]
  );

  // Reset to full orbital Earth view
  const flyToWholeGlobe = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 16000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0.0,
      },
      duration: 2.2,
    });
  }, []);

  // Geolocation API: "Use My Location"
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        flyToCoords(latitude, longitude, 500);
      },
      (err) => {
        setIsLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError("Location access was denied. Please allow location access or search your street.");
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError("GPS signal unavailable. Please use the search bar.");
            break;
          case err.TIMEOUT:
            setLocationError("Location request timed out. Please try again.");
            break;
          default:
            setLocationError("Unable to acquire location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Search geocoding
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    // Check if input is direct coordinates e.g. "51.5074, -0.1278"
    const coordMatch = searchQuery.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSuggestions([]);
        flyToCoords(lat, lng, 500);
        return;
      }
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&addressdetails=1&limit=5`,
        {
          headers: { "Accept-Language": "en" },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setSuggestions(data);
        } else {
          setSearchError("No locations found. Try entering a city, neighbourhood or street name.");
          setSuggestions([]);
        }
      } else {
        setSearchError("Geocoding service unavailable. Please try again.");
      }
    } catch {
      setSearchError("Network error while searching locations.");
    } finally {
      setIsSearching(false);
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    const currentHeight = viewerRef.current.camera.positionCartographic.height;
    viewerRef.current.camera.zoomIn(Math.max(currentHeight * 0.4, 50));
  };

  const handleZoomOut = () => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    const currentHeight = viewerRef.current.camera.positionCartographic.height;
    viewerRef.current.camera.zoomOut(Math.max(currentHeight * 0.5, 100));
  };

  // Initialize Cesium Viewer
  useEffect(() => {
    if (!isOpen || !cesiumContainerRef.current) return;

    // Ensure Cesium knows asset path
    (window as any).CESIUM_BASE_URL = "/cesium/";

    // Robust UrlTemplateImageryProvider for Esri Satellite photography
    const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: "© Esri, Maxar, Earthstar Geographics",
    });

    // Create viewer with empty baseLayer option to safely attach our provider
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
      baseLayer: new Cesium.ImageryLayer(satelliteProvider),
      skyAtmosphere: new Cesium.SkyAtmosphere(),
    });

    viewerRef.current = viewer;

    // Road & street lines reference overlay for clear road identification
    const roadOverlayProvider = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
    });
    viewer.imageryLayers.addImageryProvider(roadOverlayProvider);

    // Disable night-time shadow so Earth is always bright and clear across all continents
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.show = true;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#181916");

    // Ellipsoid terrain by default (rock-solid, no credentials required)
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();

    // If Cesium Ion Token is provided, asynchronously upgrade to World Terrain
    if (CESIUM_ION_TOKEN) {
      Cesium.createWorldTerrainAsync()
        .then((tp) => {
          if (viewerRef.current && !viewerRef.current.isDestroyed()) {
            viewerRef.current.terrainProvider = tp;
          }
        })
        .catch(() => {});
    }

    // Screen Space Left Click: Screen-to-Globe Ray Picking
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: any) => {
      const ray = viewer.camera.getPickRay(movement.position);
      if (!ray) return;

      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (Cesium.defined(cartesian)) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        reverseGeocode(lat, lng);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Initial camera placement
    if (initialLocation) {
      flyToCoords(initialLocation.lat, initialLocation.lng, 500);
    } else {
      // Wide orbital Earth start view centered on India
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 16000000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90),
          roll: 0.0,
        },
      });
    }

    // Monitor camera height for zoom indicator
    const removeCameraListener = viewer.camera.changed.addEventListener(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      const height = viewerRef.current.camera.positionCartographic.height;
      if (height > 2000000) setZoomLevel("space");
      else if (height > 50000) setZoomLevel("regional");
      else setZoomLevel("street");
    });

    return () => {
      removeCameraListener();
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [isOpen, initialLocation, flyToCoords, reverseGeocode]);

  // Toggle map layers (Satellite vs Streets)
  const toggleMapMode = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const newMode = mapMode === "satellite" ? "streets" : "satellite";
    setMapMode(newMode);

    viewer.imageryLayers.removeAll();

    if (newMode === "streets") {
      const osmProvider = new Cesium.UrlTemplateImageryProvider({
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maximumLevel: 19,
        credit: "© OpenStreetMap contributors",
      });
      viewer.imageryLayers.addImageryProvider(osmProvider);
    } else {
      const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
        credit: "© Esri, Maxar",
      });
      viewer.imageryLayers.addImageryProvider(satelliteProvider);

      const roadOverlay = new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
        maximumLevel: 19,
      });
      viewer.imageryLayers.addImageryProvider(roadOverlay);
    }
  };

  const copyCoordinates = () => {
    if (!selectedLoc) return;
    navigator.clipboard.writeText(`${selectedLoc.lat}, ${selectedLoc.lng}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="globe-modal-overlay">
      {/* 3D Earth Cesium Canvas Container */}
      <div ref={cesiumContainerRef} className="cesium-viewport" />

      {/* Top Floating Glass Bar: Search & Location Controls */}
      <div className="globe-top-bar">
        {/* Back / Exit Button */}
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
          <form onSubmit={handleSearchSubmit} className="globe-search-form glass">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search street, neighbourhood, or coordinates (lat, lng)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (searchError) setSearchError(null);
              }}
              className="globe-search-input"
            />
            {isSearching && <Loader2 size={16} className="search-spinner animate-spin" />}
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSuggestions([]);
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

          {/* Autocomplete / Search Suggestions Dropdown */}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                className="search-dropdown glass"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {suggestions.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      const lat = parseFloat(item.lat);
                      const lng = parseFloat(item.lon);
                      setSuggestions([]);
                      setSearchQuery(item.display_name);
                      flyToCoords(lat, lng, 500, item.display_name);
                    }}
                    className="suggestion-item"
                  >
                    <MapPin size={14} className="text-vermilion flex-shrink-0" />
                    <span className="suggestion-text">{item.display_name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Error Notice */}
          {searchError && (
            <div className="search-error-toast glass">
              <AlertTriangle size={14} className="text-vermilion" />
              <span>{searchError}</span>
            </div>
          )}
        </div>

        {/* "Use My Location" GPS Button */}
        <button
          onClick={handleUseMyLocation}
          disabled={isLocating}
          className="globe-gps-btn glass"
          title="Detect my current location"
        >
          {isLocating ? (
            <Loader2 size={17} className="animate-spin text-vermilion" />
          ) : (
            <LocateFixed size={17} />
          )}
          <span className="desktop-only">USE MY LOCATION</span>
        </button>
      </div>

      {/* Preset Quick Locations Bar */}
      <div className="globe-presets-bar desktop-only">
        <span className="presets-label">QUICK CITIES:</span>
        {PRESET_LOCATIONS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => {
              setSearchQuery(preset.name);
              flyToCoords(preset.lat, preset.lng, 500, `${preset.name}, ${preset.city}`);
            }}
            className="preset-chip glass"
          >
            <MapPin size={11} className="text-vermilion" />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      {/* Floating Right Navigation Controls: Zoom, Reset, Layer Toggle */}
      <div className="globe-nav-controls">
        <button onClick={handleZoomIn} className="ctrl-btn glass" title="Zoom in">
          <Plus size={18} />
        </button>
        <button onClick={handleZoomOut} className="ctrl-btn glass" title="Zoom out">
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
          VIEW: {zoomLevel.toUpperCase()} LEVEL · CLICK TERRAIN TO PIN POTHOLE
        </span>
      </div>

      {/* Location Error Notice */}
      {locationError && (
        <div className="location-error-alert glass">
          <AlertTriangle size={16} className="text-vermilion flex-shrink-0" />
          <span>{locationError}</span>
          <button onClick={() => setLocationError(null)} className="error-close-btn">
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
                <span className="confirm-coords" onClick={copyCoordinates} title="Click to copy coordinates">
                  {selectedLoc.lat}° N, {selectedLoc.lng}° E
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
                  Exact roadway coordinate logged. Ready to attach damage telemetry and photos.
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

      {/* Required Attribution */}
      <div className="cesium-custom-attribution">
        <span>© CesiumJS · Imagery © Esri, Maxar, OpenStreetMap contributors</span>
      </div>
    </div>
  );
}
