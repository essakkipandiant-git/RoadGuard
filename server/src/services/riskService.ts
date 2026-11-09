import { DamageCategory, DamageSeverity } from "@prisma/client"

export type RoadClassType = "arterial" | "collector" | "local" | "pedestrian_cycle"
export type SensitiveType = "hospital" | "school" | "transit" | "crossing" | "none"

export interface RiskFactors {
  damageSeverity: number
  roadUsage: number
  sensitiveProximity: number
  supportingReports: number
  unresolvedDuration: number
}

export interface RiskWeights {
  damageSeverity: number
  roadUsage: number
  sensitiveProximity: number
  supportingReports: number
  unresolvedDuration: number
}

export interface DetailedRiskAssessment {
  score: number
  level: "CRITICAL" | "HIGH" | "MODERATE" | "LOW"
  factors: RiskFactors
  weights: RiskWeights
  weightedContributions: Record<keyof RiskFactors, number>
  explanation: string
  recommendedAction: string
  calculatedAt: string
}

export interface FullRiskInput {
  damageCategory: DamageCategory
  damageSeverity?: DamageSeverity
  depth?: number | null
  surfaceLossRatio?: number | null
  detectionCount?: number | null
  roadClass?: RoadClassType | null
  vehiclesPerHour?: number | null
  distanceMeters?: number | null
  nearestSensitiveType?: SensitiveType | null
  confirmationsCount?: number | null
  createdTimestamp?: Date | string | null
}

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

export function clampFactor(val: number): number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val)) return 0
  return Math.max(0, Math.min(100, Math.round(val)))
}

export class RiskService {
  /**
   * Calculates Damage Severity Factor (0-100) based on category, measured depth, and surface loss.
   */
  static calculateDamageSeverityFactor(params: {
    category: DamageCategory
    depthMm?: number | null
    surfaceLossRatio?: number | null
    detectionCount?: number | null
  }): number {
    const {
      category,
      depthMm = 35,
      surfaceLossRatio = 0.1,
      detectionCount = 1,
    } = params

    const validDepth = typeof depthMm === "number" && !isNaN(depthMm) ? depthMm : 35
    const validLoss = typeof surfaceLossRatio === "number" && !isNaN(surfaceLossRatio) ? surfaceLossRatio : 0.1
    const validDetections = typeof detectionCount === "number" && !isNaN(detectionCount) ? detectionCount : 1

    let baseScore = 40
    switch (category) {
      case DamageCategory.CAVITY:
        // Pothole depth scaling: 0mm = 40, 50mm = 75, 80mm+ = 100
        baseScore = Math.min(100, Math.max(40, 40 + (validDepth / 80) * 60))
        break
      case DamageCategory.CRACK:
        baseScore = Math.min(85, Math.max(30, 30 + validLoss * 150))
        break
      case DamageCategory.EDGE:
        baseScore = 55
        break
      case DamageCategory.DEPRESSION:
        baseScore = 65
        break
      case DamageCategory.RUTTING:
        baseScore = 50
        break
      default:
        baseScore = 50
    }

    // Cluster penalty
    if (validDetections > 1) {
      baseScore = Math.min(100, baseScore + (validDetections - 1) * 6)
    }

    return clampFactor(baseScore)
  }

  /**
   * Calculates Road Usage Factor (0-100) based on road classification or traffic volume.
   */
  static calculateRoadUsageFactor(params: {
    roadClass?: RoadClassType | null
    vehiclesPerHour?: number | null
  }): number {
    const { roadClass, vehiclesPerHour } = params

    if (typeof vehiclesPerHour === "number" && vehiclesPerHour > 0) {
      const score = Math.min(100, 20 + (vehiclesPerHour / 800) * 80)
      return clampFactor(score)
    }

    switch (roadClass) {
      case "arterial":
        return 90
      case "collector":
        return 68
      case "pedestrian_cycle":
        return 72
      case "local":
      default:
        return 38
    }
  }

