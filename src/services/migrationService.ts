import { RoadIssue, DamageCategory, SeverityLevel, RoadClass } from "../types/roadguard"
import { apiClient } from "./apiClient"

export const OFFLINE_QUEUE_KEY = "roadguard_offline_queue_v1"
export const STORAGE_KEY = "roadguard_issues_v2"
export const MIGRATION_BANNER_DISMISSED_KEY = "roadguard_migration_banner_dismissed"
export const ACKNOWLEDGED_LOCAL_KEY = "roadguard_acknowledged_local_reports"

// Known static prototype seed IDs that do not belong to user-reported local issues
export const STATIC_SEED_IDS = new Set(["RG-10492", "RG-28190", "RG-39104", "RG-49201"])

// Standard UUID v4 regular expression
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LocalPendingReport {
  id: string
  title: string
  notes: string
  category: DamageCategory
  severity: SeverityLevel
  depthEstimateMm: number
  coordinates: {
    lat: number
    lng: number
  }
  address: string
  roadClass?: RoadClass
  originalPhotoUrl?: string
  aiVerificationToken?: string | null
  imageHash?: string | null
  createdAt: string
  attempts: number
  lastSyncError?: string
  syncStatus: "pending" | "syncing" | "failed" | "synced"
}

export interface SyncResult {
  total: number
  syncedCount: number
  failedCount: number
  errors: string[]
  syncedIssues: RoadIssue[]
}

export class MigrationService {
  /**
   * Helper to check if an ID is a valid database UUID
   */
  static isUuid(id: string): boolean {
    return UUID_REGEX.test(id)
  }

  /**
   * Helper to check if an ID matches one of the built-in frontend prototype seeds
   */
  static isSeedIssue(id: string): boolean {
    return STATIC_SEED_IDS.has(id)
  }

  /**
   * Retrieves the current offline/pending migration queue from localStorage
   */
  static getPendingQueue(): LocalPendingReport[] {
    if (typeof window === "undefined") return []
    try {
      const data = localStorage.getItem(OFFLINE_QUEUE_KEY)
      if (!data) return []
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.warn("RoadGuard MigrationService: Failed to read offline queue:", e)
      return []
    }
  }

