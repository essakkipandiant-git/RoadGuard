import { describe, expect, it } from "vitest"
import {
  mapBackendCategory,
  mapBackendSeverity,
  mapBackendStatus,
  mapBackendRole,
  mapBackendIssueToRoadIssue,
  ApiError,
} from "../services/apiClient"

describe("Phase 9: Frontend API Client & Data Transformation Tests", () => {
  describe("1. Enum & String Normalization Helpers", () => {
    it("Normalizes backend damage categories to lowercase valid frontend types", () => {
      expect(mapBackendCategory("CAVITY")).toBe("cavity")
      expect(mapBackendCategory("CRACK")).toBe("crack")
      expect(mapBackendCategory("EDGE")).toBe("edge")
      expect(mapBackendCategory("DEPRESSION")).toBe("depression")
      expect(mapBackendCategory("RUTTING")).toBe("rutting")
      expect(mapBackendCategory("unknown_variant")).toBe("cavity") // safe fallback
    })

    it("Normalizes backend damage severities", () => {
      expect(mapBackendSeverity("CRITICAL")).toBe("critical")
      expect(mapBackendSeverity("HIGH")).toBe("high")
      expect(mapBackendSeverity("MODERATE")).toBe("moderate")
      expect(mapBackendSeverity("LOW")).toBe("low")
      expect(mapBackendSeverity("INVALID")).toBe("moderate") // safe fallback
    })

    it("Normalizes backend lifecycle statuses to frontend UI statuses", () => {
      expect(mapBackendStatus("REPORTED")).toBe("reported")
      expect(mapBackendStatus("UNDER_REVIEW")).toBe("under_review")
      expect(mapBackendStatus("VERIFIED")).toBe("under_review")
      expect(mapBackendStatus("ASSIGNED")).toBe("assigned")
      expect(mapBackendStatus("IN_PROGRESS")).toBe("in_progress")
      expect(mapBackendStatus("REPAIR_COMPLETED")).toBe("verified_repaired")
      expect(mapBackendStatus("CLOSED")).toBe("verified_repaired")
      expect(mapBackendStatus("REOPENED")).toBe("reopened")
      expect(mapBackendStatus("REJECTED")).toBe("rejected")
    })

    it("Normalizes backend user roles to frontend UI roles", () => {
      expect(mapBackendRole("SUPER_ADMIN")).toBe("authority")
      expect(mapBackendRole("DEPARTMENT_ADMIN")).toBe("authority")
      expect(mapBackendRole("INSPECTOR")).toBe("inspector")
      expect(mapBackendRole("CITIZEN")).toBe("citizen")
    })
  })

  describe("2. Backend Issue to Frontend RoadIssue Transformation", () => {
    it("Transforms complete backend road defect record into a valid RoadIssue model", () => {
      const rawBackendIssue = {
        id: "76e185c1-e577-4444-afc6-8c0e4f3f51ae",
        reportNumber: "RG-10492",
        title: "Critical Pothole Cavity",
        description: "Severe asphalt cavity on active bike corridor near bus stop.",
        damageCategory: "CAVITY",
        damageSeverity: "CRITICAL",
        depth: 62,
        latitude: 51.5082,
        longitude: -0.1245,
        address: "Harbour Ave near Pier 4, London",
        status: "REPORTED",
        riskScore: 89,
        confirmationsCount: 3,
        createdAt: "2026-11-07T06:33:55.409Z",
        updatedAt: "2026-11-07T06:33:55.409Z",
        ward: {
          name: "Harbour & Maritime Sector",
          city: "London",
        },
        reportedBy: {
          fullName: "Elena Vance",
          email: "citizen.test@roadguard.local",
          role: "CITIZEN",
        },
        images: [
          {
            imageUrl: "/images/detection_asphalt.jpg",
            imageType: "ORIGINAL_REPORT",
          },
        ],
        workOrders: [
          {
            orderNumber: "WO-10492",
            assignedCrew: "Asphalt Rapid Crew 1",
            scheduledDate: "2026-11-08T09:00:00Z",
          },
        ],
      }

      const roadIssue = mapBackendIssueToRoadIssue(rawBackendIssue)

      expect(roadIssue.id).toBe("76e185c1-e577-4444-afc6-8c0e4f3f51ae")
      expect(roadIssue.trackingCode).toBe("RG-10492")
      expect(roadIssue.category).toBe("cavity")
      expect(roadIssue.severity).toBe("critical")
      expect(roadIssue.status).toBe("reported")
      expect(roadIssue.coordinates.lat).toBe(51.5082)
      expect(roadIssue.coordinates.lng).toBe(-0.1245)
      expect(roadIssue.address).toBe("Harbour Ave near Pier 4, London")
      expect(roadIssue.city).toBe("London")
      expect(roadIssue.originalPhotoUrl).toBe("/images/detection_asphalt.jpg")
      expect(roadIssue.risk.score).toBe(89)
      expect(roadIssue.risk.level).toBe("critical")
      expect(roadIssue.repair.workOrderNumber).toBe("WO-10492")
      expect(roadIssue.repair.assignedCrew).toBe("Asphalt Rapid Crew 1")
      expect(roadIssue.reportedBy).toBe("Elena Vance")
      expect(roadIssue.supportingCount).toBe(3)
    })

    it("Provides robust fallbacks when backend issue has missing or null optional fields", () => {
      const minimalBackendIssue = {
        id: "issue-min-1",
        latitude: 51.5074,
        longitude: -0.1278,
        address: "Default Road, London",
      }

      const roadIssue = mapBackendIssueToRoadIssue(minimalBackendIssue)

      expect(roadIssue.id).toBe("issue-min-1")
      expect(roadIssue.trackingCode).toBe("issue-mi")
      expect(roadIssue.category).toBe("cavity")
      expect(roadIssue.severity).toBe("moderate")
      expect(roadIssue.status).toBe("reported")
      expect(roadIssue.coordinates.lat).toBe(51.5074)
      expect(roadIssue.coordinates.lng).toBe(-0.1278)
      expect(roadIssue.originalPhotoUrl).toBe("/images/detection_asphalt.jpg")
      expect(roadIssue.risk.score).toBe(50)
      expect(roadIssue.supportingCount).toBe(1)
    })
  })

  describe("3. ApiError Class Verification", () => {
    it("Constructs structured error with custom code and HTTP status", () => {
      const err = new ApiError("Email already in use", "DUPLICATE_EMAIL", 409, { email: "taken@example.com" })
      expect(err.message).toBe("Email already in use")
      expect(err.code).toBe("DUPLICATE_EMAIL")
      expect(err.statusCode).toBe(409)
      expect(err.details).toEqual({ email: "taken@example.com" })
    })
  })
})

