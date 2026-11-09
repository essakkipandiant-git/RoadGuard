import wardsData from "../data/mumbai_bmc_wards.json"

export interface FrontendBoundaryValidationResult {
  isValid: boolean
  isInsideMumbai: boolean
  wardName: string | null
  localityHint?: string
  message: string
}

export const MUMBAI_CLIENT_BBOX = {
  minLat: 18.89,
  maxLat: 19.32,
  minLng: 72.77,
  maxLng: 73.01,
}

// Ray-casting point-in-ring
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt // x = lng, y = lat
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]

    // Point on edge
    const crossProduct = (x - xi) * (yj - yi) - (xj - xi) * (y - yi)
    if (
      Math.abs(crossProduct) < 1e-12 &&
      x >= Math.min(xi, xj) - 1e-9 &&
      x <= Math.max(xi, xj) + 1e-9 &&
      y >= Math.min(yi, yj) - 1e-9 &&
      y <= Math.max(yi, yj) + 1e-9
    ) {
      return true
    }

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) {
      inside = !inside
    }
  }

  return inside
}

function pointInGeometry(pt: [number, number], geometry: any): boolean {
  if (geometry.type === "Polygon") {
    const outerRing = geometry.coordinates[0]
    if (!pointInRing(pt, outerRing)) return false
    for (let k = 1; k < geometry.coordinates.length; k++) {
      if (pointInRing(pt, geometry.coordinates[k])) return false
    }
    return true
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const outerRing = poly[0]
      if (pointInRing(pt, outerRing)) {
        let inHole = false
        for (let k = 1; k < poly.length; k++) {
          if (pointInRing(pt, poly[k])) {
            inHole = true
            break
          }
        }
        if (!inHole) return true
      }
    }
    return false
  }
  return false
}

/**
 * Validates a location in the browser against the official MCGM boundaries.
 */
export function validateMumbaiLocation(
  lat: number,
  lng: number,
): FrontendBoundaryValidationResult {
  if (
    lat === undefined ||
    lat === null ||
    lng === undefined ||
    lng === null ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      isValid: false,
      isInsideMumbai: false,
      wardName: null,
      message: "Invalid GPS coordinates.",
    }
  }

  // Fast Bounding Box Pre-filter
  if (
    lat < MUMBAI_CLIENT_BBOX.minLat ||
    lat > MUMBAI_CLIENT_BBOX.maxLat ||
    lng < MUMBAI_CLIENT_BBOX.minLng ||
    lng > MUMBAI_CLIENT_BBOX.maxLng
  ) {
    return {
      isValid: true,
      isInsideMumbai: false,
      wardName: null,
      message: `Selected coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}] are outside Greater Mumbai municipal boundaries. RoadGuard currently accepts reports only within MCGM limits.`,
    }
  }

  // Ray-casting across 24 Wards
  const pt: [number, number] = [lng, lat]
  const features = (wardsData as any).features || []

  for (const f of features) {
    if (pointInGeometry(pt, f.geometry)) {
      const wardName = f.properties?.name || "Unknown Ward"
      return {
        isValid: true,
        isInsideMumbai: true,
        wardName,
        localityHint: `MCGM Ward ${wardName}`,
        message: `Location verified within Greater Mumbai (Ward ${wardName}).`,
      }
    }
  }

  return {
    isValid: true,
    isInsideMumbai: false,
    wardName: null,
    message: `Selected coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}] are outside Greater Mumbai municipal boundaries. RoadGuard currently accepts reports only within MCGM limits.`,
  }
}
