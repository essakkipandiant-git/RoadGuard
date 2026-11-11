import fs from "fs"
import path from "path"
import { prisma } from "../config/prisma"
import { logger } from "../utils/logger"

export interface BoundaryValidationResult {
  isValidCoordinate: boolean
  isInsideMumbai: boolean
  wardName: string | null
  localityHint?: string
  message: string
  errorCode?: "INVALID_COORDINATES" | "OUTSIDE_JURISDICTION"
}

type GeoJsonRing = number[][]
interface GeoJsonFeature {
  type: string
  properties: {
    gid?: number
    name: string
    [key: string]: any
  }
  geometry: {
    type: "Polygon" | "MultiPolygon"
    coordinates: any
  }
}

interface FeatureWithBBox {
  feature: GeoJsonFeature
  name: string
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

// Greater Mumbai MCGM preliminary bounding box
export const MUMBAI_BBOX = {
  minLat: 18.89,
  maxLat: 19.32,
  minLng: 72.77,
  maxLng: 73.01,
}

export class MumbaiBoundaryService {
  private static cachedFeatures: FeatureWithBBox[] | null = null
  private static rawGeoJsonString: string | null = null

  /**
   * Loads and caches the authoritative 24-ward BMC GeoJSON dataset.
   * Computes per-feature bounding boxes for sub-millisecond ray casting.
   */
  private static getFeatures(): FeatureWithBBox[] {
    if (this.cachedFeatures) {
      return this.cachedFeatures
    }

    let geoJsonPath = path.resolve(__dirname, "../data/mumbai_bmc_wards.geojson")
    if (!fs.existsSync(geoJsonPath)) {
      geoJsonPath = path.resolve(__dirname, "../../src/data/mumbai_bmc_wards.geojson")
    }
    if (!fs.existsSync(geoJsonPath)) {
      geoJsonPath = path.resolve(process.cwd(), "src/data/mumbai_bmc_wards.geojson")
    }
    if (!fs.existsSync(geoJsonPath)) {
      geoJsonPath = path.resolve(process.cwd(), "server/src/data/mumbai_bmc_wards.geojson")
    }
    if (!fs.existsSync(geoJsonPath)) {
      geoJsonPath = path.resolve(process.cwd(), "server/dist/data/mumbai_bmc_wards.geojson")
    }
    if (!fs.existsSync(geoJsonPath)) {
      geoJsonPath = path.resolve(process.cwd(), "dist/data/mumbai_bmc_wards.geojson")
    }
    if (!fs.existsSync(geoJsonPath)) {
      throw new Error(`Authoritative Mumbai boundary dataset not found at ${geoJsonPath}`)
    }

    this.rawGeoJsonString = fs.readFileSync(geoJsonPath, "utf8")
    const parsed = JSON.parse(this.rawGeoJsonString)

    if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      throw new Error("Invalid Mumbai boundary GeoJSON structure: Expected FeatureCollection")
    }

    const features: FeatureWithBBox[] = parsed.features.map((f: GeoJsonFeature) => {
      let minLng = Infinity
      let maxLng = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity

      function process(coords: any) {
        if (typeof coords[0] === "number") {
          const [lng, lat] = coords
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
        } else if (Array.isArray(coords)) {
          coords.forEach(process)
        }
      }

      process(f.geometry.coordinates)

      return {
        feature: f,
        name: f.properties.name || "Unknown Ward",
        minLng,
        maxLng,
        minLat,
        maxLat,
      }
    })

    this.cachedFeatures = features
    logger.info(`Loaded ${features.length} MCGM municipal wards for spatial validation`)
    return features
  }

  /**
   * Fast preliminary bounding-box check.
   */
  static isWithinBoundingBox(lat: number, lng: number): boolean {
    return (
      lat >= MUMBAI_BBOX.minLat &&
      lat <= MUMBAI_BBOX.maxLat &&
      lng >= MUMBAI_BBOX.minLng &&
      lng <= MUMBAI_BBOX.maxLng
    )
  }

  /**
   * Ray-casting point-in-polygon algorithm for a single LinearRing.
   * Also checks if the point lies exactly on an edge segment.
   */
  private static pointInRing(pt: [number, number], ring: number[][]): boolean {
    const [x, y] = pt // x = lng, y = lat
    let inside = false

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0]
      const yi = ring[i][1]
      const xj = ring[j][0]
      const yj = ring[j][1]

      // Check if point lies directly on line segment (with small epsilon)
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

