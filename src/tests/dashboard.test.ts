import { describe, expect, it } from "vitest"
import { RoadIssue } from "../types/roadguard"

const mockIssues: RoadIssue[] = [
  {
    id: "iss-1",
    trackingCode: "RG-10492",
    title: "Critical Pothole Cavity",
    category: "cavity",
    severity: "critical",
    status: "reported",
    coordinates: { lat: 51.5082, lng: -0.1245 },
    address: "Harbour Ave near Pier 4, London",
    city: "London",
    wardId: "ward-harbour",
    wardName: "Harbour & Maritime Sector",
    departmentId: "dept-highways",
    originalPhotoUrl: "/images/detection_asphalt.jpg",
    detection: {
      engine: "edge_cv",
      category: "cavity",
      confidence: 0.98,
      boxes: [],
      surfaceLossRatio: 0.18,
      depthEstimateMm: 62,
      severity: "critical",
      originalImageUrl: "/images/detection_asphalt.jpg",
      annotatedImageUrl: "/images/detection_asphalt.jpg",
      rawInferenceTimeMs: 14,
    },
    risk: {
      score: 89,
      level: "critical",
      factors: {
        damageSeverity: 88,
        roadUsage: 92,
        sensitiveProximity: 80,
        supportingReports: 70,
        unresolvedDuration: 40,
      },
      weights: {
        damageSeverity: 0.35,
        roadUsage: 0.25,
        sensitiveProximity: 0.15,
        supportingReports: 0.15,
        unresolvedDuration: 0.1,
      },
      weightedContributions: {
        damageSeverity: 30.8,
        roadUsage: 23,
        sensitiveProximity: 12,
        supportingReports: 10.5,
        unresolvedDuration: 4,
      },
      explanation: "Critical cavity near pedestrian crossing",
      recommendedAction: "Immediate dispatch",
      calculatedAt: "2026-11-07T00:00:00Z",
    },
    supportingReports: [],
    supportingCount: 2,
    statusHistory: [],
    repair: {},
    createdAt: "2026-11-07T00:00:00Z",
    updatedAt: "2026-11-07T00:00:00Z",
    reportedBy: "Elena Vance",
  },
  {
    id: "iss-2",
    trackingCode: "RG-28190",
    title: "Surface Web Cracking",
    category: "crack",
    severity: "high",
    status: "in_progress",
    coordinates: { lat: 51.5061, lng: -0.131 },
    address: "Mason Street, Junction 9, London",
    city: "London",
    wardId: "ward-central",
    wardName: "Central Downtown District",
    departmentId: "dept-highways",
    originalPhotoUrl: "/images/hero_road.jpg",
    detection: {
      engine: "edge_cv",
      category: "crack",
      confidence: 0.92,
      boxes: [],
      surfaceLossRatio: 0.08,
      depthEstimateMm: 24,
      severity: "high",
      originalImageUrl: "/images/hero_road.jpg",
      annotatedImageUrl: "/images/hero_road.jpg",
      rawInferenceTimeMs: 12,
    },
    risk: {
      score: 68,
      level: "high",
      factors: {
        damageSeverity: 65,
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
        damageSeverity: 22.75,
        roadUsage: 17.5,
        sensitiveProximity: 9,
        supportingReports: 3,
        unresolvedDuration: 3,
      },
      explanation: "High wear near school corridor",
      recommendedAction: "Schedule repair",
      calculatedAt: "2026-11-07T00:00:00Z",
    },
    supportingReports: [],
    supportingCount: 1,
    statusHistory: [],
    repair: {},
    createdAt: "2026-11-07T00:00:00Z",
    updatedAt: "2026-11-07T00:00:00Z",
    reportedBy: "Marcus Chief",
  },
  {
    id: "iss-3",
    trackingCode: "RG-39104",
    title: "Edge Failure & Subsidence",
    category: "edge",
    severity: "low",
    status: "verified_repaired",
    coordinates: { lat: 51.512, lng: -0.119 },
    address: "North Loop near Kingsway, London",
    city: "London",
    wardId: "ward-north",
    wardName: "North Commercial Corridor",
    departmentId: "dept-publicworks",
    originalPhotoUrl: "/images/repaired_road.jpg",
    detection: {
      engine: "edge_cv",
      category: "edge",
      confidence: 0.89,
      boxes: [],
      surfaceLossRatio: 0.05,
      depthEstimateMm: 18,
      severity: "low",
      originalImageUrl: "/images/repaired_road.jpg",
      annotatedImageUrl: "/images/repaired_road.jpg",
      rawInferenceTimeMs: 11,
    },
    risk: {
      score: 12,
      level: "low",
      factors: {
        damageSeverity: 15,
        roadUsage: 20,
        sensitiveProximity: 10,
        supportingReports: 0,
        unresolvedDuration: 0,
      },
      weights: {
        damageSeverity: 0.35,
        roadUsage: 0.25,
        sensitiveProximity: 0.15,
        supportingReports: 0.15,
        unresolvedDuration: 0.1,
      },
      weightedContributions: {
        damageSeverity: 5.25,
        roadUsage: 5,
        sensitiveProximity: 1.5,
        supportingReports: 0,
        unresolvedDuration: 0,
      },
      explanation: "Restored and verified",
      recommendedAction: "Archived",
      calculatedAt: "2026-11-07T00:00:00Z",
    },
    supportingReports: [],
    supportingCount: 0,
    statusHistory: [],
    repair: {
      verificationDecision: "approved",
    },
    createdAt: "2026-11-07T00:00:00Z",
    updatedAt: "2026-11-07T00:00:00Z",
    reportedBy: "Sarah Jenkins",
  },
]

