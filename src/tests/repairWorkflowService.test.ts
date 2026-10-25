import { describe, expect, it } from "vitest"
import {
  transitionIssueStatus,
  validateStatusTransition,
} from "../services/repairWorkflowService"
import { RoadIssue } from "../types/roadguard"

const MOCK_ISSUE: RoadIssue = {
  id: "RG-1001",
  trackingCode: "CAV-001",
  title: "Test Issue",
  category: "cavity",
  severity: "critical",
  status: "reported",
  coordinates: { lat: 51.5, lng: -0.1 },
  address: "Test St",
  originalPhotoUrl: "/images/detection_asphalt.jpg",
  detection: {
    engine: "edge_cv",
    category: "cavity",
    confidence: 0.95,
    boxes: [],
    surfaceLossRatio: 0.2,
    depthEstimateMm: 60,
    severity: "critical",
    originalImageUrl: "/images/detection_asphalt.jpg",
    annotatedImageUrl: "/images/detection_asphalt.jpg",
    rawInferenceTimeMs: 10,
  },
  risk: {
    score: 85,
    level: "critical",
    factors: {
      damageSeverity: 85,
      roadUsage: 80,
      sensitiveProximity: 80,
      supportingReports: 50,
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
      damageSeverity: 29.75,
      roadUsage: 20,
      sensitiveProximity: 12,
      supportingReports: 7.5,
      unresolvedDuration: 3,
    },
    explanation: "Critical issue.",
    recommendedAction: "Immediate dispatch.",
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

describe("Repair Workflow State Machine", () => {
  it("allows valid transitions per state machine rules", () => {
    // Reported -> Under Review by Authority
    const res1 = validateStatusTransition(
      "reported",
      "under_review",
      "authority",
    )
    expect(res1.isValid).toBe(true)

    // Under Review -> Assigned by Authority
    const res2 = validateStatusTransition(
      "under_review",
      "assigned",
      "authority",
    )
    expect(res2.isValid).toBe(true)

    // Assigned -> In Progress by Crew
    const res3 = validateStatusTransition("assigned", "in_progress", "crew")
    expect(res3.isValid).toBe(true)

    // In Progress -> Awaiting Verification by Crew
    const res4 = validateStatusTransition(
      "in_progress",
      "awaiting_verification",
      "crew",
    )
    expect(res4.isValid).toBe(true)

    // Awaiting Verification -> Verified Repaired by Inspector
    const res5 = validateStatusTransition(
      "awaiting_verification",
      "verified_repaired",
      "inspector",
    )
    expect(res5.isValid).toBe(true)
  })

  it("blocks invalid transitions that skip required steps", () => {
    // Jumping directly from reported to verified_repaired is illegal
    const res1 = validateStatusTransition(
      "reported",
      "verified_repaired",
      "inspector",
    )
    expect(res1.isValid).toBe(false)

    // Jumping from reported to in_progress is illegal
    const res2 = validateStatusTransition("reported", "in_progress", "crew")
    expect(res2.isValid).toBe(false)
  })

  it("enforces role-based permissions strictly", () => {
    // Citizen cannot assign issues to crews
    const res1 = validateStatusTransition("under_review", "assigned", "citizen")
    expect(res1.isValid).toBe(false)

    // Citizen cannot mark an issue as verified repaired
    const res2 = validateStatusTransition(
      "awaiting_verification",
      "verified_repaired",
      "citizen",
    )
    expect(res2.isValid).toBe(false)

    // Citizen can reopen a verified repair with new evidence
    const res3 = validateStatusTransition(
      "verified_repaired",
      "reopened",
      "citizen",
    )
    expect(res3.isValid).toBe(true)
  })

  it("requires after-repair photograph when moving to awaiting_verification", () => {
    const inProgressIssue: RoadIssue = {
      ...MOCK_ISSUE,
      status: "in_progress",
    }

    // Attempting without after-photo
    const failRes = transitionIssueStatus(
      inProgressIssue,
      "awaiting_verification",
      {
        actorRole: "crew",
        actorName: "Crew Lead",
        notes: "Work completed.",
      },
    )
    expect(failRes.success).toBe(false)
    expect(failRes.error).toContain("after-repair photograph is required")

    // Providing after-photo succeeds
    const successRes = transitionIssueStatus(
      inProgressIssue,
      "awaiting_verification",
      {
        actorRole: "crew",
        actorName: "Crew Lead",
        notes: "Work completed.",
        afterPhotoUrl: "/images/repaired_road.jpg",
      },
    )
    expect(successRes.success).toBe(true)
    expect(successRes.issue?.status).toBe("awaiting_verification")
    expect(successRes.issue?.repair.afterPhotoUrl).toBe(
      "/images/repaired_road.jpg",
    )
  })

  it("records complete status history audit trail", () => {
    const transitionRes = transitionIssueStatus(MOCK_ISSUE, "under_review", {
      actorRole: "authority",
      actorName: "Chief Engineer",
      notes: "Validating severity.",
    })

    expect(transitionRes.success).toBe(true)
    expect(transitionRes.issue?.statusHistory.length).toBe(1)
    expect(transitionRes.issue?.statusHistory[0].toStatus).toBe("under_review")
    expect(transitionRes.issue?.statusHistory[0].actorRole).toBe("authority")
  })
})
