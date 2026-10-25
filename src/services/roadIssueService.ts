import {
  Coordinates,
  DamageCategory,
  IssueStatus,
  RoadIssue,
  SeverityLevel,
  UserRole,
} from "../types/roadguard"
import { calculateRiskAssessment } from "./riskEngine"
import { supportExistingIssue as supportIssueLogic } from "./duplicateService"
import { transitionIssueStatus } from "./repairWorkflowService"

const STORAGE_KEY = "roadguard_issues_v2"

// High-fidelity seed issues demonstrating all 4 features:
// Critical cavities, longitudinal cracks, repair workflows, and multi-report issues.
const SEED_ISSUES: RoadIssue[] = [
  {
    id: "RG-10492",
    trackingCode: "CAV-049",
    title: "Critical Pothole Cavity",
    category: "cavity",
    severity: "critical",
    status: "reported",
    coordinates: { lat: 51.5082, lng: -0.1245 },
    address: "Harbour Ave near Pier 4",
    roadName: "Harbour Ave",
    city: "London",
    originalPhotoUrl: "/images/detection_asphalt.jpg",
    annotatedPhotoUrl: "/images/detection_asphalt.jpg",
    detection: {
      engine: "edge_cv",
      category: "cavity",
      confidence: 0.98,
      boxes: [
        {
          id: "box-1",
          x: 28,
          y: 35,
          width: 44,
          height: 38,
          category: "cavity",
          confidence: 0.98,
          label: "ASPHALT CAVITY · 98%",
        },
      ],
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
        roadUsage: 23.0,
        sensitiveProximity: 12.0,
        supportingReports: 10.5,
        unresolvedDuration: 4.0,
      },
      explanation:
        "CRITICAL priority (Score: 89/100) driven by severe visible surface cavity (62mm depth) contributing 30.8 pts, heavy exposure on an arterial corridor, and proximity to harbour pedestrian crossing.",
      recommendedAction:
        "Immediate emergency dispatch: deploy rapid asphalt hot-mix crew within 24-48 hours.",
      calculatedAt: "2026-10-24T10:14:00Z",
      proximityDetails: {
        nearestSensitiveType: "crossing",
        distanceMeters: 45,
        isEstimated: false,
      },
      roadUsageDetails: {
        roadClass: "arterial",
        estimatedVehiclesPerHour: 420,
        isEstimated: false,
      },
    },
    supportingReports: [
      {
        id: "SUP-01",
        userId: "usr-cyclist-04",
        userName: "Elena Vance (Cyclist Alliance)",
        userRole: "citizen",
        timestamp: "2026-10-24T10:14:00Z",
        notes: "Deep rim-denting pothole right in the active bike lane.",
        isConfirmed: true,
      },
      {
        id: "SUP-02",
        userId: "usr-commuter-11",
        userName: "Marcus Sterling",
        userRole: "citizen",
        timestamp: "2026-10-24T14:22:00Z",
        notes:
          "Witnessed a delivery scooter swerve into oncoming lane to dodge this hole.",
        isConfirmed: true,
      },
      {
        id: "SUP-03",
        userId: "usr-driver-89",
        userName: "Priya Nair",
        userRole: "citizen",
        timestamp: "2026-10-25T08:30:00Z",
        notes: "Growing deeper after last night's rainfall.",
        isConfirmed: true,
      },
    ],
    supportingCount: 3,
    statusHistory: [
      {
        id: "HIST-01",
        fromStatus: null,
        toStatus: "reported",
        timestamp: "2026-10-24T10:14:00Z",
        actorRole: "citizen",
        actorName: "Elena Vance",
        notes: "Report logged with high-precision GPS telemetry.",
      },
    ],
    repair: {},
    createdAt: "2026-10-24T10:14:00Z",
    updatedAt: "2026-10-25T08:30:00Z",
    reportedBy: "Elena Vance",
    notes:
      "Located on lane 1 near bus stop, continuous water pooling during rain.",
  },
  {
    id: "RG-28190",
    trackingCode: "CRK-182",
    title: "Surface Web Cracking",
    category: "crack",
    severity: "high",
    status: "in_progress",
    coordinates: { lat: 51.5061, lng: -0.131 },
    address: "Mason Street, Junction 9",
    roadName: "Mason Street",
    city: "London",
    originalPhotoUrl: "/images/hero_road.jpg",
    annotatedPhotoUrl: "/images/hero_road.jpg",
    detection: {
      engine: "edge_cv",
      category: "crack",
      confidence: 0.91,
      boxes: [
        {
          id: "box-1",
          x: 20,
          y: 42,
          width: 58,
          height: 32,
          category: "crack",
          confidence: 0.91,
          label: "LONGITUDINAL CRACK · 91%",
        },
      ],
      surfaceLossRatio: 0.12,
      depthEstimateMm: 24,
      severity: "high",
      originalImageUrl: "/images/hero_road.jpg",
      annotatedImageUrl: "/images/hero_road.jpg",
      rawInferenceTimeMs: 16,
    },
    risk: {
      score: 68,
      level: "high",
      factors: {
        damageSeverity: 62,
        roadUsage: 75,
        sensitiveProximity: 60,
        supportingReports: 45,
        unresolvedDuration: 55,
      },
      weights: {
        damageSeverity: 0.35,
        roadUsage: 0.25,
        sensitiveProximity: 0.15,
        supportingReports: 0.15,
        unresolvedDuration: 0.1,
      },
      weightedContributions: {
        damageSeverity: 21.7,
        roadUsage: 18.8,
        sensitiveProximity: 9.0,
        supportingReports: 6.8,
        unresolvedDuration: 5.5,
      },
      explanation:
        "HIGH priority (Score: 68/100) driven by moderate structural wear contributing 21.7 pts, heavy exposure on a collector corridor, and 2 independent community confirmations.",
      recommendedAction:
        "High-priority work order: schedule crew repair within 72 hours and alert route navigation.",
      calculatedAt: "2026-10-23T08:15:00Z",
      proximityDetails: {
        nearestSensitiveType: "school",
        distanceMeters: 180,
        isEstimated: false,
      },
      roadUsageDetails: {
        roadClass: "collector",
        estimatedVehiclesPerHour: 180,
        isEstimated: false,
      },
    },
    supportingReports: [
      {
        id: "SUP-10",
        userId: "usr-commuter-22",
        userName: "David Kim",
        userRole: "citizen",
        timestamp: "2026-10-23T08:15:00Z",
        notes: "Asphalt is beginning to crumble around the crack edges.",
        isConfirmed: true,
      },
      {
        id: "SUP-11",
        userId: "usr-resident-09",
        userName: "Claire Dupont",
        userRole: "citizen",
        timestamp: "2026-10-24T12:00:00Z",
        notes: "School buses rattle over this crack daily.",
        isConfirmed: true,
      },
    ],
    supportingCount: 2,
    statusHistory: [
      {
        id: "HIST-10",
        fromStatus: null,
        toStatus: "reported",
        timestamp: "2026-10-23T08:15:00Z",
        actorRole: "citizen",
        actorName: "David Kim",
        notes: "Report logged.",
      },
      {
        id: "HIST-11",
        fromStatus: "reported",
        toStatus: "under_review",
        timestamp: "2026-10-23T11:30:00Z",
        actorRole: "authority",
        actorName: "District Operations Chief",
        notes: "AI severity validated. Structural water ingress confirmed.",
      },
      {
        id: "HIST-12",
        fromStatus: "under_review",
        toStatus: "assigned",
        timestamp: "2026-10-24T09:00:00Z",
        actorRole: "authority",
        actorName: "District Operations Chief",
        notes: "Assigned to Municipal Hot-Mix Asphalt Crew 4.",
      },
      {
        id: "HIST-13",
        fromStatus: "assigned",
        toStatus: "in_progress",
        timestamp: "2026-10-25T07:45:00Z",
        actorRole: "crew",
        actorName: "Crew Lead Sam Jackson",
        notes: "Traffic cones deployed. Crack mill & seal operation underway.",
      },
    ],
    repair: {
      assignedCrew: "Crew 4 · Central Road Division",
      assignedAt: "2026-10-24T09:00:00Z",
      workOrderNumber: "WO-88219",
    },
    createdAt: "2026-10-23T08:15:00Z",
    updatedAt: "2026-10-25T07:45:00Z",
    reportedBy: "David Kim",
    notes: "Cracking expanding across 1.4m of lane.",
  },
  {
    id: "RG-39104",
    trackingCode: "RES-091",
    title: "Edge Failure & Pavement Subsidence",
    category: "edge",
    severity: "low",
    status: "verified_repaired",
    coordinates: { lat: 51.512, lng: -0.119 },
    address: "North Loop near Kingsway",
    roadName: "North Loop",
    city: "London",
    originalPhotoUrl: "/images/detection_asphalt.jpg",
    annotatedPhotoUrl: "/images/detection_asphalt.jpg",
    detection: {
      engine: "edge_cv",
      category: "edge",
      confidence: 0.94,
      boxes: [
        {
          id: "box-1",
          x: 40,
          y: 45,
          width: 35,
          height: 30,
          category: "edge",
          confidence: 0.94,
          label: "EDGE COLLAPSE · 94%",
        },
      ],
      surfaceLossRatio: 0.08,
      depthEstimateMm: 18,
      severity: "low",
      originalImageUrl: "/images/detection_asphalt.jpg",
      annotatedImageUrl: "/images/detection_asphalt.jpg",
      rawInferenceTimeMs: 12,
    },
    risk: {
      score: 12,
      level: "low",
      factors: {
        damageSeverity: 10,
        roadUsage: 20,
        sensitiveProximity: 15,
        supportingReports: 20,
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
        damageSeverity: 3.5,
        roadUsage: 5.0,
        sensitiveProximity: 2.3,
        supportingReports: 3.0,
        unresolvedDuration: 0.0,
      },
      explanation:
        "LOW priority (Score: 12/100) — Repair verified and asphalt sealed. Road surface restored to optimal safety threshold.",
      recommendedAction: "Repair verified. Normal road operations resumed.",
      calculatedAt: "2026-10-24T16:45:00Z",
      proximityDetails: {
        nearestSensitiveType: "none",
        isEstimated: false,
      },
      roadUsageDetails: {
        roadClass: "local",
        estimatedVehiclesPerHour: 95,
        isEstimated: false,
      },
    },
    supportingReports: [
      {
        id: "SUP-20",
        userId: "usr-resident-44",
        userName: "Arthur Pendelton",
        userRole: "citizen",
        timestamp: "2026-10-21T09:10:00Z",
        notes: "Edge of curb was disintegrating.",
        isConfirmed: true,
      },
    ],
    supportingCount: 1,
    statusHistory: [
      {
        id: "HIST-20",
        fromStatus: null,
        toStatus: "reported",
        timestamp: "2026-10-21T09:10:00Z",
        actorRole: "citizen",
        actorName: "Arthur Pendelton",
        notes: "Report logged.",
      },
      {
        id: "HIST-21",
        fromStatus: "reported",
        toStatus: "under_review",
        timestamp: "2026-10-21T14:00:00Z",
        actorRole: "authority",
        actorName: "Inspector Reynolds",
        notes: "Verified.",
      },
      {
        id: "HIST-22",
        fromStatus: "under_review",
        toStatus: "assigned",
        timestamp: "2026-10-22T08:30:00Z",
        actorRole: "authority",
        actorName: "District Operations Chief",
        notes: "Assigned to Municipal Paving Crew 2.",
      },
      {
        id: "HIST-23",
        fromStatus: "assigned",
        toStatus: "in_progress",
        timestamp: "2026-10-23T10:00:00Z",
        actorRole: "crew",
        actorName: "Foreman Liam Davis",
        notes: "Sub-base recompacted, hot-mix asphalt laid.",
      },
      {
        id: "HIST-24",
        fromStatus: "in_progress",
        toStatus: "awaiting_verification",
        timestamp: "2026-10-24T14:30:00Z",
        actorRole: "crew",
        actorName: "Foreman Liam Davis",
        notes: "Resurfacing finished. After-repair photograph submitted.",
        evidencePhotoUrl: "/images/repaired_road.jpg",
      },
      {
        id: "HIST-25",
        fromStatus: "awaiting_verification",
        toStatus: "verified_repaired",
        timestamp: "2026-10-24T16:45:00Z",
        actorRole: "inspector",
        actorName: "Chief Engineer Sarah Chen",
        notes:
          "Before vs After vision check passed with 99.4% surface integrity match.",
        evidencePhotoUrl: "/images/repaired_road.jpg",
      },
    ],
    repair: {
      assignedCrew: "Municipal Paving Crew 2",
      assignedAt: "2026-10-22T08:30:00Z",
      workOrderNumber: "WO-77102",
      repairCompletedAt: "2026-10-24T14:30:00Z",
      afterPhotoUrl: "/images/repaired_road.jpg",
      surfaceMatchConfidence: 0.99,
      verificationDecision: "approved",
      verificationNotes:
        "Complete hot-mix resurfacing confirmed flush with gutter line.",
      verifiedBy: "Chief Engineer Sarah Chen (inspector)",
      verifiedAt: "2026-10-24T16:45:00Z",
    },
    createdAt: "2026-10-21T09:10:00Z",
    updatedAt: "2026-10-24T16:45:00Z",
    reportedBy: "Arthur Pendelton",
    notes: "Restored and sealed with zero surface irregularities remaining.",
  },
  {
    id: "RG-49201",
    trackingCode: "CAV-118",
    title: "High-Speed Lane Depression",
    category: "cavity",
    severity: "critical",
    status: "under_review",
    coordinates: { lat: 51.5034, lng: -0.1288 },
    address: "Willow Road Arterial Junction",
    roadName: "Willow Road",
    city: "London",
    originalPhotoUrl: "/images/detection_asphalt.jpg",
    annotatedPhotoUrl: "/images/detection_asphalt.jpg",
    detection: {
      engine: "edge_cv",
      category: "cavity",
      confidence: 0.96,
      boxes: [
        {
          id: "box-1",
          x: 35,
          y: 40,
          width: 42,
          height: 38,
          category: "cavity",
          confidence: 0.96,
          label: "DEEP VOID · 96%",
        },
      ],
      surfaceLossRatio: 0.22,
      depthEstimateMm: 74,
      severity: "critical",
      originalImageUrl: "/images/detection_asphalt.jpg",
      annotatedImageUrl: "/images/detection_asphalt.jpg",
      rawInferenceTimeMs: 15,
    },
    risk: {
      score: 93,
      level: "critical",
      factors: {
        damageSeverity: 95,
        roadUsage: 94,
        sensitiveProximity: 85,
        supportingReports: 88,
        unresolvedDuration: 65,
      },
      weights: {
        damageSeverity: 0.35,
        roadUsage: 0.25,
        sensitiveProximity: 0.15,
        supportingReports: 0.15,
        unresolvedDuration: 0.1,
      },
      weightedContributions: {
        damageSeverity: 33.3,
        roadUsage: 23.5,
        sensitiveProximity: 12.8,
        supportingReports: 13.2,
        unresolvedDuration: 6.5,
      },
      explanation:
        "CRITICAL priority (Score: 93/100) driven by severe visible surface cavity (74mm depth) contributing 33.3 pts, heavy exposure on an arterial corridor, 4 independent community confirmations, and hospital proximity (<120m).",
      recommendedAction:
        "Immediate emergency dispatch: deploy rapid asphalt hot-mix crew within 24-48 hours.",
      calculatedAt: "2026-10-25T06:30:00Z",
      proximityDetails: {
        nearestSensitiveType: "hospital",
        distanceMeters: 110,
        isEstimated: false,
      },
      roadUsageDetails: {
        roadClass: "arterial",
        estimatedVehiclesPerHour: 610,
        isEstimated: false,
      },
    },
    supportingReports: [
      {
        id: "SUP-30",
        userId: "usr-paramedic-01",
        userName: "St. Thomas Ambulance Dispatch",
        userRole: "citizen",
        timestamp: "2026-10-24T22:15:00Z",
        notes:
          "Emergency patient transport vehicles experiencing severe violent chassis shaking.",
        isConfirmed: true,
      },
      {
        id: "SUP-31",
        userId: "usr-transit-08",
        userName: "Bus Route 24 Driver",
        userRole: "citizen",
        timestamp: "2026-10-25T05:40:00Z",
        notes: "Severe tire impact when merging onto main lane.",
        isConfirmed: true,
      },
      {
        id: "SUP-32",
        userId: "usr-commuter-77",
        userName: "Vikram Malhotra",
        userRole: "citizen",
        timestamp: "2026-10-25T06:10:00Z",
        notes: "Blown tire on commuter sedan.",
        isConfirmed: true,
      },
      {
        id: "SUP-33",
        userId: "usr-cyclist-12",
        userName: "Zoe Martinez",
        userRole: "citizen",
        timestamp: "2026-10-25T06:30:00Z",
        notes: "Huge hole right after curve.",
        isConfirmed: true,
      },
    ],
    supportingCount: 4,
    statusHistory: [
      {
        id: "HIST-30",
        fromStatus: null,
        toStatus: "reported",
        timestamp: "2026-10-24T22:15:00Z",
        actorRole: "citizen",
        actorName: "St. Thomas Ambulance Dispatch",
        notes: "Emergency telemetry report logged.",
      },
      {
        id: "HIST-31",
        fromStatus: "reported",
        toStatus: "under_review",
        timestamp: "2026-10-25T06:45:00Z",
        actorRole: "authority",
        actorName: "Emergency Response Dispatcher",
        notes: "Escalated to priority 1 queue.",
      },
    ],
    repair: {},
    createdAt: "2026-10-24T22:15:00Z",
    updatedAt: "2026-10-25T06:45:00Z",
    reportedBy: "St. Thomas Ambulance Dispatch",
    notes: "High-speed lane hazard / 610 cars/hr.",
  },
]