  /**
   * Calculates Sensitive Proximity Factor (0-100) based on distance to schools, hospitals, transit.
   */
  static calculateSensitiveProximityFactor(params: {
    distanceMeters?: number | null
    nearestSensitiveType?: SensitiveType | null
  }): number {
    const { distanceMeters, nearestSensitiveType } = params

    if (typeof distanceMeters === "number" && !isNaN(distanceMeters)) {
      if (distanceMeters <= 50) return 95
      if (distanceMeters <= 150) return 80
      if (distanceMeters <= 300) return 60
      if (distanceMeters <= 600) return 35
      return 15
    }

    if (nearestSensitiveType && nearestSensitiveType !== "none") {
      return 75
    }

    return 25
  }

  /**
   * Calculates Supporting Reports Factor (0-100) based on community confirmations.
   */
  static calculateSupportingReportsFactor(confirmationsCount?: number | null): number {
    const validCount = Math.max(1, typeof confirmationsCount === "number" && !isNaN(confirmationsCount) ? confirmationsCount : 1)
    if (validCount <= 1) return 20
    if (validCount === 2) return 45
    if (validCount === 3) return 70
    if (validCount === 4) return 88
    return 100
  }

  /**
   * Calculates Unresolved Duration Factor (0-100) based on days open.
   */
  static calculateUnresolvedDurationFactor(createdTimestamp?: Date | string | null): number {
    if (!createdTimestamp) return 10
    const createdDate = typeof createdTimestamp === "string" ? new Date(createdTimestamp) : createdTimestamp
    const diffMs = Math.max(0, Date.now() - createdDate.getTime())
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return clampFactor(10 + Math.min(90, (diffDays / 14) * 90))
  }

  /**
   * Evaluates complete explainable risk assessment.
   */
  static assessRisk(input: FullRiskInput): DetailedRiskAssessment {
    const damageSeverity = this.calculateDamageSeverityFactor({
      category: input.damageCategory,
      depthMm: input.depth,
      surfaceLossRatio: input.surfaceLossRatio,
      detectionCount: input.detectionCount,
    })

    const roadUsage = this.calculateRoadUsageFactor({
      roadClass: input.roadClass,
      vehiclesPerHour: input.vehiclesPerHour,
    })

    const sensitiveProximity = this.calculateSensitiveProximityFactor({
      distanceMeters: input.distanceMeters,
      nearestSensitiveType: input.nearestSensitiveType,
    })

    const supportingReports = this.calculateSupportingReportsFactor(input.confirmationsCount)
    const unresolvedDuration = this.calculateUnresolvedDurationFactor(input.createdTimestamp)

    const factors: RiskFactors = {
      damageSeverity,
      roadUsage,
      sensitiveProximity,
      supportingReports,
      unresolvedDuration,
    }

    const weights = DEFAULT_RISK_WEIGHTS

    const weightedContributions: Record<keyof RiskFactors, number> = {
      damageSeverity: Number((factors.damageSeverity * weights.damageSeverity).toFixed(2)),
      roadUsage: Number((factors.roadUsage * weights.roadUsage).toFixed(2)),
      sensitiveProximity: Number((factors.sensitiveProximity * weights.sensitiveProximity).toFixed(2)),
      supportingReports: Number((factors.supportingReports * weights.supportingReports).toFixed(2)),
      unresolvedDuration: Number((factors.unresolvedDuration * weights.unresolvedDuration).toFixed(2)),
    }

    const rawTotal =
      weightedContributions.damageSeverity +
      weightedContributions.roadUsage +
      weightedContributions.sensitiveProximity +
      weightedContributions.supportingReports +
      weightedContributions.unresolvedDuration

    let score = clampFactor(rawTotal)

    // Floor by explicit damageSeverity if specified
    if (input.damageSeverity === DamageSeverity.CRITICAL) {
      score = Math.max(score, 80)
    } else if (input.damageSeverity === DamageSeverity.HIGH) {
      score = Math.max(score, 65)
    } else if (input.damageSeverity === DamageSeverity.MODERATE) {
      score = Math.max(score, 40)
    }

    // Measured cavity depth >= 60mm represents severe vehicle suspension danger
    if (typeof input.depth === "number" && input.depth >= 60) {
      score = Math.min(100, score + 15)
    }

    const level = this.classifyRisk(score)

    const { explanation, recommendedAction } = this.generateExplanation(
      score,
      level,
      factors,
      weightedContributions,
      input,
    )

    return {
      score,
      level,
      factors,
      weights,
      weightedContributions,
      explanation,
      recommendedAction,
      calculatedAt: new Date().toISOString(),
    }
  }

