import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  MigrationService,
  OFFLINE_QUEUE_KEY,
  STORAGE_KEY,
  MIGRATION_BANNER_DISMISSED_KEY,
} from "../services/migrationService"
import { apiClient } from "../services/apiClient"

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

// Attach to globalThis for node test environment
// @ts-ignore
globalThis.window = globalThis
// @ts-ignore
globalThis.localStorage = mockLocalStorage
// @ts-ignore
globalThis.sessionStorage = mockSessionStorage

describe("Phase 12: Safe LocalStorage Data Migration Service Tests", () => {
  beforeEach(() => {
    mockLocalStorage.clear()
    mockSessionStorage.clear()
    vi.restoreAllMocks()
  })

  describe("1. Static Seed & UUID Identification", () => {
    it("Identifies static prototype seed IDs correctly", () => {
      expect(MigrationService.isSeedIssue("RG-10492")).toBe(true)
      expect(MigrationService.isSeedIssue("RG-28190")).toBe(true)
      expect(MigrationService.isSeedIssue("RG-39104")).toBe(true)
      expect(MigrationService.isSeedIssue("RG-49201")).toBe(true)
      expect(MigrationService.isSeedIssue("RG-99999")).toBe(false)
      expect(MigrationService.isSeedIssue("custom-id-123")).toBe(false)
    })

    it("Identifies valid database UUIDs correctly", () => {
      expect(MigrationService.isUuid("8f8cb08e-5b1f-4b07-9ba7-789a7bbdf936")).toBe(true)
      expect(MigrationService.isUuid("9231f2bc-8664-42f0-94e8-4228946db396")).toBe(true)
      expect(MigrationService.isUuid("RG-10492")).toBe(false)
      expect(MigrationService.isUuid("LOCAL-123456789")).toBe(false)
      expect(MigrationService.isUuid("")).toBe(false)
    })
  })

  describe("2. Offline Queue Management", () => {
    it("Queues a newly reported offline defect into pending queue", () => {
      const pending = MigrationService.queueOfflineReport(
        {
          id: "LOCAL-TEMP-001",
          title: "Deep Pothole at 5th and Main",
          notes: "Tire hazard",
          category: "cavity",
          severity: "critical",
          coordinates: { lat: 51.5, lng: -0.1 },
        },
        "Network connection offline",
      )

      expect(pending.id).toBe("LOCAL-TEMP-001")
      expect(pending.depthEstimateMm).toBe(65) // Inferred for critical
      expect(pending.syncStatus).toBe("failed")
      expect(pending.lastSyncError).toBe("Network connection offline")

      const queue = MigrationService.getPendingQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].title).toBe("Deep Pothole at 5th and Main")
    })

    it("Avoids duplicating existing pending queue entries", () => {
      MigrationService.queueOfflineReport({ id: "REPORT-1", title: "Original" })
      MigrationService.queueOfflineReport({ id: "REPORT-1", title: "Updated Title" })

      const queue = MigrationService.getPendingQueue()
      expect(queue.length).toBe(1)
      expect(queue[0].title).toBe("Updated Title")
    })
  })

  describe("3. Legacy Un-synced Report Detection", () => {
    it("Detects legacy local reports while ignoring static seeds and database UUIDs", () => {
      const mockStorageData = [
        { id: "RG-10492", title: "Static Seed Cavity" }, // Seed -> Ignore
        { id: "8f8cb08e-5b1f-4b07-9ba7-789a7bbdf936", title: "Database Synced Defect" }, // UUID -> Ignore
        {
          id: "RG-98124",
          title: "Offline Citizen Pothole Report",
          notes: "Discovered on 4th St",
          category: "cavity",
          severity: "high",
          coordinates: { lat: 51.52, lng: -0.11 },
          address: "4th St",
        }, // Legacy un-synced -> Enqueue
      ]

      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockStorageData))

      const detected = MigrationService.detectAndQueueLegacyUnsynced()
      expect(detected.length).toBe(1)
      expect(detected[0].id).toBe("RG-98124")
      expect(detected[0].title).toBe("Offline Citizen Pothole Report")
      expect(detected[0].depthEstimateMm).toBe(45) // Inferred for high

      // Verify pending count matches
      expect(MigrationService.getPendingCount()).toBe(1)
    })
  })

  describe("4. Safe Synchronization Pipeline", () => {
    it("Successfully migrates pending reports to backend and clears queue only upon 201 Created", async () => {
      // Setup pending item
      MigrationService.queueOfflineReport({
        id: "LOCAL-001",
        title: "Sunken Manhole Cover",
        notes: "Depression on cyclist lane",
        category: "depression",
        severity: "moderate",
        coordinates: { lat: 51.51, lng: -0.12 },
        address: "Cycle Highway 3",
      })

      // Mock successful backend response
      const serverCreatedIssue: any = {
        id: "d9e8f7a6-b5c4-4d3e-2f1a-0987654321ab",
        trackingCode: "RG-2026-00042",
        title: "Sunken Manhole Cover",
        category: "depression",
        severity: "moderate",
        status: "reported",
        coordinates: { lat: 51.51, lng: -0.12 },
      }

      const createSpy = vi
        .spyOn(apiClient.issues, "create")
        .mockResolvedValueOnce(serverCreatedIssue)

      let progressReports = 0
      const result = await MigrationService.syncPendingReports({
        onProgress: (current, total) => {
          progressReports++
          expect(current).toBe(1)
          expect(total).toBe(1)
        },
      })

      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(result.syncedCount).toBe(1)
      expect(result.failedCount).toBe(0)
      expect(result.syncedIssues[0].id).toBe("d9e8f7a6-b5c4-4d3e-2f1a-0987654321ab")
      expect(progressReports).toBe(1)

      // Verify pending queue is safely cleared for the synced item
      expect(MigrationService.getPendingQueue().length).toBe(0)
    })

    it("Preserves pending reports in queue when backend returns an error (Zero Data Loss Guarantee)", async () => {
      MigrationService.queueOfflineReport({
        id: "LOCAL-FAIL-01",
        title: "Dangerous Rutting",
        notes: "Heavy truck ruts",
        category: "rutting",
        severity: "high",
        coordinates: { lat: 51.49, lng: -0.15 },
      })

      // Mock server 500 error
      vi.spyOn(apiClient.issues, "create").mockRejectedValueOnce(
        new Error("Municipal API server temporarily unreachable"),
      )

      const result = await MigrationService.syncPendingReports()

      expect(result.syncedCount).toBe(0)
      expect(result.failedCount).toBe(1)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain("Municipal API server temporarily unreachable")

      // Crucial: Item MUST remain in pending queue so data is never discarded!
      const queueAfterFailure = MigrationService.getPendingQueue()
      expect(queueAfterFailure.length).toBe(1)
      expect(queueAfterFailure[0].id).toBe("LOCAL-FAIL-01")
      expect(queueAfterFailure[0].attempts).toBe(1)
      expect(queueAfterFailure[0].syncStatus).toBe("failed")
      expect(queueAfterFailure[0].lastSyncError).toBe(
        "Municipal API server temporarily unreachable",
      )
    })
  })

  describe("5. Emergency JSON Backup Export & Banner State", () => {
    it("Exports pending reports as valid JSON for municipal recovery", () => {
      MigrationService.queueOfflineReport({
        id: "BACKUP-1",
        title: "Emergency Road Subsidence",
        notes: "Soil washed out",
      })

      const backupJson = MigrationService.exportBackupJson()
      expect(backupJson).toBeDefined()
      const parsed = JSON.parse(backupJson)
      expect(parsed.pendingCount).toBe(1)
      expect(parsed.reports[0].title).toBe("Emergency Road Subsidence")
    })

    it("Handles session dismissal flags accurately", () => {
      expect(MigrationService.isBannerDismissed()).toBe(false)
      MigrationService.setBannerDismissed(true)
      expect(MigrationService.isBannerDismissed()).toBe(true)
      MigrationService.setBannerDismissed(false)
      expect(MigrationService.isBannerDismissed()).toBe(false)
    })
  })
})