export class RoadIssueService {
  private static issues: RoadIssue[] = []

  static initialize(): RoadIssue[] {
    if (typeof window === "undefined") {
      return SEED_ISSUES
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.issues = parsed
          return this.issues
        }
      }
    } catch {
      // In case of storage quota or JSON parse error
    }

    // Initialize with seed data
    this.issues = [...SEED_ISSUES]
    this.save()
    return this.issues
  }

  private static save() {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.issues))
    } catch (e) {
      console.warn("RoadGuard: Failed to write to localStorage:", e)
    }
  }

  static getAllIssues(): RoadIssue[] {
    if (this.issues.length === 0) {
      this.initialize()
    }
    return [...this.issues]
  }

  static getIssueById(id: string): RoadIssue | undefined {
    return this.getAllIssues().find(
      (issue) => issue.id === id || issue.trackingCode === id,
    )
  }

  static createIssue(
    newIssueData: Omit<RoadIssue, "id" | "trackingCode" | "createdAt" | "updatedAt" | "supportingReports" | "supportingCount" | "statusHistory" | "repair"> & {
      reporterName?: string
    },
  ): RoadIssue {
    const all = this.getAllIssues()
    const numId = Math.floor(10000 + Math.random() * 90000)
    const id = `RG-${numId}`
    const trackingCode = `CAV-${Math.floor(100 + Math.random() * 900)}`
    const now = new Date().toISOString()

    const newIssue: RoadIssue = {
      ...newIssueData,
      id,
      trackingCode,
      createdAt: now,
      updatedAt: now,
      supportingCount: 1,
      supportingReports: [
        {
          id: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
          userId: `usr-${numId}`,
          userName: newIssueData.reporterName || "Anonymous Citizen",
          userRole: "citizen",
          photoUrl: newIssueData.originalPhotoUrl,
          timestamp: now,
          notes:
            newIssueData.notes ||
            "Initial incident report filed with precision GPS.",
          isConfirmed: true,
        },
      ],
      statusHistory: [
        {
          id: `HIST-${Math.floor(1000 + Math.random() * 9000)}`,
          fromStatus: null,
          toStatus: newIssueData.status || "reported",
          timestamp: now,
          actorRole: "citizen",
          actorName: newIssueData.reporterName || "Citizen Reporter",
          notes: "Initial road hazard telemetry uploaded and confirmed.",
        },
      ],
      repair: {},
    }

    this.issues = [newIssue, ...all]
    this.save()
    return newIssue
  }

  static supportIssue(
    issueId: string,
    evidence: {
      userId?: string
      userName?: string
      userRole?: UserRole
      photoUrl?: string
      notes?: string
    },
  ): RoadIssue {
    const existing = this.getIssueById(issueId)
    if (!existing) {
      throw new Error(`Issue with ID ${issueId} not found.`)
    }

    const updated = supportIssueLogic(existing, evidence)
    this.issues = this.issues.map((i) => (i.id === existing.id ? updated : i))
    this.save()
    return updated
  }

  static updateStatus(
    issueId: string,
    targetStatus: IssueStatus,
    params: {
      actorRole: UserRole
      actorName: string
      notes: string
      afterPhotoUrl?: string
      assignedCrew?: string
      verificationDecision?: "approved" | "rejected" | "pending"
      reopenReason?: string
    },
  ): RoadIssue {
    const existing = this.getIssueById(issueId)
    if (!existing) {
      throw new Error(`Issue with ID ${issueId} not found.`)
    }

    const result = transitionIssueStatus(existing, targetStatus, params)
    if (!result.success || !result.issue) {
      throw new Error(result.error || "Failed to update issue status.")
    }

    this.issues = this.issues.map((i) =>
      i.id === existing.id ? result.issue! : i,
    )
    this.save()
    return result.issue
  }

  static resetToSeed(): RoadIssue[] {
    this.issues = [...SEED_ISSUES]
    this.save()
    return this.issues
  }

  static getCityStatistics() {
    const all = this.getAllIssues()
    const criticalCount = all.filter(
      (i) => i.severity === "critical" && i.status !== "verified_repaired",
    ).length
    const resolvedCount = all.filter(
      (i) => i.status === "verified_repaired",
    ).length
    const activeCount = all.filter(
      (i) => i.status !== "verified_repaired" && i.status !== "rejected",
    ).length
    const avgRisk =
      all.length > 0
        ? Math.round(
            all.reduce((acc, curr) => acc + curr.risk.score, 0) / all.length,
          )
        : 0

    return {
      totalReported: all.length,
      activeHazards: activeCount,
      criticalEmergencies: criticalCount,
      verifiedRepaired: resolvedCount,
      averageCityRiskScore: avgRisk,
      communityConfirmations: all.reduce(
        (acc, curr) => acc + curr.supportingCount,
        0,
      ),
    }
  }
}
