import { prisma } from "../config/prisma"
import { IssueStatus, DamageCategory, RoadIssue } from "@prisma/client"
import {
  calculateHaversineDistance,
  getBoundingBox,
  DEFAULT_PROXIMITY_THRESHOLD_METERS,
} from "../utils/haversine"

export interface DuplicateDetectionResult {
  isDuplicate: boolean
  distanceMeters: number
  existingIssue?: RoadIssue | null
  confidencePercentage: number
  categoryMatch: boolean
  reason: string
}

export class DuplicateService {
  /**
   * Checks for potential duplicate issues within a geographical threshold radius (default 40m).
   * Excludes rejected issues.
   */
  static async findDuplicate(
    latitude: number,
    longitude: number,
    damageCategory?: DamageCategory,
    thresholdMeters: number = DEFAULT_PROXIMITY_THRESHOLD_METERS,
  ): Promise<DuplicateDetectionResult> {
    const box = getBoundingBox({ latitude, longitude }, thresholdMeters)

    // Spatial pre-filter using latitude & longitude bounding box
    const candidateIssues = await prisma.roadIssue.findMany({
      where: {
        status: {
          notIn: [IssueStatus.REJECTED],
        },
        latitude: {
          gte: box.minLat,
          lte: box.maxLat,
        },
        longitude: {
          gte: box.minLon,
          lte: box.maxLon,
        },
      },
      include: {
        images: true,
        ward: true,
        department: true,
      },
    })

    if (!candidateIssues || candidateIssues.length === 0) {
      return {
        isDuplicate: false,
        distanceMeters: Infinity,
        confidencePercentage: 0,
        categoryMatch: false,
        reason: "No active road hazard reports within proximity radius.",
      }
    }

    let closestIssue: RoadIssue | null = null
    let minDistance = Infinity

    for (const candidate of candidateIssues) {
      const distance = calculateHaversineDistance(
        { latitude, longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude },
      )

      if (distance <= thresholdMeters && distance < minDistance) {
        minDistance = distance
        closestIssue = candidate
      }
    }

    if (closestIssue && minDistance <= thresholdMeters) {
      const categoryMatch = !damageCategory || closestIssue.damageCategory === damageCategory
      const proximityConfidence = Math.max(0, 100 - (minDistance / thresholdMeters) * 50)
      const confidence = Math.round(proximityConfidence + (categoryMatch ? 50 : 20))

      return {
        isDuplicate: true,
        distanceMeters: minDistance,
        existingIssue: closestIssue,
        confidencePercentage: Math.min(100, confidence),
        categoryMatch,
        reason: `Matched existing active report ${closestIssue.reportNumber} (${closestIssue.title}) within ${minDistance} meters.`,
      }
    }

    return {
      isDuplicate: false,
      distanceMeters: minDistance,
      confidencePercentage: 0,
      categoryMatch: false,
      reason: "No active road hazard reports within proximity radius.",
    }
  }
}