  /**
   * Fast score calculator for creation & support calls.
   */
  static calculateScore(input: {
    damageCategory: DamageCategory
    damageSeverity?: DamageSeverity
    depth?: number | null
    confirmationsCount?: number | null
    roadClass?: RoadClassType | null
    distanceMeters?: number | null
  }): number {
    const assessment = this.assessRisk({
      damageCategory: input.damageCategory,
      damageSeverity: input.damageSeverity,
      depth: input.depth,
      confirmationsCount: input.confirmationsCount,
      roadClass: input.roadClass,
      distanceMeters: input.distanceMeters,
    })
    return assessment.score
  }

  /**
   * Categorizes score into CRITICAL, HIGH, MODERATE, LOW.
   */
  static classifyRisk(score: number): "CRITICAL" | "HIGH" | "MODERATE" | "LOW" {
    if (score >= RISK_THRESHOLDS.critical) return "CRITICAL"
    if (score >= RISK_THRESHOLDS.high) return "HIGH"
    if (score >= RISK_THRESHOLDS.moderate) return "MODERATE"
    return "LOW"
  }

  /**
   * Generates deterministic natural-language rationale for public works dispatchers.
   */
  private static generateExplanation(
    score: number,
    level: "CRITICAL" | "HIGH" | "MODERATE" | "LOW",
    factors: RiskFactors,
    weightedContribs: Record<keyof RiskFactors, number>,
    input: FullRiskInput,
  ): { explanation: string; recommendedAction: string } {
    const pieces: string[] = []

    if (factors.damageSeverity >= 70) {
      const depthStr = input.depth ? ` (${input.depth}mm depth)` : ""
      pieces.push(
        `severe surface cavity${depthStr} contributing ${weightedContribs.damageSeverity.toFixed(1)} pts`,
      )
    } else if (factors.damageSeverity >= 45) {
      pieces.push(
        `moderate structural wear contributing ${weightedContribs.damageSeverity.toFixed(1)} pts`,
      )
    }

    if (factors.roadUsage >= 70) {
      const roadDesc = input.roadClass ? `${input.roadClass} corridor` : "high-traffic route"
      pieces.push(`heavy exposure on a ${roadDesc}`)
    }

    if (factors.sensitiveProximity >= 60) {
      const target = input.nearestSensitiveType || "sensitive pedestrian zone"
      const distStr = input.distanceMeters ? ` (<${input.distanceMeters}m)` : ""
      pieces.push(`proximity to ${target}${distStr}`)
    }

    if (factors.supportingReports >= 50) {
      const count = input.confirmationsCount || "multiple"
      pieces.push(`${count} independent community confirmations`)
    }

    if (factors.unresolvedDuration >= 70) {
      pieces.push("unresolved status over extended observation window")
    }

    const rationale =
      pieces.length > 0
        ? pieces.join(", ") + "."
        : "standard baseline observation metrics across street telemetry."

    const explanation = `${level} priority (Score: ${score}/100) driven by ${rationale}`

    let recommendedAction = "Continue routine surface monitoring during regular municipal sweep."
    if (level === "CRITICAL") {
      recommendedAction =
        "Immediate emergency dispatch: deploy rapid asphalt hot-mix crew within 24-48 hours."
    } else if (level === "HIGH") {
      recommendedAction =
        "High-priority work order: schedule crew repair within 72 hours and alert route navigation."
    } else if (level === "MODERATE") {
      recommendedAction =
        "Scheduled maintenance: queue for district road crew during standard weekly maintenance cycle."
    }

    return { explanation, recommendedAction }
  }
}
