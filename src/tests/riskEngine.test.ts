import { describe, expect, it } from "vitest"
import {
  calculateDamageSeverityFactor,
  calculateRiskAssessment,
  calculateRoadUsageFactor,
  calculateSensitiveProximityFactor,
  calculateSupportingReportsFactor,
  calculateUnresolvedDurationFactor,
  clampFactor,
  determineSeverityLevel,
} from "../services/riskEngine"

describe("Explainable Road Risk Engine", () => {
  it("clamps factors safely within [0, 100] bounds", () => {
    expect(clampFactor(-10)).toBe(0)
    expect(clampFactor(150)).toBe(100)
    expect(clampFactor(NaN)).toBe(0)
    expect(clampFactor(Infinity)).toBe(0)
    expect(clampFactor(42)).toBe(42)
  })

  it("calculates damage severity factor predictably across categories", () => {
    // Cavity depth scaling
    const shallowCavity = calculateDamageSeverityFactor({
      category: "cavity",
      depthMm: 20,
    })
    const deepCavity = calculateDamageSeverityFactor({
      category: "cavity",
      depthMm: 75,
    })
    expect(deepCavity).toBeGreaterThan(shallowCavity)

    // Multi-detection cluster penalty
    const singleDefect = calculateDamageSeverityFactor({
      category: "cavity",
      depthMm: 50,
      detectionCount: 1,
    })
    const multiDefect = calculateDamageSeverityFactor({
      category: "cavity",
      depthMm: 50,
      detectionCount: 3,
    })
    expect(multiDefect).toBeGreaterThan(singleDefect)
  })

  it("calculates road usage factor based on vehicle volume or road class", () => {
    const arterial = calculateRoadUsageFactor({ roadClass: "arterial" })
    const local = calculateRoadUsageFactor({ roadClass: "local" })
    expect(arterial).toBeGreaterThan(local)

    const highTraffic = calculateRoadUsageFactor({ vehiclesPerHour: 750 })
    const lowTraffic = calculateRoadUsageFactor({ vehiclesPerHour: 80 })
    expect(highTraffic).toBeGreaterThan(lowTraffic)
  })

  it("calculates proximity factor based on distance to sensitive locations", () => {
    const adjacent = calculateSensitiveProximityFactor({ distanceMeters: 40 })
    const far = calculateSensitiveProximityFactor({ distanceMeters: 750 })
    expect(adjacent).toBe(95)
    expect(far).toBe(15)
  })

  it("calculates community supporting reports factor monotonically", () => {
    const oneReport = calculateSupportingReportsFactor(1)
    const threeReports = calculateSupportingReportsFactor(3)
    const fiveReports = calculateSupportingReportsFactor(5)
    expect(oneReport).toBe(20)
    expect(threeReports).toBe(70)
    expect(fiveReports).toBe(100)
  })

  it("produces deterministic total risk assessment within [0, 100]", () => {
    const assessment1 = calculateRiskAssessment({
      factors: {
        damageSeverity: 85,
        roadUsage: 90,
        sensitiveProximity: 80,
        supportingReports: 70,
        unresolvedDuration: 50,
      },
    })

    const assessment2 = calculateRiskAssessment({
      factors: {
        damageSeverity: 85,
        roadUsage: 90,
        sensitiveProximity: 80,
        supportingReports: 70,
        unresolvedDuration: 50,
      },
    })

    expect(assessment1.score).toBe(assessment2.score)
    expect(assessment1.score).toBeGreaterThanOrEqual(0)
    expect(assessment1.score).toBeLessThanOrEqual(100)
    expect(assessment1.level).toBe("critical")
    expect(assessment1.explanation).toContain("CRITICAL priority")
  })

  it("determines correct severity level thresholds", () => {
    expect(determineSeverityLevel(92)).toBe("critical")
    expect(determineSeverityLevel(72)).toBe("high")
    expect(determineSeverityLevel(48)).toBe("moderate")
    expect(determineSeverityLevel(20)).toBe("low")
  })

  it("handles edge cases and invalid inputs without crashing", () => {
    const result = calculateRiskAssessment({
      factors: {
        damageSeverity: NaN,
        roadUsage: -50,
        sensitiveProximity: 999,
      },
    })

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(typeof result.explanation).toBe("string")
    expect(typeof result.recommendedAction).toBe("string")
  })
})
