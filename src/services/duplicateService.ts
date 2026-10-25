import {
  Coordinates,
  DamageCategory,
  DuplicateMatchResult,
  RoadIssue,
  SupportingEvidence,
  UserRole,
} from "../types/roadguard"
import {
  calculateRiskAssessment,
  calculateSupportingReportsFactor,
} from "./riskEngine"

export const DEFAULT_PROXIMITY_THRESHOLD_METERS = 40

/**
 * Calculates distance between two coordinates in meters using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  coord1: Coordinates,
  coord2: Coordinates,
): number {
  if (
    !coord1 ||
    !coord2 ||
    typeof coord1.lat !== "number" ||
    typeof coord1.lng !== "number" ||
    typeof coord2.lat !== "number" ||
    typeof coord2.lng !== "number"
  ) {
    return Infinity
  }

  const R = 6371000 // Radius of Earth in meters
  const lat1Rad = (coord1.lat * Math.PI) / 180
  const lat2Rad = (coord2.lat * Math.PI) / 180
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10 // 1 decimal place
}

/**
 * Checks whether two damage categories are compatible or equivalent for deduplication.
 */
export function areCategoriesCompatible(
  cat1: DamageCategory,
  cat2: DamageCategory,
): boolean {
  if (cat1 === cat2) return true
  // Cavities and depressions can be overlapping manifestations
  if (
    (cat1 === "cavity" && cat2 === "depression") ||
    (cat1 === "depression" && cat2 === "cavity")
  ) {
    return true
  }
  // Cracks and edge failures frequently co-occur
  if (
    (cat1 === "crack" && cat2 === "edge") ||
    (cat1 === "edge" && cat2 === "crack")
  ) {
    return true
  }
  return false
}

/**
 * Checks if a given candidate coordinate and category matches an existing road issue.
 */
export function findPotentialDuplicates(
  newCoordinates: Coordinates,
  category: DamageCategory,
  existingIssues: RoadIssue[],
  thresholdMeters: number = DEFAULT_PROXIMITY_THRESHOLD_METERS,
): DuplicateMatchResult {
  if (!newCoordinates || !existingIssues || existingIssues.length === 0) {
    return {
      isDuplicate: false,
      distanceMeters: Infinity,
      categoryMatch: false,
      confidenceScore: 0,
      reason: "No existing issues to compare with.",
    }
  }

  // Filter only active or unverified issues (exclude rejected or issues resolved long ago)
  const candidateIssues = existingIssues.filter((issue) => {
    if (issue.status === "rejected") return false
    if (issue.status === "verified_repaired") {
      // If repaired more than 30 days ago, consider new damage rather than duplicate
      const updated = new Date(issue.updatedAt).getTime()
      const thirtyDays = 30 * 24 * 60 * 60 * 1000
      if (Date.now() - updated > thirtyDays) return false
    }
    return true
  })

  let closestIssue: RoadIssue | null = null
  let minDistance = Infinity
  let categoryMatch = false

  for (const issue of candidateIssues) {
    const dist = calculateHaversineDistanceMeters(
      newCoordinates,
      issue.coordinates,
    )
    if (dist < minDistance) {
      minDistance = dist
      closestIssue = issue
      categoryMatch = areCategoriesCompatible(category, issue.category)
    }
  }

  if (closestIssue && minDistance <= thresholdMeters) {
    // Confidence score based on proximity & category
    const proximityConfidence = Math.max(0, 1 - minDistance / thresholdMeters)
    const categoryFactor = categoryMatch ? 1.0 : 0.6
    const confidenceScore = Number(
      (proximityConfidence * 0.7 + categoryFactor * 0.3).toFixed(2),
    )

    const distDesc =
      minDistance < 5 ? "at the exact same location" : `${minDistance}m away`
    const reason = `Existing active defect #${closestIssue.trackingCode} (${closestIssue.category}) detected ${distDesc}.`

    return {
      isDuplicate: true,
      existingIssue: closestIssue,
      distanceMeters: minDistance,
      categoryMatch,
      confidenceScore,
      reason,
    }
  }

  return {
    isDuplicate: false,
    existingIssue: closestIssue || undefined,
    distanceMeters: minDistance,
    categoryMatch,
    confidenceScore: 0,
    reason: `Nearest defect is ${
      minDistance === Infinity ? "none" : `${minDistance}m away`
    }, exceeding threshold (${thresholdMeters}m).`,
  }
}

/**
 * Attaches citizen evidence to an existing issue, increments confirmation count,
 * and recalculates the explainable risk score.
 */
export function supportExistingIssue(
  issue: RoadIssue,
  evidence: {
    userId?: string
    userName?: string
    userRole?: UserRole
    photoUrl?: string
    notes?: string
  },
): RoadIssue {
  const newEvidenceId = "SUP-" + Math.floor(10000 + Math.random() * 90000)
  const now = new Date().toISOString()

  // Prevent duplicate evidence from the same user if already submitted recently
  const alreadySupported = issue.supportingReports.some(
    (r) => evidence.userId && r.userId === evidence.userId,
  )

  const updatedEvidenceList: SupportingEvidence[] = [
    ...issue.supportingReports,
    {
      id: newEvidenceId,
      userId:
        evidence.userId || "anon-" + Math.floor(1000 + Math.random() * 9000),
      userName: evidence.userName || "Verified Citizen",
      userRole: evidence.userRole || "citizen",
      photoUrl: evidence.photoUrl || issue.originalPhotoUrl,
      timestamp: now,
      notes: evidence.notes,
      isConfirmed: true,
    },
  ]

  const newCount = alreadySupported
    ? issue.supportingCount
    : issue.supportingCount + 1

  // Recalculate risk assessment with higher community confirmations factor!
  const updatedSupportingFactor = calculateSupportingReportsFactor(newCount)
  const updatedRisk = calculateRiskAssessment({
    factors: {
      ...issue.risk.factors,
      supportingReports: updatedSupportingFactor,
    },
    weights: issue.risk.weights,
    category: issue.category,
    depthMm: issue.detection.depthEstimateMm,
    supportingCount: newCount,
    nearestSensitiveType: issue.risk.proximityDetails?.nearestSensitiveType,
    distanceMeters: issue.risk.proximityDetails?.distanceMeters,
  })

  return {
    ...issue,
    supportingReports: updatedEvidenceList,
    supportingCount: newCount,
    risk: updatedRisk,
    updatedAt: now,
  }
}
