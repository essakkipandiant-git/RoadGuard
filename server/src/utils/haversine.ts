export interface GeoCoordinates {
  latitude: number
  longitude: number
}

export const EARTH_RADIUS_METERS = 6371000 // WGS84 mean earth radius
export const DEFAULT_PROXIMITY_THRESHOLD_METERS = 40 // 40 meter deduplication radius

/**
 * Calculates distance between two geographic coordinates in meters using the Haversine formula.
 * Handles boundary conditions and invalid numbers safely.
 */
export function calculateHaversineDistance(
  coord1: GeoCoordinates,
  coord2: GeoCoordinates,
): number {
  if (
    !coord1 ||
    !coord2 ||
    typeof coord1.latitude !== "number" ||
    typeof coord1.longitude !== "number" ||
    typeof coord2.latitude !== "number" ||
    typeof coord2.longitude !== "number" ||
    !isFinite(coord1.latitude) ||
    !isFinite(coord1.longitude) ||
    !isFinite(coord2.latitude) ||
    !isFinite(coord2.longitude)
  ) {
    return Infinity
  }

  const lat1Rad = (coord1.latitude * Math.PI) / 180
  const lat2Rad = (coord2.latitude * Math.PI) / 180
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = EARTH_RADIUS_METERS * c

  // Return rounded to 1 decimal place
  return Math.round(distance * 10) / 10
}

/**
 * Computes a bounding box (minLat, maxLat, minLon, maxLon) for an efficient SQL spatial pre-filter.
 * 1 degree latitude ~= 111,320 meters.
 * 1 degree longitude ~= 111,320 * cos(latitude) meters.
 */
export function getBoundingBox(
  center: GeoCoordinates,
  radiusMeters: number = DEFAULT_PROXIMITY_THRESHOLD_METERS,
): {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
} {
  const latDelta = radiusMeters / 111320
  const cosLat = Math.cos((center.latitude * Math.PI) / 180)
  // Prevent division by zero near poles
  const lonDelta = radiusMeters / (111320 * Math.max(0.01, Math.abs(cosLat)))

  return {
    minLat: center.latitude - latDelta,
    maxLat: center.latitude + latDelta,
    minLon: center.longitude - lonDelta,
    maxLon: center.longitude + lonDelta,
  }
}