  /**
   * Safely writes the offline migration queue to localStorage
   */
  static savePendingQueue(queue: LocalPendingReport[]): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
    } catch (e) {
      console.warn("RoadGuard MigrationService: Failed to persist offline queue:", e)
    }
  }

  /**
   * Queues an offline or failed report into the migration queue for later sync
   */
  static queueOfflineReport(
    issue: Partial<RoadIssue> & { notes?: string },
    errorReason?: string,
  ): LocalPendingReport {
    const queue = this.getPendingQueue()

    // Determine depth estimate
    const depth =
      issue.detection?.depthEstimateMm ??
      (issue.severity === "critical"
        ? 65
        : issue.severity === "high"
          ? 45
          : issue.severity === "moderate"
            ? 30
            : 15)

    const pendingItem: LocalPendingReport = {
      id: issue.id || `LOCAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: issue.title || "Road Defect Report",
      notes: issue.notes || issue.title || "Citizen road distress report",
      category: (issue.category as DamageCategory) || "cavity",
      severity: (issue.severity as SeverityLevel) || "moderate",
      depthEstimateMm: depth,
      coordinates: issue.coordinates || { lat: 51.5074, lng: -0.1278 },
      address: issue.address || "Location captured via GPS",
      roadClass: issue.risk?.roadUsageDetails?.roadClass,
      originalPhotoUrl: issue.originalPhotoUrl,
      aiVerificationToken: issue.detection?.verificationToken ?? null,
      imageHash: issue.detection?.imageHash ?? null,
      createdAt: issue.createdAt || new Date().toISOString(),
      attempts: errorReason ? 1 : 0,
      lastSyncError: errorReason,
      syncStatus: errorReason ? "failed" : "pending",
    }

    // Avoid duplicate queuing
    const existingIndex = queue.findIndex((item) => item.id === pendingItem.id)
    if (existingIndex >= 0) {
      queue[existingIndex] = pendingItem
    } else {
      queue.push(pendingItem)
    }

    this.savePendingQueue(queue)
    return pendingItem
  }

  /**
   * Retrieves set of report IDs that the user has explicitly chosen to keep locally
   */
  static getAcknowledgedLocalIds(): Set<string> {
    if (typeof window === "undefined") return new Set()
    try {
      const data = localStorage.getItem(ACKNOWLEDGED_LOCAL_KEY)
      if (!data) return new Set()
      const parsed = JSON.parse(data)
      return new Set(Array.isArray(parsed) ? parsed : [])
    } catch {
      return new Set()
    }
  }

  /**
   * Marks a single report or all queued reports as permanently saved on this device
   */
  static markAllAsLocallySaved(): void {
    if (typeof window === "undefined") return
    try {
      const queue = this.getPendingQueue()
      const acknowledged = this.getAcknowledgedLocalIds()
      queue.forEach((item) => acknowledged.add(item.id))

      // Also acknowledge any non-UUID reports in current storage
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: RoadIssue[] = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          parsed.forEach((issue) => {
            if (issue?.id && !this.isUuid(issue.id)) {
              acknowledged.add(issue.id)
            }
          })
        }
      }

      localStorage.setItem(ACKNOWLEDGED_LOCAL_KEY, JSON.stringify(Array.from(acknowledged)))
      this.clearQueue()
      this.setBannerDismissed(true)
    } catch (e) {
      console.warn("RoadGuard MigrationService: Failed to mark as locally saved:", e)
    }
  }

  /**
   * Scans legacy localStorage ('roadguard_issues_v2') for un-synced citizen reports.
   * Filters out static seeds, issues that already have backend UUIDs, and acknowledged local issues.
   * Adds any un-queued legacy issues to the pending queue.
   */
  static detectAndQueueLegacyUnsynced(): LocalPendingReport[] {
    if (typeof window === "undefined") return []

    const currentQueue = this.getPendingQueue()
    const queuedIds = new Set(currentQueue.map((item) => item.id))
    const acknowledgedIds = this.getAcknowledgedLocalIds()

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return currentQueue

      const parsed: RoadIssue[] = JSON.parse(stored)
      if (!Array.isArray(parsed)) return currentQueue

      let newlyAdded = false
      for (const issue of parsed) {
        if (!issue || !issue.id) continue

        // Skip built-in demo seeds, items with database UUIDs, and items acknowledged as saved locally
        if (
          this.isSeedIssue(issue.id) ||
          this.isUuid(issue.id) ||
          acknowledgedIds.has(issue.id)
        ) {
          continue
        }

        // If not already in pending queue, enqueue it
        if (!queuedIds.has(issue.id)) {
          const depth =
            issue.detection?.depthEstimateMm ??
            (issue.severity === "critical"
              ? 65
              : issue.severity === "high"
                ? 45
                : issue.severity === "moderate"
                  ? 30
                  : 15)

          const pendingItem: LocalPendingReport = {
            id: issue.id,
            title: issue.title || "Legacy Unsynced Report",
            notes: issue.notes || issue.title || "Discovered from local browser cache",
            category: issue.category || "cavity",
            severity: issue.severity || "moderate",
            depthEstimateMm: depth,
            coordinates: issue.coordinates || { lat: 19.076, lng: 72.8777 },
            address: issue.address || "Local coordinates",
            roadClass: issue.risk?.roadUsageDetails?.roadClass,
            originalPhotoUrl: issue.originalPhotoUrl,
            aiVerificationToken: issue.detection?.verificationToken ?? null,
            imageHash: issue.detection?.imageHash ?? null,
            createdAt: issue.createdAt || new Date().toISOString(),
            attempts: 0,
            syncStatus: "pending",
          }

          currentQueue.push(pendingItem)
          queuedIds.add(issue.id)
          newlyAdded = true
        }
      }

      if (newlyAdded) {
        this.savePendingQueue(currentQueue)
      }
    } catch (e) {
      console.warn("RoadGuard MigrationService: Error scanning legacy storage:", e)
    }

    return currentQueue
  }

  /**
   * Gets the total number of un-synced reports awaiting upload
   */
  static getPendingCount(): number {
    return this.detectAndQueueLegacyUnsynced().length
  }

  /**
   * Safely synchronizes all pending offline/legacy reports to the backend SQLite database.
   * Only deletes/removes items from local storage upon confirmed HTTP 201 Created responses.
   */
  static async syncPendingReports(options?: {
    forceDuplicate?: boolean
    onProgress?: (synced: number, total: number) => void
  }): Promise<SyncResult> {
    const queue = this.detectAndQueueLegacyUnsynced()
    const result: SyncResult = {
      total: queue.length,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
      syncedIssues: [],
    }

    if (queue.length === 0) {
      return result
    }

    const remainingQueue: LocalPendingReport[] = []

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      try {
        let syncPhotoUrl =
          item.originalPhotoUrl &&
          !item.originalPhotoUrl.startsWith("data:") &&
          item.originalPhotoUrl.length <= 1000
            ? item.originalPhotoUrl
            : undefined

        let syncToken = item.aiVerificationToken || undefined
        let syncHash = item.imageHash || undefined

        // If pending draft holds an inline data URL preview, upload it to cloud storage first
        if (item.originalPhotoUrl?.startsWith("data:image/")) {
          try {
            const blob = await (await fetch(item.originalPhotoUrl)).blob()
            const ext = blob.type.includes("png") ? "png" : "jpg"
            const uploadFile = new File([blob], `${item.id}.${ext}`, {
              type: blob.type || "image/jpeg",
            })
            const uploadRes = await apiClient.uploads.uploadImage(uploadFile)
            if (uploadRes?.url) {
              syncPhotoUrl = uploadRes.url
            }
            if (uploadRes?.imageHash && !syncHash) {
              syncHash = uploadRes.imageHash
            }
          } catch {
            // Fall through cleanly; server validation will report clear guidance if image required
          }
        }

        // Post defect to backend database via API client
        const createdIssue = await apiClient.issues.create({
          title: item.title,
          description: item.notes,
          damageCategory: item.category.toUpperCase(),
          damageSeverity: item.severity.toUpperCase(),
          depth: item.depthEstimateMm,
          latitude: item.coordinates.lat,
          longitude: item.coordinates.lng,
          address: item.address,
          roadClass: item.roadClass,
          photoUrl: syncPhotoUrl,
          aiVerificationToken: syncToken,
          imageHash: syncHash,
          forceDuplicate: options?.forceDuplicate ?? true,
        })

        // Success: Item is now safely recorded in SQLite
        result.syncedCount++
        result.syncedIssues.push(createdIssue)

        // Update legacy localStorage issue table if present
        this.replaceLocalIssueWithServerRecord(item.id, createdIssue)

        if (options?.onProgress) {
          options.onProgress(result.syncedCount, result.total)
        }
      } catch (err: any) {
        result.failedCount++
        let errorMsg = err?.message || "Network or validation error"
        const lower = errorMsg.toLowerCase()
        if (
          err?.status === 404 ||
          err?.statusCode === 404 ||
          err?.status === 405 ||
          err?.statusCode === 405 ||
          lower.includes("not be found") ||
          lower.includes("page could not") ||
          lower.includes("not found") ||
          lower.includes("failed to fetch") ||
          lower.includes("networkerror") ||
          lower.includes("invalid json")
        ) {
          errorMsg = "Backend server is offline or connecting. Report remains safely preserved in local device storage."
        }
        result.errors.push(`Report "${item.title}" (${item.id}): ${errorMsg}`)

        // Keep item in queue with updated failure metadata so user never loses their data!
        remainingQueue.push({
          ...item,
          attempts: item.attempts + 1,
          lastSyncError: errorMsg,
          syncStatus: "failed",
        })
      }
    }

    // Persist remaining items that could not be migrated
    this.savePendingQueue(remainingQueue)

    return result
  }

  /**
   * Replaces a legacy local storage item with the newly created backend issue
   */
  private static replaceLocalIssueWithServerRecord(
    localId: string,
    serverIssue: RoadIssue,
  ): void {
    if (typeof window === "undefined") return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const issues: RoadIssue[] = JSON.parse(stored)
      if (!Array.isArray(issues)) return

      const updated = issues.map((i) => (i.id === localId ? serverIssue : i))

      // If the local issue wasn't in the list, prepend it
      if (!updated.some((i) => i.id === serverIssue.id)) {
        updated.unshift(serverIssue)
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch (e) {
      console.warn("RoadGuard MigrationService: Failed to update legacy cache:", e)
    }
  }

  /**
   * Exports the entire pending queue as a formatted JSON backup string for disaster recovery
   */
  static exportBackupJson(): string {
    const queue = this.getPendingQueue()
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        pendingCount: queue.length,
        reports: queue,
      },
      null,
      2,
    )
  }

  /**
   * Clears the entire offline queue (caution: use only after confirmed export or reset)
   */
  static clearQueue(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(OFFLINE_QUEUE_KEY)
    } catch {}
  }

  /**
   * Manages banner dismissal status across browser sessions
   */
  static isBannerDismissed(): boolean {
    if (typeof window === "undefined") return false
    try {
      return (
        localStorage.getItem(MIGRATION_BANNER_DISMISSED_KEY) === "true" ||
        sessionStorage.getItem(MIGRATION_BANNER_DISMISSED_KEY) === "true"
      )
    } catch {
      return false
    }
  }

  static setBannerDismissed(dismissed: boolean): void {
    if (typeof window === "undefined") return
    try {
      if (dismissed) {
        localStorage.setItem(MIGRATION_BANNER_DISMISSED_KEY, "true")
        sessionStorage.setItem(MIGRATION_BANNER_DISMISSED_KEY, "true")
      } else {
        localStorage.removeItem(MIGRATION_BANNER_DISMISSED_KEY)
        sessionStorage.removeItem(MIGRATION_BANNER_DISMISSED_KEY)
      }
    } catch {}
  }
}

export default MigrationService

