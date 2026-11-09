import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  apiClient,
  ApiError,
  mapBackendCategory,
  mapBackendSeverity,
  mapBackendStatus,
  mapBackendRole,
  mapBackendIssueToRoadIssue,
} from "../services/apiClient"
import { MigrationService, OFFLINE_QUEUE_KEY, STORAGE_KEY } from "../services/migrationService"
import { RoadIssueService } from "../services/roadIssueService"

// In-memory localStorage polyfill for Node.js test environment
class MockStorage implements Storage {
  private store: Record<string, string> = {}
  get length() {
    return Object.keys(this.store).length
  }
  clear() {
    this.store = {}
  }
  getItem(key: string) {
    return this.store[key] ?? null
  }
  key(index: number) {
    return Object.keys(this.store)[index] ?? null
  }
  removeItem(key: string) {
    delete this.store[key]
  }
  setItem(key: string, value: string) {
    this.store[key] = String(value)
  }
}

const mockLocalStorage = new MockStorage()
const mockSessionStorage = new MockStorage()

// @ts-ignore
globalThis.window = globalThis
// @ts-ignore
globalThis.localStorage = mockLocalStorage
// @ts-ignore
globalThis.sessionStorage = mockSessionStorage

describe("Phase 13: Frontend End-to-End User Journeys & Edge Case Testing", () => {
  beforeEach(() => {
    mockLocalStorage.clear()
    mockSessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe("1. Frontend Domain Model Bidirectional Normalization", () => {
    it("Normalizes backend UPPERCASE enums to frontend lowercase formats", () => {
      expect(mapBackendCategory("CAVITY")).toBe("cavity")
      expect(mapBackendCategory("CRACK")).toBe("crack")
      expect(mapBackendCategory("EDGE_SUBSIDENCE")).toBe("edge")
      expect(mapBackendCategory("DEPRESSION")).toBe("depression")
      expect(mapBackendCategory("RUTTING")).toBe("rutting")

      expect(mapBackendSeverity("CRITICAL")).toBe("critical")
      expect(mapBackendSeverity("HIGH")).toBe("high")
      expect(mapBackendSeverity("MODERATE")).toBe("moderate")
      expect(mapBackendSeverity("LOW")).toBe("low")

      expect(mapBackendStatus("REPORTED")).toBe("reported")
      expect(mapBackendStatus("UNDER_REVIEW")).toBe("under_review")
      expect(mapBackendStatus("ASSIGNED")).toBe("assigned")
      expect(mapBackendStatus("IN_PROGRESS")).toBe("in_progress")
      expect(mapBackendStatus("VERIFIED")).toBe("under_review")
      expect(mapBackendStatus("REPAIR_COMPLETED")).toBe("verified_repaired")
      expect(mapBackendStatus("REOPENED")).toBe("reopened")
      expect(mapBackendStatus("REJECTED")).toBe("rejected")

      expect(mapBackendRole("SUPER_ADMIN")).toBe("authority")
      expect(mapBackendRole("DEPARTMENT_ADMIN")).toBe("authority")
      expect(mapBackendRole("INSPECTOR")).toBe("inspector")
      expect(mapBackendRole("CITIZEN")).toBe("citizen")
    })

    it("Transforms a raw backend SQLite defect object into a full RoadIssue domain model", () => {
      const backendIssue = {
        id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        reportNumber: "RG-2026-00109",
        title: "Severe Roadway Pothole",
        description: "Deep cavity causing suspension damage",
        damageCategory: "CAVITY",
        damageSeverity: "CRITICAL",
        depth: 68,
        latitude: 51.5074,
        longitude: -0.1278,
        address: "Trafalgar Square, London",
        riskScore: 84,
        status: "ASSIGNED",
        confirmationsCount: 5,
        wardId: "ward-central",
        departmentId: "dept-highways",
        ward: { name: "Central Westminster" },
        images: [
          {
            url: "https://res.cloudinary.com/roadguard/image/upload/v1/evidence.jpg",
            imageType: "EVIDENCE",
          },
        ],
        statusHistory: [
          {
            id: "hist-1",
            previousStatus: "REPORTED",
            newStatus: "ASSIGNED",
            createdAt: "2026-11-01T10:00:00Z",
            changedBy: { fullName: "Chief Brody", role: "DEPARTMENT_ADMIN" },
            remarks: "Work order dispatched",
          },
        ],
        createdAt: "2026-11-01T08:00:00Z",
        updatedAt: "2026-11-01T10:00:00Z",
      }

      const domain = mapBackendIssueToRoadIssue(backendIssue)

      expect(domain.id).toBe("a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
      expect(domain.trackingCode).toBe("RG-2026-00109")
      expect(domain.category).toBe("cavity")
      expect(domain.severity).toBe("critical")
      expect(domain.status).toBe("assigned")
      expect(domain.coordinates.lat).toBe(51.5074)
      expect(domain.coordinates.lng).toBe(-0.1278)
      expect(domain.wardId).toBe("ward-central")
      expect(domain.wardName).toBe("Central Westminster")
      expect(domain.departmentId).toBe("dept-highways")
      expect(domain.supportingCount).toBe(5)
      expect(domain.originalPhotoUrl).toBe(
        "https://res.cloudinary.com/roadguard/image/upload/v1/evidence.jpg",
      )
      expect(domain.statusHistory.length).toBe(1)
      expect(domain.statusHistory[0].actorRole).toBe("authority")
      expect(domain.detection?.depthEstimateMm).toBe(68)
      expect(domain.risk?.score).toBe(84)
    })
  })

  describe("2. Offline Defect Creation & Seamless Synchronization Workflow", () => {
    it("Queues offline report on network failure and updates UI state without data loss", async () => {
      // Setup network error on backend creation
      vi.spyOn(apiClient.issues, "create").mockRejectedValueOnce(
        new Error("Network connection dropped (offline)"),
      )

      // Citizen reports road distress while disconnected
      const offlineIssue = await RoadIssueService.createIssueLive({
        title: "Disconnected Mobile Pothole Report",
        category: "cavity",
        severity: "high",
        coordinates: { lat: 51.515, lng: -0.141 },
        address: "Oxford Circus, London",
        notes: "Created while offline on transit",
        status: "reported",
        roadName: "Oxford Street",
        city: "London",
        originalPhotoUrl: "/images/detection_asphalt.jpg",
        annotatedPhotoUrl: "/images/detection_asphalt.jpg",
      } as any)

      expect(offlineIssue).toBeDefined()
      expect(offlineIssue.title).toBe("Disconnected Mobile Pothole Report")

      // Verify issue was safely placed in offline migration queue
      const pendingQueue = MigrationService.getPendingQueue()
      expect(pendingQueue.length).toBe(1)
      expect(pendingQueue[0].title).toBe("Disconnected Mobile Pothole Report")
      expect(pendingQueue[0].syncStatus).toBe("failed")

      // When connection is restored, sync to server
      const serverSyncedIssue: any = {
        id: "e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b",
        trackingCode: "RG-2026-00888",
        title: "Disconnected Mobile Pothole Report",
        category: "cavity",
        severity: "high",
        status: "reported",
        coordinates: { lat: 51.515, lng: -0.141 },
      }

      vi.spyOn(apiClient.issues, "create").mockResolvedValueOnce(serverSyncedIssue)

      const syncResult = await MigrationService.syncPendingReports({ forceDuplicate: true })
      expect(syncResult.syncedCount).toBe(1)
      expect(syncResult.failedCount).toBe(0)
      expect(syncResult.syncedIssues[0].id).toBe("e4f5a6b7-c8d9-0e1f-2a3b-4c5d6e7f8a9b")

      // Verify queue is now safely empty
      expect(MigrationService.getPendingQueue().length).toBe(0)
    })
  })

  describe("3. Resilient API Error Handling & Structured Status Serialization", () => {
    it("Constructs structured ApiError with status codes, error codes and details", () => {
      const error = new ApiError("Validation failed for input parameters", "VALIDATION_ERROR", 400, [
        { field: "depth", issue: "Must be a positive integer" },
      ])

      expect(error.name).toBe("ApiError")
      expect(error.message).toBe("Validation failed for input parameters")
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe("VALIDATION_ERROR")
      expect(error.details).toHaveLength(1)
      expect(error.details[0].field).toBe("depth")
    })
  })
})
