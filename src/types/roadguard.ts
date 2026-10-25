export type DamageCategory = "cavity" | "crack" | "edge" | "depression" | "rutting"

export type SeverityLevel = "critical" | "high" | "moderate" | "low"

export type RoadClass = "arterial" | "collector" | "local" | "pedestrian_cycle"

export type IssueStatus = "reported" | "under_review" | "assigned" | "in_progress" | "awaiting_verification" | "verified_repaired" | "reopened" | "rejected"

export type UserRole = "citizen" | "authority" | "crew" | "inspector"

export interface DetectionBox {
  id: string
  x: number // 0-100 percentage
  y: number // 0-100 percentage
  width: number // 0-100 percentage
  height: number // 0-100 percentage
  category: DamageCategory
  confidence: number // 0-1
  label: string
}

export interface AIDetectionResult {
  engine: "edge_cv" | "external_api" | "demo_fallback"
  category: DamageCategory
  confidence: number // 0 to 1
  boxes: DetectionBox[]
  surfaceLossRatio: number // 0 to 1
  depthEstimateMm: number
  severity: SeverityLevel
  originalImageUrl: string
  annotatedImageUrl: string
  rawInferenceTimeMs: number
  isUserAdjusted?: boolean
  notes?: string
}

export interface RiskFactors {
  damageSeverity: number // 0 - 100
  roadUsage: number // 0 - 100
  sensitiveProximity: number // 0 - 100
  supportingReports: number // 0 - 100
  unresolvedDuration: number // 0 - 100
}

export interface RiskWeights {
  damageSeverity: number // default 0.35
  roadUsage: number // default 0.25
  sensitiveProximity: number // default 0.15
  supportingReports: number // default 0.15
  unresolvedDuration: number // default 0.10
}

export interface RiskAssessment {
  score: number // 0 - 100
  level: SeverityLevel
  factors: RiskFactors
  weights: RiskWeights
  weightedContributions: Record<keyof RiskFactors, number>
  explanation: string
  recommendedAction: string
  calculatedAt: string
  proximityDetails?: {
    nearestSensitiveType?: "hospital" | "school" | "transit" | "crossing" | "none"
    distanceMeters?: number
    isEstimated: boolean
  }
  roadUsageDetails?: {
    roadClass: RoadClass
    estimatedVehiclesPerHour?: number
    isEstimated: boolean
  }
}

export interface SupportingEvidence {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  photoUrl?: string
  timestamp: string
  notes?: string
  isConfirmed: boolean
}

export interface StatusHistoryItem {
  id: string
  fromStatus: IssueStatus | null
  toStatus: IssueStatus
  timestamp: string
  actorRole: UserRole
  actorName: string
  notes: string
  evidencePhotoUrl?: string
}

export interface RepairVerificationRecord {
  assignedCrew?: string
  assignedAt?: string
  workOrderNumber?: string
  repairCompletedAt?: string
  afterPhotoUrl?: string
  surfaceMatchConfidence?: number
  verificationDecision?: "approved" | "rejected" | "pending"
  verificationNotes?: string
  verifiedBy?: string
  verifiedAt?: string
  reopenReason?: string
}

export interface Coordinates {
  lat: number
  lng: number
}

export interface RoadIssue {
  id: string
  trackingCode: string
  title: string
  category: DamageCategory
  severity: SeverityLevel
  status: IssueStatus
  coordinates: Coordinates
  address: string
  roadName?: string
  city?: string
  originalPhotoUrl: string
  annotatedPhotoUrl?: string
  detection: AIDetectionResult
  risk: RiskAssessment
  supportingReports: SupportingEvidence[]
  supportingCount: number
  statusHistory: StatusHistoryItem[]
  repair: RepairVerificationRecord
  createdAt: string
  updatedAt: string
  reportedBy: string
  notes?: string
}

export interface DuplicateMatchResult {
  isDuplicate: boolean
  existingIssue?: RoadIssue
  distanceMeters: number
  categoryMatch: boolean
  confidenceScore: number // 0-1
  reason: string
}
