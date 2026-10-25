import {
  DamageCategory,
  RiskAssessment,
  RiskFactors,
  RiskWeights,
  RoadClass,
  SeverityLevel,
} from "../types/roadguard"

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  damageSeverity: 0.35,
  roadUsage: 0.25,
  sensitiveProximity: 0.15,
  supportingReports: 0.15,
  unresolvedDuration: 0.1,
}

export const RISK_THRESHOLDS = {
  critical: 80,
  high: 60,
  moderate: 35,
  low: 0,
}

/**
 * Normalizes input value to [0, 100] range, handling undefined, NaN, and negative numbers safely.
 */
export function clampFactor(val: number): number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val)) return 0
  return Math.max(0, Math.min(100, Math.round(val)))
}

/**
 * Calculates Damage Severity Factor (0-100) based on category, measured depth, and surface loss.
 */
export function calculateDamageSeverityFactor(params: {
  category: DamageCategory
  depthMm?: number
  surfaceLossRatio?: number
  detectionCount?: number
}): number {
  const {
    category,
    depthMm = 35,
    surfaceLossRatio = 0.1,
    detectionCount = 1,
  } = params

  let baseScore = 40
  switch (category) {
    case "cavity":
      // Cavity/Pothole depth scaling: 0mm = 40, 50mm = 75, 80mm+ = 100
      baseScore = Math.min(100, Math.max(40, 40 + (depthMm / 80) * 60))
      break
    case "crack":
      // Crack scaling: surface loss spread
      baseScore = Math.min(85, Math.max(30, 30 + surfaceLossRatio * 150))
      break
    case "edge":
      baseScore = 55
      break
    case "depression":
      baseScore = 65
      break
    case "rutting":
      baseScore = 50
      break
  }

  // Multi-defect cluster penalty: if multiple detections exist in same area
  if (detectionCount > 1) {
    baseScore = Math.min(100, baseScore + (detectionCount - 1) * 6)
  }

  return clampFactor(baseScore)
}

/**
 * Calculates Road Usage Factor (0-100) based on road classification or traffic flow.
 */
export function calculateRoadUsageFactor(params: {
  roadClass?: RoadClass
  vehiclesPerHour?: number
}): number {
  const { roadClass, vehiclesPerHour } = params

  if (typeof vehiclesPerHour === "number" && vehiclesPerHour > 0) {
    // 0 cars/hr = 20, 300 cars/hr = 60, 800+ cars/hr = 100
    const score = Math.min(100, 20 + (vehiclesPerHour / 800) * 80)
    return clampFactor(score)
  }

  switch (roadClass) {
    case "arterial":
      return 90
    case "collector":
      return 68
    case "pedestrian_cycle":
      return 72 // High vulnerability for cyclists and pedestrians
    case "local":
    default:
      return 38
  }
}

/**
 * Calculates Sensitive Proximity Factor (0-100) based on distance to schools, hospitals, or transit hubs.
 */
export function calculateSensitiveProximityFactor(params: {
  distanceMeters?: number
  hasSensitiveLocation?: boolean
}): number {
  const { distanceMeters, hasSensitiveLocation } = params

  if (typeof distanceMeters === "number") {
    if (distanceMeters <= 50) return 95
    if (distanceMeters <= 150) return 80
    if (distanceMeters <= 300) return 60
    if (distanceMeters <= 600) return 35
    return 15
  }

  return hasSensitiveLocation ? 75 : 25
}

/**
 * Calculates Supporting Reports Factor (0-100) based on distinct community confirmations.
 */
export function calculateSupportingReportsFactor(
  confirmationsCount: number,
): number {
  const validCount = Math.max(
    1,
    typeof confirmationsCount === "number" && !isNaN(confirmationsCount)
      ? confirmationsCount
      : 1,
  )
  // 1 report: 20
  // 2 reports: 45
  // 3 reports: 70
  // 4 reports: 88
  // 5+ reports: 100
  if (validCount <= 1) return 20
  if (validCount === 2) return 45
  if (validCount === 3) return 70
  if (validCount === 4) return 88
  return 100
}

/**
 * Calculates Unresolved Duration Factor (0-100) based on days/hours open.
 */
export function calculateUnresolvedDurationFactor(
  createdTimestamp: string | Date,
): number {
  const createdDate =
    typeof createdTimestamp === "string"
      ? new Date(createdTimestamp)
      : createdTimestamp
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - createdDate.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  // 0 days: 10 (fresh report)
  // 3 days: 40
  // 7 days: 70
  // 14+ days: 100 (critical backlog)
  return clampFactor(10 + Math.min(90, (diffDays / 14) * 90))
}

/**
 * Categorizes a score (0-100) into low, moderate, high, or critical.
 */
export function determineSeverityLevel(score: number): SeverityLevel {
  if (score >= RISK_THRESHOLDS.critical) return "critical"
  if (score >= RISK_THRESHOLDS.high) return "high"
  if (score >= RISK_THRESHOLDS.moderate) return "moderate"
  return "low"
}

/**
 * Generates explainable, deterministic natural-language rationale for the score.
 */
