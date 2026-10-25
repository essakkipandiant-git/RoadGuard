import { describe, expect, it } from "vitest"
import {
  areCategoriesCompatible,
  calculateHaversineDistanceMeters,
  findPotentialDuplicates,
  supportExistingIssue,
} from "../services/duplicateService"
import { RoadIssue } from "../types/roadguard"

const MOCK_ISSUE: RoadIssue = {
  id: "RG-9999",
  trackingCode: "CAV-999",
  title: "Test Pothole",
  category: "cavity",
  severity: "high",
  status: "reported",
  coordinates: { lat: 51.5074, lng: -0.1278 },
  address: "Trafalgar Square",
  originalPhotoUrl: "/images/detection_asphalt.jpg",
  detection: {
    engine: "edge_cv",
    category: "cavity",
    confidence: 0.95,
    boxes: [],
    surfaceLossRatio: 0.15,
    depthEstimateMm: 55,
    severity: "high",
    originalImageUrl: "/images/detection_asphalt.jpg",
    annotatedImageUrl: "/images/detection_asphalt.jpg",
    rawInferenceTimeMs: 12,
  },
  risk: {
    score: 72,
    level: "high",
    factors: {
      damageSeverity: 75,
      roadUsage: 70,
      sensitiveProximity: 60,
      supportingReports: 20,
      unresolvedDuration: 30,
    },
    weights: {
      damageSeverity: 0.35,
      roadUsage: 0.25,
      sensitiveProximity: 0.15,
      supportingReports: 0.15,
      unresolvedDuration: 0.1,
    },
    weightedContributions: {
      damageSeverity: 26.25,
      roadUsage: 17.5,
      sensitiveProximity: 9,
      supportingReports: 3,
      unresolvedDuration: 3,
    },
    explanation: "High priority defect.",
    recommendedAction: "Schedule repair within 72 hours.",
    calculatedAt: new Date().toISOString(),
  },
  supportingReports: [],
  supportingCount: 1,
  statusHistory: [],
  repair: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  reportedBy: "Tester",
}

describe("Duplicate-Aware Reporting Service", () => {
  it("calculates accurate Haversine distance between coordinates", () => {
    // Zero distance
    const distZero = calculateHaversineDistanceMeters(
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.5074, lng: -0.1278 },
    )
    expect(distZero).toBe(0)

    // Nearby point ~11 meters away (0.0001 deg lat is approx 11.1 meters)
    const distNearby = calculateHaversineDistanceMeters(
      { lat: 51.5074, lng: -0.1278 },
      { lat: 51.5075, lng: -0.1278 },
    )
    expect(distNearby).toBeGreaterThan(10)
    expect(distNearby).toBeLessThan(13)
  })

  it("checks category compatibility correctly", () => {
    expect(areCategoriesCompatible("cavity", "cavity")).toBe(true)
    expect(areCategoriesCompatible("cavity", "depression")).toBe(true)
    expect(areCategoriesCompatible("crack", "edge")).toBe(true)
    expect(areCategoriesCompatible("cavity", "crack")).toBe(false)
  })

  it("detects possible duplicate when within proximity threshold (<=40m)", () => {
    // 15 meters away
    const result = findPotentialDuplicates(
      { lat: 51.5075, lng: -0.1278 },
      "cavity",
      [MOCK_ISSUE],
      40,
    )

    expect(result.isDuplicate).toBe(true)
    expect(result.existingIssue?.id).toBe(MOCK_ISSUE.id)
    expect(result.distanceMeters).toBeLessThan(20)
    expect(result.confidenceScore).toBeGreaterThan(0.6)
  })

  it("does not flag duplicate when location is far (>40m)", () => {
    // 500 meters away
    const result = findPotentialDuplicates(
      { lat: 51.512, lng: -0.1278 },
      "cavity",
      [MOCK_ISSUE],
      40,
    )

    expect(result.isDuplicate).toBe(false)
    expect(result.distanceMeters).toBeGreaterThan(400)
  })

  it("supports existing issue by adding evidence and updating risk score", () => {
    const updated = supportExistingIssue(MOCK_ISSUE, {
      userId: "citizen-42",
      userName: "Sarah Jenkins",
      notes: "Hit this on my commute today.",
    })

    expect(updated.supportingCount).toBe(2)
    expect(updated.supportingReports.length).toBe(1)
    expect(updated.supportingReports[0].userName).toBe("Sarah Jenkins")
    // Supporting reports factor increased, so risk score should increase or stay high!
    expect(updated.risk.factors.supportingReports).toBe(45)
  })
})