      // Ray-casting ray test
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (intersect) {
        inside = !inside
      }
    }

    return inside
  }

  /**
   * Determines if a point [lng, lat] is inside a Polygon or MultiPolygon geometry,
   * accounting for both outer rings and interior holes.
   */
  private static pointInGeometry(pt: [number, number], geometry: GeoJsonFeature["geometry"]): boolean {
    if (geometry.type === "Polygon") {
      const outerRing = geometry.coordinates[0]
      if (!this.pointInRing(pt, outerRing)) {
        return false
      }
      // Check interior holes
      for (let k = 1; k < geometry.coordinates.length; k++) {
        if (this.pointInRing(pt, geometry.coordinates[k])) {
          return false // Point is inside a hole
        }
      }
      return true
    } else if (geometry.type === "MultiPolygon") {
      for (const poly of geometry.coordinates) {
        const outerRing = poly[0]
        if (this.pointInRing(pt, outerRing)) {
          let inHole = false
          for (let k = 1; k < poly.length; k++) {
            if (this.pointInRing(pt, poly[k])) {
              inHole = true
              break
            }
          }
          if (!inHole) {
            return true
          }
        }
      }
      return false
    }

    return false
  }

  /**
   * Authoritative coordinate validation.
   * Differentiates strictly between:
   * 1. Malformed/invalid coordinates (e.g. NaN, undefined, out of [-90, 90] / [-180, 180]).
   * 2. Coordinates outside Greater Mumbai municipal boundaries.
   * 3. Valid coordinates confirmed inside an MCGM ward.
   */
  static validateCoordinates(latInput: unknown, lngInput: unknown): BoundaryValidationResult {
    // 1. Check for missing, non-numeric, or non-finite coordinates
    if (
      latInput === undefined ||
      latInput === null ||
      lngInput === undefined ||
      lngInput === null ||
      typeof latInput !== "number" ||
      typeof lngInput !== "number" ||
      !Number.isFinite(latInput) ||
      !Number.isFinite(lngInput) ||
      Number.isNaN(latInput) ||
      Number.isNaN(lngInput)
    ) {
      return {
        isValidCoordinate: false,
        isInsideMumbai: false,
        wardName: null,
        errorCode: "INVALID_COORDINATES",
        message: "Invalid coordinates: Latitude and longitude must be valid finite numbers.",
      }
    }

    // 2. Check standard geographic limits [-90, 90] and [-180, 180]
    if (latInput < -90 || latInput > 90 || lngInput < -180 || lngInput > 180) {
      return {
        isValidCoordinate: false,
        isInsideMumbai: false,
        wardName: null,
        errorCode: "INVALID_COORDINATES",
        message: `Coordinates out of geographic range: Latitude must be between -90 and 90, longitude between -180 and 180 (received [${latInput}, ${lngInput}]).`,
      }
    }

    // 3. Fast Bounding Box Pre-filter
    if (!this.isWithinBoundingBox(latInput, lngInput)) {
      return {
        isValidCoordinate: true,
        isInsideMumbai: false,
        wardName: null,
        errorCode: "OUTSIDE_JURISDICTION",
        message: `RoadGuard currently operates exclusively within the municipal jurisdiction of Greater Mumbai (MCGM / BMC). The submitted location [${latInput.toFixed(4)}, ${lngInput.toFixed(4)}] is outside Mumbai municipal limits.`,
      }
    }

    // 4. Authoritative Point-in-Polygon Check across all 24 MCGM Wards
    const pt: [number, number] = [lngInput, latInput]
    const features = this.getFeatures()

    for (const item of features) {
      // Check feature-level bounding box first
      if (
        lngInput >= item.minLng &&
        lngInput <= item.maxLng &&
        latInput >= item.minLat &&
        latInput <= item.maxLat
      ) {
        if (this.pointInGeometry(pt, item.feature.geometry)) {
          return {
            isValidCoordinate: true,
            isInsideMumbai: true,
            wardName: item.name,
            localityHint: `Ward ${item.name}, Greater Mumbai`,
            message: `Location confirmed within Greater Mumbai (MCGM Ward ${item.name}).`,
          }
        }
      }
    }

    // Inside preliminary bounding box, but falls outside the actual municipal boundary polygon
    return {
      isValidCoordinate: true,
      isInsideMumbai: false,
      wardName: null,
      errorCode: "OUTSIDE_JURISDICTION",
      message: `RoadGuard currently operates exclusively within the municipal jurisdiction of Greater Mumbai (MCGM / BMC). The submitted location [${latInput.toFixed(4)}, ${lngInput.toFixed(4)}] is outside Mumbai municipal limits.`,
    }
  }

  /**
   * Identifies the primary government authority responsible for the road asset.
   * Differentiates MCGM (BMC), MMRDA, Maharashtra PWD, and NHAI.
   */
  static resolveResponsibleAuthority(addressOrRoadName?: string, wardName?: string | null): {
    authorityCode: "MCGM" | "MMRDA" | "PWD" | "NHAI"
    authorityName: string
    jurisdictionType: "MUNICIPAL" | "METROPOLITAN_HIGHWAY" | "STATE_HIGHWAY" | "NATIONAL_HIGHWAY"
    isProvisional: boolean
    notes: string
  } {
    const text = (addressOrRoadName || "").toLowerCase()

    if (text.includes("national highway") || text.includes("nh 48") || text.includes("nh 66") || text.includes("nh-48") || text.includes("nh-66")) {
      return {
        authorityCode: "NHAI",
        authorityName: "National Highways Authority of India (NHAI)",
        jurisdictionType: "NATIONAL_HIGHWAY",
        isProvisional: true,
        notes: "National highway corridor; falls under NHAI Regional Office Mumbai.",
      }
    }

    if (
      text.includes("western express") ||
      text.includes("eastern express") ||
      text.includes("coastal road") ||
      text.includes("mumbai trans harbour") ||
      text.includes("atal setu") ||
      text.includes("jvlr") ||
      text.includes("jogeshwari-vikhroli") ||
      text.includes("metro line")
    ) {
      return {
        authorityCode: "MMRDA",
        authorityName: "Mumbai Metropolitan Region Development Authority (MMRDA / MSRDC)",
        jurisdictionType: "METROPOLITAN_HIGHWAY",
        isProvisional: true,
        notes: "Major arterial expressway / transit corridor under metropolitan jurisdiction.",
      }
    }

    if (
      text.includes("sion-panvel") ||
      text.includes("sion panvel") ||
      text.includes("santacruz-chembur") ||
      text.includes("sclr") ||
      text.includes("state highway")
    ) {
      return {
        authorityCode: "PWD",
        authorityName: "Maharashtra State Public Works Department (PWD)",
        jurisdictionType: "STATE_HIGHWAY",
        isProvisional: true,
        notes: "State highway link under PWD Mumbai Metropolitan Circle.",
      }
    }

    const wardLabel = wardName ? `Ward ${wardName}` : "Municipal Jurisdiction"
    return {
      authorityCode: "MCGM",
      authorityName: `Municipal Corporation of Greater Mumbai (MCGM / BMC - ${wardLabel})`,
      jurisdictionType: "MUNICIPAL",
      isProvisional: false,
      notes: "Internal urban street maintained by MCGM Road & Traffic Division.",
    }
  }

  /**
   * Convenience helper returning boolean if point is inside Mumbai.
   */
  static isInsideMumbai(lat: number, lng: number): boolean {
    return this.validateCoordinates(lat, lng).isInsideMumbai
  }

  /**
   * Returns the GeoJSON FeatureCollection string or object for API responses.
   */
  static getRawGeoJson(): string {
    if (!this.rawGeoJsonString) {
      this.getFeatures()
    }
    return this.rawGeoJsonString || "{}"
  }

  /**
   * Syncs the validated boundary dataset into the Prisma GeographicBoundary table.
   */
  static async syncBoundaryToDatabase() {
    this.getFeatures()
    const geoJson = this.getRawGeoJson()

    return await prisma.geographicBoundary.upsert({
      where: { code: "MCGM-MUMBAI-OFFICIAL" },
      update: {
        name: "Greater Mumbai Municipal Corporation (MCGM) Official Boundary",
        minLat: MUMBAI_BBOX.minLat,
        maxLat: MUMBAI_BBOX.maxLat,
        minLng: MUMBAI_BBOX.minLng,
        maxLng: MUMBAI_BBOX.maxLng,
        geoJson,
        isActive: true,
      },
      create: {
        code: "MCGM-MUMBAI-OFFICIAL",
        name: "Greater Mumbai Municipal Corporation (MCGM) Official Boundary",
        boundaryType: "MUNICIPAL_LIMITS",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        minLat: MUMBAI_BBOX.minLat,
        maxLat: MUMBAI_BBOX.maxLat,
        minLng: MUMBAI_BBOX.minLng,
        maxLng: MUMBAI_BBOX.maxLng,
        geoJson,
        isActive: true,
      },
    })
  }
}