describe("Phase 10: City Triage Dashboard & Live Filtering Tests", () => {
  describe("1. Multi-Dimensional Filter Predicates", () => {
    it("Filters issues strictly by status", () => {
      const reportedOnly = mockIssues.filter((i) => i.status === "reported")
      expect(reportedOnly.length).toBe(1)
      expect(reportedOnly[0].id).toBe("iss-1")

      const inProgressOnly = mockIssues.filter((i) => i.status === "in_progress")
      expect(inProgressOnly.length).toBe(1)
      expect(inProgressOnly[0].id).toBe("iss-2")

      const repairedOnly = mockIssues.filter((i) => i.status === "verified_repaired")
      expect(repairedOnly.length).toBe(1)
      expect(repairedOnly[0].id).toBe("iss-3")
    })

    it("Filters issues strictly by damage severity", () => {
      const criticalOnly = mockIssues.filter((i) => i.severity === "critical")
      expect(criticalOnly.length).toBe(1)
      expect(criticalOnly[0].id).toBe("iss-1")

      const lowOnly = mockIssues.filter((i) => i.severity === "low")
      expect(lowOnly.length).toBe(1)
      expect(lowOnly[0].id).toBe("iss-3")
    })

    it("Filters issues strictly by municipal ward", () => {
      const harbourWard = mockIssues.filter(
        (i) => i.wardId === "ward-harbour" || i.wardName === "Harbour & Maritime Sector",
      )
      expect(harbourWard.length).toBe(1)
      expect(harbourWard[0].trackingCode).toBe("RG-10492")

      const centralWard = mockIssues.filter(
        (i) => i.wardId === "ward-central" || i.wardName === "Central Downtown District",
      )
      expect(centralWard.length).toBe(1)
      expect(centralWard[0].trackingCode).toBe("RG-28190")
    })

    it("Filters issues strictly by municipal department", () => {
      const highways = mockIssues.filter((i) => i.departmentId === "dept-highways")
      expect(highways.length).toBe(2)

      const publicWorks = mockIssues.filter((i) => i.departmentId === "dept-publicworks")
      expect(publicWorks.length).toBe(1)
      expect(publicWorks[0].id).toBe("iss-3")
    })

    it("Performs fuzzy text search across tracking code, title, and address", () => {
      const searchHarbour = mockIssues.filter((i) =>
        `${i.title} ${i.address} ${i.trackingCode}`.toLowerCase().includes("harbour"),
      )
      expect(searchHarbour.length).toBe(1)
      expect(searchHarbour[0].id).toBe("iss-1")

      const searchCode = mockIssues.filter((i) =>
        `${i.title} ${i.address} ${i.trackingCode}`.toLowerCase().includes("rg-28190"),
      )
      expect(searchCode.length).toBe(1)
      expect(searchCode[0].id).toBe("iss-2")
    })

    it("Handles empty state when filters yield zero matching records", () => {
      const emptyMatch = mockIssues.filter(
        (i) => i.status === "reported" && i.severity === "low",
      )
      expect(emptyMatch.length).toBe(0)
    })
  })
})