export function generateRiskExplanation(
  score: number,
  level: SeverityLevel,
  factors: RiskFactors,
  weightedContribs: Record<keyof RiskFactors, number>,
  details?: {
    category?: DamageCategory
    depthMm?: number
    roadClass?: RoadClass
    supportingCount?: number
    nearestSensitiveType?: string
    distanceMeters?: number
  },
): { explanation: string; recommendedAction: string } {
  const levelText = level.toUpperCase()
  const pieces: string[] = []

  // Severity contribution
  if (factors.damageSeverity >= 70) {
    const depthStr = details?.depthMm ? ` (${details.depthMm}mm depth)` : ""
    pieces.push(
      `severe visible surface cavity${depthStr} contributing ${weightedContribs.damageSeverity.toFixed(1)} pts`,
    )
  } else if (factors.damageSeverity >= 45) {
    pieces.push(
      `moderate structural wear contributing ${weightedContribs.damageSeverity.toFixed(1)} pts`,
    )
  }

  // Road usage contribution
  if (factors.roadUsage >= 70) {
    const roadDesc = details?.roadClass
      ? `${details.roadClass} corridor`
      : "high-traffic route"
    pieces.push(`heavy exposure on a ${roadDesc}`)
  }

  // Proximity contribution
  if (factors.sensitiveProximity >= 60) {
    const target = details?.nearestSensitiveType || "sensitive zone"
    const distStr = details?.distanceMeters
      ? ` (<${details.distanceMeters}m)`
      : ""
    pieces.push(`proximity to ${target}${distStr}`)
  }

  // Community reports contribution
  if (factors.supportingReports >= 50) {
    const count = details?.supportingCount || "multiple"
    pieces.push(`${count} independent community confirmations`)
  }

  // Duration contribution
  if (factors.unresolvedDuration >= 70) {
    pieces.push("unresolved status over extended observation window")
  }

  const rationale =
    pieces.length > 0
      ? pieces.join(", ") + "."
      : "standard baseline observation metrics across street telemetry."

  const explanation = `${levelText} priority (Score: ${score}/100) driven by ${rationale}`

  let recommendedAction =
    "Continue routine surface monitoring during regular municipal sweep."
  if (level === "critical") {
    recommendedAction =
      "Immediate emergency dispatch: deploy rapid asphalt hot-mix crew within 24-48 hours."
  } else if (level === "high") {
    recommendedAction =
      "High-priority work order: schedule crew repair within 72 hours and alert route navigation."
  } else if (level === "moderate") {
    recommendedAction =
      "Scheduled maintenance: queue for district road crew during standard weekly maintenance cycle."
  }

  return { explanation, recommendedAction }
}

/**
 * Main deterministic risk calculation function.
 */
export function calculateRiskAssessment(params: {
  factors: Partial<RiskFactors>
  weights?: Partial<RiskWeights>
  category?: DamageCategory
  depthMm?: number
  roadClass?: RoadClass
  supportingCount?: number
  nearestSensitiveType?: "hospital" | "school" | "transit" | "crossing" | "none"
  distanceMeters?: number
  vehiclesPerHour?: number
}): RiskAssessment {
  const weights: RiskWeights = {
    ...DEFAULT_RISK_WEIGHTS,
    ...(params.weights || {}),
  }

  // Ensure weights sum up correctly
  const weightSum =
    weights.damageSeverity +
    weights.roadUsage +
    weights.sensitiveProximity +
    weights.supportingReports +
    weights.unresolvedDuration

  const normalizedWeights: RiskWeights = {
    damageSeverity: weights.damageSeverity / weightSum,
    roadUsage: weights.roadUsage / weightSum,
    sensitiveProximity: weights.sensitiveProximity / weightSum,
    supportingReports: weights.supportingReports / weightSum,
    unresolvedDuration: weights.unresolvedDuration / weightSum,
  }

  const factors: RiskFactors = {
    damageSeverity: clampFactor(params.factors.damageSeverity ?? 50),
    roadUsage: clampFactor(params.factors.roadUsage ?? 50),
    sensitiveProximity: clampFactor(params.factors.sensitiveProximity ?? 30),
    supportingReports: clampFactor(params.factors.supportingReports ?? 20),
    unresolvedDuration: clampFactor(params.factors.unresolvedDuration ?? 10),
  }

  const weightedContributions: Record<keyof RiskFactors, number> = {
    damageSeverity: Number(
      (factors.damageSeverity * normalizedWeights.damageSeverity).toFixed(2),
    ),
    roadUsage: Number(
      (factors.roadUsage * normalizedWeights.roadUsage).toFixed(2),
    ),
    sensitiveProximity: Number(
      (
        factors.sensitiveProximity * normalizedWeights.sensitiveProximity
      ).toFixed(2),
    ),
    supportingReports: Number(
      (factors.supportingReports * normalizedWeights.supportingReports).toFixed(
        2,
      ),
    ),
    unresolvedDuration: Number(
      (
        factors.unresolvedDuration * normalizedWeights.unresolvedDuration
      ).toFixed(2),
    ),
  }

  const rawTotal =
    weightedContributions.damageSeverity +
    weightedContributions.roadUsage +
    weightedContributions.sensitiveProximity +
    weightedContributions.supportingReports +
    weightedContributions.unresolvedDuration

  const score = clampFactor(rawTotal)
  const level = determineSeverityLevel(score)

  const { explanation, recommendedAction } = generateRiskExplanation(
    score,
    level,
    factors,
    weightedContributions,
    {
      category: params.category,
      depthMm: params.depthMm,
      roadClass: params.roadClass,
      supportingCount: params.supportingCount,
      nearestSensitiveType: params.nearestSensitiveType,
      distanceMeters: params.distanceMeters,
    },
  )

  return {
    score,
    level,
    factors,
    weights: normalizedWeights,
    weightedContributions,
    explanation,
    recommendedAction,
    calculatedAt: new Date().toISOString(),
    proximityDetails: {
      nearestSensitiveType: params.nearestSensitiveType || "none",
      distanceMeters: params.distanceMeters,
      isEstimated: params.distanceMeters === undefined,
    },
    roadUsageDetails: {
      roadClass: params.roadClass || "local",
      estimatedVehiclesPerHour: params.vehiclesPerHour,
      isEstimated: params.vehiclesPerHour === undefined,
    },
  }
}
