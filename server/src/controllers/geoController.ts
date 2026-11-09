import { Request, Response, NextFunction } from "express"
import { MumbaiBoundaryService } from "../services/mumbaiBoundaryService"

export class GeoController {
  /**
   * GET /api/v1/geo/mumbai-boundary
   * Returns the official Greater Mumbai municipal boundaries dataset.
   */
  static getMumbaiBoundary(req: Request, res: Response, next: NextFunction): void {
    try {
      const geoJson = JSON.parse(MumbaiBoundaryService.getRawGeoJson())
      res.status(200).json({
        success: true,
        data: {
          type: "FeatureCollection",
          jurisdiction: "Greater Mumbai Municipal Corporation (MCGM / BMC)",
          state: "Maharashtra",
          country: "India",
          totalWards: geoJson.features?.length || 24,
          boundingBox: {
            minLat: 18.89,
            maxLat: 19.32,
            minLng: 72.77,
            maxLng: 73.01,
          },
          features: geoJson.features,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/geo/validate-location
   * Validates whether provided coordinates lie within Greater Mumbai.
   */
  static validateLocation(req: Request, res: Response, next: NextFunction): void {
    try {
      const { latitude, longitude } = req.body
      const result = MumbaiBoundaryService.validateCoordinates(latitude, longitude)

      res.status(200).json({
        success: true,
        data: {
          isValidCoordinate: result.isValidCoordinate,
          isInsideMumbai: result.isInsideMumbai,
          wardName: result.wardName,
          localityHint: result.localityHint,
          message: result.message,
          errorCode: result.errorCode,
        },
      })
    } catch (error) {
      next(error)
    }
  }
}
