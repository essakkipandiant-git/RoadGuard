/**
 * RoadGuard AI — Centralized Frontend API Client
 * Connects React UI to the Express + SQLite backend via /api/v1
 */

import {
  AIDetectionResult,
  Coordinates,
  DamageCategory,
  IssueStatus,
  RepairVerificationRecord,
  RiskAssessment,
  RoadClass,
  RoadIssue,
  SeverityLevel,
  StatusHistoryItem,
  SupportingEvidence,
  UserRole,
} from "../types/roadguard"

function resolveApiBaseUrl(): string {
  const envUrl =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_BACKEND_URL)) ||
    ""

  if (!envUrl) {
    return "/api/v1"
  }

  let trimmed = envUrl.trim().replace(/\/+$/, "")
  if (trimmed && !trimmed.startsWith("/") && !/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`
  }
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`
}

const BASE_URL = resolveApiBaseUrl()

const BACKEND_ORIGIN = (() => {
  if (/^https?:\/\//i.test(BASE_URL)) {
    try {
      return new URL(BASE_URL).origin
    } catch {
      return ""
    }
  }
  return ""
})()

export function resolveBackendAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith("/uploads/") && BACKEND_ORIGIN) {
    return `${BACKEND_ORIGIN}${url}`
  }
  return url
}

export interface ApiUser {
  id: string
  email: string
  fullName: string
  role: "CITIZEN" | "INSPECTOR" | "DEPARTMENT_ADMIN" | "SUPER_ADMIN" | "FIELD_ADMIN"
  departmentId?: string | null
  phoneNumber?: string | null
  isActive?: boolean
}

export interface DashboardMetricsData {
  totalReported: number
  activeHazards: number
  criticalEmergencies: number
  repairsInProgress: number
  verifiedRepaired: number
  assigned: number
  underReview: number
  rejected: number
  averageRiskScore: number
  communityConfirmations: number
  wardBreakdown: Array<{
    wardId: string
    wardCode: string
    name: string
    count: number
    criticalCount: number
  }>
  departmentBreakdown: Array<{
    departmentId: string
    name: string
    count: number
  }>
  categoryBreakdown: Record<string, number>
  severityBreakdown: Record<string, number>
}

export interface MunicipalMetadata {
  departments: Array<{ id: string; name: string; description?: string; contactEmail?: string }>
  wards: Array<{ id: string; name: string; wardCode: string; city: string; departmentId?: string }>
  inspectors?: Array<{ id: string; fullName: string; email: string; role: string; departmentId?: string; phoneNumber?: string }>
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  pagination?: {
    page: number
    limit: number
    totalRecords: number
    totalPages: number
  }
  error?: {
    code: string
    message: string
    details?: any
  }
}

export class ApiError extends Error {
  code: string
  statusCode: number
  details?: any

  constructor(message: string, code: string = "INTERNAL_ERROR", statusCode: number = 500, details?: any) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

const AUTH_TOKEN_STORAGE_KEY = "roadguard_auth_token"

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredAuthToken(token: string | null) {
  if (typeof window === "undefined") return
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
  } catch {}
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${endpoint}`

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  }

  // Attach JWT Bearer token alongside HTTP-only session cookie so cross-origin
  // deployments (e.g. Render Static Site -> Render Web Service) work even when
  // browsers restrict third-party cookies.
  const token = getStoredAuthToken()
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`
  }

  // If body is not FormData, ensure Content-Type is application/json
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Include HTTP-only session cookies
  })

  let json: any
  try {
    json = await response.json()
  } catch {
    throw new ApiError(
      `Server returned invalid JSON response (status ${response.status})`,
      "INVALID_RESPONSE",
      response.status,
    )
  }

  if (!response.ok || !json.success) {
    const error = json.error || {}
    throw new ApiError(
      error.message || `Request failed with status ${response.status}`,
      error.code || "REQUEST_FAILED",
      response.status,
      error.details,
    )
  }

  return json
}

/**
 * Maps backend uppercase strings to frontend lowercase enums
 */
export function mapBackendCategory(cat?: string): DamageCategory {
  const c = cat?.toLowerCase()
  if (c === "cavity" || c === "pothole") {
    return "cavity"
  }
  if (c === "crack" || c === "cracking") {
    return "crack"
  }
  if (c === "edge" || c === "edge_subsidence" || c === "edge-subsidence") {
    return "edge"
  }
  if (c === "collapse") {
    return "collapse"
  }
  if (c === "waterlogging" || c === "ponding") {
    return "waterlogging"
  }
  if (c === "depression") {
    return "depression"
  }
  if (c === "rutting") {
    return "rutting"
  }
  if (c === "deterioration") {
    return "edge"
  }
  if (c === "other") {
    return "other"
  }
  return "cavity"
}

export function mapBackendSeverity(sev?: string): SeverityLevel {
  const s = sev?.toLowerCase()
  if (s === "critical" || s === "high" || s === "moderate" || s === "low") {
    return s
  }
  return "moderate"
}

export function mapBackendStatus(st?: string): IssueStatus {
  switch (st?.toUpperCase()) {
    case "REPORTED":
      return "reported"
    case "UNDER_REVIEW":
    case "VERIFIED":
      return "under_review"
    case "ASSIGNED":
      return "assigned"
    case "IN_PROGRESS":
      return "in_progress"
    case "AWAITING_VERIFICATION":
      return "awaiting_verification"
    case "REPAIR_COMPLETED":
      return "repair_completed"
    case "CLOSED":
    case "VERIFIED_REPAIRED":
      return "verified_repaired"
    case "REOPENED":
      return "reopened"
    case "REJECTED":
      return "rejected"
    default:
      return "reported"
  }
}

export function mapBackendRole(role?: string): UserRole {
  switch (role?.toUpperCase()) {
    case "SUPER_ADMIN":
    case "DEPARTMENT_ADMIN":
      return "authority"
    case "INSPECTOR":
      return "inspector"
    case "CITIZEN":
    default:
      return "citizen"
  }
}

/**
 * Transforms a raw backend RoadIssue object into a rich frontend RoadIssue model
 */
export function mapBackendIssueToRoadIssue(raw: any): RoadIssue {
  const category = mapBackendCategory(raw.damageCategory)
  const severity = mapBackendSeverity(raw.damageSeverity)
  const status = mapBackendStatus(raw.status)
  const depthMm = typeof raw.depth === "number" ? raw.depth : category === "cavity" ? 60 : 25

  // Primary original & annotated photo resolution
  const resolveImgUrl = (img: any): string | undefined =>
    resolveBackendAssetUrl(img?.imageUrl || img?.url)

  const originalImg =
    resolveImgUrl(raw.images?.find((img: any) => img.imageType === "ORIGINAL_REPORT" || img.type === "ORIGINAL" || img.imageType === "EVIDENCE")) ||
    resolveImgUrl(raw.images?.[0]) ||
    "/images/detection_asphalt.jpg"

  const annotatedImg =
    resolveImgUrl(raw.images?.find((img: any) => img.imageType === "AI_ANNOTATED" || img.type === "ANNOTATED")) ||
    originalImg

  const repairAfterImg =
    resolveImgUrl(raw.images?.find((img: any) => img.imageType === "REPAIR_AFTER" || img.type === "AFTER"))

  // Construct explainable risk assessment
  const riskScore = typeof raw.riskScore === "number" ? raw.riskScore : 50
  const riskLevel: SeverityLevel =
    riskScore >= 80 ? "critical" : riskScore >= 65 ? "high" : riskScore >= 40 ? "moderate" : "low"

  let parsedFactors: any = null
  if (typeof raw.riskFactors === "string") {
    try {
      parsedFactors = JSON.parse(raw.riskFactors)
    } catch {}
  } else if (raw.riskFactors && typeof raw.riskFactors === "object") {
    parsedFactors = raw.riskFactors
  }

  const riskFactors = {
    damageSeverity: parsedFactors?.damageSeverity ?? (riskScore >= 70 ? 85 : 45),
    roadUsage: parsedFactors?.roadUsage ?? (riskScore >= 70 ? 75 : 50),
    sensitiveProximity: parsedFactors?.sensitiveProximity ?? (riskScore >= 80 ? 80 : 40),
    supportingReports: parsedFactors?.supportingReports ?? (raw.confirmationsCount ? 40 : 20),
    unresolvedDuration: parsedFactors?.unresolvedDuration ?? 20,
  }

  const riskAssessment: RiskAssessment = {
    score: riskScore,
    level: riskLevel,
    factors: riskFactors,
    weights: {
      damageSeverity: 0.35,
      roadUsage: 0.25,
      sensitiveProximity: 0.15,
      supportingReports: 0.15,
      unresolvedDuration: 0.1,
    },
    weightedContributions: {
      damageSeverity: Math.round(riskFactors.damageSeverity * 0.35 * 10) / 10,
      roadUsage: Math.round(riskFactors.roadUsage * 0.25 * 10) / 10,
      sensitiveProximity: Math.round(riskFactors.sensitiveProximity * 0.15 * 10) / 10,
      supportingReports: Math.round(riskFactors.supportingReports * 0.15 * 10) / 10,
      unresolvedDuration: Math.round(riskFactors.unresolvedDuration * 0.1 * 10) / 10,
    },
    explanation:
      raw.description ||
      `${riskLevel.toUpperCase()} priority (Score: ${riskScore}/100) identified on ${raw.address || "municipal road"}.`,
    recommendedAction:
      riskScore >= 80
        ? "Immediate emergency dispatch: deploy rapid asphalt hot-mix crew within 24-48 hours."
        : riskScore >= 60
          ? "Standard repair queue: schedule repair crew within 5-7 business days."
          : "Routine municipal maintenance monitoring.",
    calculatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    roadUsageDetails: {
      roadClass: "arterial" as RoadClass,
      estimatedVehiclesPerHour: 350,
      isEstimated: true,
    },
    proximityDetails: {
      nearestSensitiveType: "crossing",
      distanceMeters: 85,
      isEstimated: true,
    },
  }

  // AI Detection object
  const detection: AIDetectionResult = {
    engine: "edge_cv",
    category,
    confidence: 0.95,
    boxes: [
      {
        id: `box-${raw.id || "1"}`,
        x: 25,
        y: 30,
        width: 50,
        height: 40,
        category,
        confidence: 0.95,
        label: `${category.toUpperCase()} · 95%`,
      },
    ],
    surfaceLossRatio: category === "cavity" ? 0.18 : 0.08,
    depthEstimateMm: depthMm,
    severity,
    originalImageUrl: originalImg,
    annotatedImageUrl: annotatedImg,
    rawInferenceTimeMs: 16,
  }

  // Supporting confirmations
  const supportingReports: SupportingEvidence[] = (raw.confirmations || []).map((c: any, index: number) => ({
    id: c.id || `SUP-${index + 1}`,
    userId: c.userId || `usr-${index + 1}`,
    userName: c.user?.fullName || "Verified Citizen",
    userRole: mapBackendRole(c.user?.role),
    timestamp: c.createdAt || new Date().toISOString(),
    notes: c.notes || "Confirmed identical road hazard at this location.",
    isConfirmed: true,
  }))

  // Status history
  const statusHistory: StatusHistoryItem[] = (raw.statusHistory || []).map((h: any, index: number) => ({
    id: h.id || `HIST-${index + 1}`,
    fromStatus: h.fromStatus ? mapBackendStatus(h.fromStatus) : null,
    toStatus: mapBackendStatus(h.toStatus),
    timestamp: h.createdAt || new Date().toISOString(),
    actorRole: mapBackendRole(h.changedBy?.role || h.actor?.role),
    actorName: h.changedBy?.fullName || h.actor?.fullName || "System Dispatcher",
    notes: h.remarks || "Status transition recorded.",
  }))

  // Work order / repair record
  const latestWorkOrder = raw.workOrders?.[0]
  const repair: RepairVerificationRecord = {
    assignedCrew: latestWorkOrder?.assignedCrew || (status === "assigned" || status === "in_progress" ? "MCGM Ward K/E Rapid Asphalt Crew 2" : undefined),
    assignedAt: latestWorkOrder?.scheduledDate || raw.updatedAt,
    workOrderNumber: latestWorkOrder?.orderNumber || (raw.reportNumber ? `WO-${raw.reportNumber.replace("RG-", "")}` : undefined),
    repairCompletedAt: status === "verified_repaired" ? raw.updatedAt : undefined,
    afterPhotoUrl: repairAfterImg,
    verificationDecision: status === "verified_repaired" ? "approved" : "pending",
    verifiedAt: status === "verified_repaired" ? raw.updatedAt : undefined,
  }

  return {
    id: raw.id,
    trackingCode: raw.reportNumber || raw.id?.slice(0, 8) || "RG-10000",
    title: raw.title || `${category.toUpperCase()} Hazard`,
    category,
    severity,
    status,
    coordinates: {
      lat: Number(raw.latitude) || 19.076,
      lng: Number(raw.longitude) || 72.8777,
    },
    address: raw.address || "Western Express Highway, Mumbai, India",
    roadName: raw.address?.split(",")?.[0] || "Western Express Highway",
    city: raw.ward?.city || "Mumbai",
    originalPhotoUrl: originalImg,
    annotatedPhotoUrl: annotatedImg,
    detection,
    risk: riskAssessment,
    supportingReports,
    supportingCount: raw.confirmationsCount || raw._count?.confirmations || (supportingReports.length > 0 ? supportingReports.length : 1),
    statusHistory,
    repair,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    reportedBy: raw.reportedBy?.fullName || "Citizen Reporter",
    notes: raw.description,
    wardId: raw.wardId,
    departmentId: raw.departmentId,
    wardName: raw.ward?.name,
    departmentName: raw.department?.name,
    governmentReferenceId: raw.governmentReferenceId,
    governmentPortalUrl: raw.governmentPortalUrl,
    officialDepartmentName: raw.officialDepartmentName,
    officialContactInfo: raw.officialContactInfo,
    externalStatus: raw.externalStatus,
    assignedInspectorId: raw.assignedInspectorId || raw.assignedInspector?.id,
    assignedInspectorName: raw.assignedInspector?.fullName,
    reportedById: raw.reportedById || raw.reportedBy?.id,
  }
}

const SEEDED_FALLBACK_USERS: ApiUser[] = [
  {
    id: "f4f42518-782a-4317-aec0-baf28f33d4e0",
    email: "admin@roadguard.local",
    fullName: "System Administrator",
    role: "SUPER_ADMIN",
    isActive: true,
  },
  {
    id: "2a50cec1-ddc5-4317-96a7-d88583bbe402",
    email: "highways.chief@roadguard.local",
    fullName: "Chief Marcus Brody",
    role: "DEPARTMENT_ADMIN",
    departmentId: "40947e83-f3ca-47b9-bdef-0cfd8175555b",
    isActive: true,
  },
  {
    id: "8db7a0b9-e00b-4071-8ffd-ad4001434f0f",
    email: "inspector.sarah@roadguard.local",
    fullName: "Inspector Sarah Jenkins",
    role: "INSPECTOR",
    isActive: true,
  },
  {
    id: "6ddc6bbc-5b3c-4128-9a48-8381012ceeee",
    email: "citizen.test@roadguard.local",
    fullName: "Elena Vance (Citizen Alliance)",
    role: "CITIZEN",
    phoneNumber: "+91 98200 12345",
    isActive: true,
  },
]

export function getLocalStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("roadguard_current_user")
    if (raw) return JSON.parse(raw)
    const persona = localStorage.getItem("roadguard_active_persona")
    if (persona) {
      const found = SEEDED_FALLBACK_USERS.find((u) => u.role === persona)
      if (found) return found
    }
  } catch {}
  return null
}

export function setLocalStoredUser(user: ApiUser | null) {
  if (typeof window === "undefined") return
  try {
    if (user) {
      localStorage.setItem("roadguard_current_user", JSON.stringify(user))
      localStorage.setItem("roadguard_active_persona", user.role)
    } else {
      localStorage.removeItem("roadguard_current_user")
      localStorage.removeItem("roadguard_active_persona")
    }
  } catch {}
}

export function getRegisteredLocalUsers(): ApiUser[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem("roadguard_registered_users")
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRegisteredLocalUser(user: ApiUser) {
  if (typeof window === "undefined") return
  try {
    const existing = getRegisteredLocalUsers().filter((u) => u.email.toLowerCase() !== user.email.toLowerCase())
    existing.push(user)
    localStorage.setItem("roadguard_registered_users", JSON.stringify(existing))
  } catch {}
}

/**
 * Complete RoadGuard Frontend API Client
 */
export const apiClient = {
  // Authentication & Session
  auth: {
    async register(data: { fullName: string; email: string; password: string; phoneNumber?: string }) {
      try {
        const res = await request<{ user: ApiUser; token?: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify(data),
        })
        if (res.data.token) {
          setStoredAuthToken(res.data.token)
        }
        setLocalStoredUser(res.data.user)
        return res.data.user
      } catch (err: any) {
        if (err instanceof ApiError && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 404) {
          throw err
        }
        // Robust offline fallback when API is unreachable
        const mockUser: ApiUser = {
          id: `citizen-${Date.now()}`,
          email: data.email,
          fullName: data.fullName,
          role: "CITIZEN",
          phoneNumber: data.phoneNumber || undefined,
          isActive: true,
        }
        saveRegisteredLocalUser(mockUser)
        setLocalStoredUser(mockUser)
        return mockUser
      }
    },

    async login(credentials: { email: string; password: string }) {
      try {
        const res = await request<{ user: ApiUser; token?: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials),
        })
        if (res.data.token) {
          setStoredAuthToken(res.data.token)
        }
        setLocalStoredUser(res.data.user)
        return res.data.user
      } catch (err: any) {
        if (err instanceof ApiError && err.statusCode === 401) {
          throw err
        }
        // Match seeded municipal accounts or registered citizen accounts when backend unreachable
        const normEmail = credentials.email.trim().toLowerCase()
        const found =
          SEEDED_FALLBACK_USERS.find((u) => u.email.toLowerCase() === normEmail) ||
          getRegisteredLocalUsers().find((u) => u.email.toLowerCase() === normEmail)

        if (found) {
          setLocalStoredUser(found)
          return found
        }

        // Generic citizen sign in with any valid email
        if (normEmail.includes("@")) {
          const cleanName = normEmail
            .split("@")[0]
            .replace(/[._]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
          const citizenUser: ApiUser = {
            id: `usr-${Date.now()}`,
            email: credentials.email,
            fullName: cleanName || "Citizen User",
            role: "CITIZEN",
            isActive: true,
          }
          saveRegisteredLocalUser(citizenUser)
          setLocalStoredUser(citizenUser)
          return citizenUser
        }

        throw new ApiError("Invalid credentials. Please provide a valid email.", "AUTH_FAILED", 401)
      }
    },

    async logout() {
      try {
        await request("/auth/logout", {
          method: "POST",
        })
      } catch {
        // Ignore static host 404
      } finally {
        setStoredAuthToken(null)
        setLocalStoredUser(null)
      }
    },

    async getMe() {
      try {
        const res = await request<{ user: ApiUser }>("/auth/me", {
          method: "GET",
        })
        if (res.data?.user) {
          setLocalStoredUser(res.data.user)
          return res.data.user
        }
      } catch (err: any) {
        if (err instanceof ApiError && err.statusCode === 401) {
          setStoredAuthToken(null)
        }
        // Fallback to local stored session when API unreachable
      }
      return getLocalStoredUser()
    },
  },

  // Road Issues
  issues: {
    async list(params: {
      status?: string
      severity?: string
      category?: string
      wardId?: string
      departmentId?: string
      search?: string
      page?: number
      limit?: number
    } = {}) {
      const query = new URLSearchParams()
      if (params.status && params.status !== "all") query.set("status", params.status.toUpperCase())
      if (params.severity && params.severity !== "all") query.set("severity", params.severity.toUpperCase())
      if (params.category && params.category !== "all") query.set("category", params.category.toUpperCase())
      if (params.wardId && params.wardId !== "all") query.set("wardId", params.wardId)
      if (params.departmentId && params.departmentId !== "all") query.set("departmentId", params.departmentId)
      if (params.search) query.set("search", params.search)
      if (params.page) query.set("page", String(params.page))
      if (params.limit) query.set("limit", String(params.limit))

      const queryString = query.toString() ? `?${query.toString()}` : ""
      const res = await request<{ issues: any[] }>(`/issues${queryString}`, {
        method: "GET",
      })
      return {
        issues: (res.data.issues || []).map(mapBackendIssueToRoadIssue),
        pagination: res.pagination,
      }
    },

    async getById(id: string) {
      const res = await request<{ issue: any }>(`/issues/${encodeURIComponent(id)}`, {
        method: "GET",
      })
      return mapBackendIssueToRoadIssue(res.data.issue)
    },

    async getMyReports() {
      const res = await request<{ issues: any[] }>("/issues/my-reports", {
        method: "GET",
      })
      return (res.data.issues || []).map(mapBackendIssueToRoadIssue)
    },

    async create(data: {
      title: string
      description?: string
      damageCategory: string
      damageSeverity: string
      depth?: number | null
      latitude: number
      longitude: number
      address: string
      roadClass?: string
      forceDuplicate?: boolean
      photoUrl?: string | null
      aiVerificationToken?: string | null
      imageHash?: string | null
    }) {
      const res = await request<{ issue: any }>("/issues", {
        method: "POST",
        body: JSON.stringify(data),
      })
      return mapBackendIssueToRoadIssue(res.data.issue)
    },

    async support(id: string, notes?: string) {
      const res = await request<{ issue: any }>(`/issues/${encodeURIComponent(id)}/support`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      })
      return mapBackendIssueToRoadIssue(res.data.issue)
    },

    async updateStatus(id: string, data: { targetStatus: string; remarks?: string; evidencePhotoUrl?: string }) {
      const res = await request<{ issue: any }>(`/issues/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      })
      return mapBackendIssueToRoadIssue(res.data.issue)
    },

    async checkDuplicate(params: {
      latitude: number
      longitude: number
      damageCategory?: string
      thresholdMeters?: number
    }) {
      const res = await request<{
        isDuplicate: boolean
        matchedIssue?: any
        distanceMeters?: number
        confidencePercentage?: number
        reason?: string
      }>("/issues/check-duplicate", {
        method: "POST",
        body: JSON.stringify(params),
      })
      return res.data
    },

    async calculateRisk(params: {
      damageCategory?: string
      depth?: number
      roadClass?: string
      trafficVolume?: string
      proximityType?: string
      proximityMeters?: number
      supportingReportsCount?: number
      daysUnresolved?: number
    }) {
      const res = await request<{
        score: number
        level: string
        factors: any
        breakdown: any
        rationale: string
        action: string
      }>("/issues/calculate-risk", {
        method: "POST",
        body: JSON.stringify(params),
      })
      return res.data
    },

    async getTimeline(idOrReportNumber: string) {
      const res = await request<{
        issue: any
        timeline: any[]
        totalEvents: number
      }>(`/issues/${encodeURIComponent(idOrReportNumber)}/timeline`, {
        method: "GET",
      })
      return {
        issue: mapBackendIssueToRoadIssue(res.data.issue),
        timeline: res.data.timeline,
        totalEvents: res.data.totalEvents,
      }
    },

    async updateOfficialInfo(
      id: string,
      data: {
        governmentReferenceId?: string | null
        governmentPortalUrl?: string | null
        officialDepartmentName?: string | null
        officialContactInfo?: string | null
        externalStatus?: string | null
      },
    ) {
      const res = await request<{ issue: any }>(
        `/issues/${encodeURIComponent(id)}/official-info`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      )
      return mapBackendIssueToRoadIssue(res.data.issue)
    },

    async executeAction(
      id: string,
      data: {
        actionType: string
        targetStatus?: string | null
        assignedInspectorId?: string | null
        departmentId?: string | null
        workDescription?: string | null
        priority?: "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW"
        scheduledDate?: string | null
        reason?: string | null
        remarks?: string | null
        evidencePhotos?: string[]
      },
    ) {
      const res = await request<{ issue: any; approvalRecord: any }>(
        `/issues/${encodeURIComponent(id)}/actions`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      )
      return {
        issue: mapBackendIssueToRoadIssue(res.data.issue),
        approvalRecord: res.data.approvalRecord,
      }
    },

    async createCommunityUpdate(
      issueId: string,
      data: {
        updateType:
          | "STILL_EXISTS"
          | "WORSENED"
          | "REPAIR_IN_PROGRESS"
          | "APPEARS_REPAIRED"
          | "HAZARD_CLEARED"
          | string
        description: string
        photos?: string[]
        latitude?: number
        longitude?: number
      },
    ) {
      const res = await request<{ update: any; issue: any }>(
        `/issues/${encodeURIComponent(issueId)}/community-updates`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      )
      return {
        update: res.data.update,
        issue: mapBackendIssueToRoadIssue(res.data.issue),
      }
    },

    async getCommunityUpdates(issueId: string) {
      const res = await request<{ updates: any[] }>(
        `/issues/${encodeURIComponent(issueId)}/community-updates`,
        {
          method: "GET",
        },
      )
      return res.data.updates || []
    },

    async reviewCommunityUpdate(
      issueId: string,
      updateId: string,
      data: {
        decision: "APPROVED" | "REJECTED" | "FLAGGED"
        adminRemarks: string
      },
    ) {
      const res = await request<{ update: any; issue: any }>(
        `/issues/${encodeURIComponent(issueId)}/community-updates/${encodeURIComponent(updateId)}/review`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      )
      return {
        update: res.data.update,
        issue: mapBackendIssueToRoadIssue(res.data.issue),
      }
    },
  },

  // File Uploads
  uploads: {
    async uploadImage(file: File, category: string = "pothole-reports") {
      const formData = new FormData()
      formData.append("photo", file)
      formData.append("category", category)

      const res = await request<{
        imageUrl?: string
        url?: string
        publicId?: string
        fileName?: string
        size?: number
        bytes?: number
        format: string
        storageProvider?: string
        folder?: string
        imageHash?: string
      }>("/uploads/image", {
        method: "POST",
        body: formData,
      })
      const finalUrl = resolveBackendAssetUrl(res.data.imageUrl || res.data.url || "") || ""
      return {
        ...res.data,
        url: finalUrl,
        imageUrl: finalUrl,
      }
    },

    async getStatus() {
      const res = await request<{
        isConfigured: boolean
        cloudName: string
        storageProvider: string
        message: string
      }>("/uploads/status", {
        method: "GET",
      })
      return res.data
    },

    async attachIssueImage(issueId: string, file: File, imageType: string = "ORIGINAL_REPORT") {
      const formData = new FormData()
      formData.append("photo", file)
      formData.append("imageType", imageType)

      const res = await request<{ image: any }>(`/issues/${encodeURIComponent(issueId)}/images`, {
        method: "POST",
        body: formData,
      })
      const img = res.data.image
      if (img && img.imageUrl) {
        return { ...img, imageUrl: resolveBackendAssetUrl(img.imageUrl) }
      }
      return img
    },
  },

  // Analytics & Dashboard Metrics
  analytics: {
    async getDashboard(filters: {
      departmentId?: string
      wardId?: string
      startDate?: string
      endDate?: string
    } = {}): Promise<DashboardMetricsData> {
      const query = new URLSearchParams()
      if (filters.departmentId && filters.departmentId !== "all") query.set("departmentId", filters.departmentId)
      if (filters.wardId && filters.wardId !== "all") query.set("wardId", filters.wardId)
      if (filters.startDate) query.set("startDate", filters.startDate)
      if (filters.endDate) query.set("endDate", filters.endDate)

      const qs = query.toString() ? `?${query.toString()}` : ""
      const res = await request<DashboardMetricsData>(`/analytics/dashboard${qs}`, {
        method: "GET",
      })
      return res.data
    },

    async getMetadata(): Promise<MunicipalMetadata> {
      const res = await request<MunicipalMetadata>("/analytics/metadata", {
        method: "GET",
      })
      return res.data
    },
  },

  // Health
  health: {
    async check() {
      const res = await request<{ status: string; uptimeSeconds: number }>("/../health", {
        method: "GET",
      })
      return res.data
    },
  },

  // Real Computer Vision Defect Inference
  ai: {
    async inspectImage(fileOrDataUrl: File | Blob | string): Promise<{
      status:
        | "detected"
        | "low_confidence"
        | "no_damage_found"
        | "unrelated_image"
        | "blurry_image"
        | "underexposed"
        | "ai_unavailable"
      modelName: string
      modelVersion: string
      detectedClasses: string[]
      detections: Array<{
        id: string
        category: DamageCategory
        confidence: number
        x: number
        y: number
        width: number
        height: number
        label: string
      }>
      highestConfidence: number
      severity: SeverityLevel
      depthEstimateMm: null
      depthNote: string
      annotatedImageBase64?: string
      topPredictedClass?: string
      unrelatedClass?: string
      inferenceDurationMs: number
      message: string
      imageHash?: string
      verificationToken?: string
      isSubmissionAllowed?: boolean
      minimumConfidenceRequired?: number
    }> {
      let body: any
      let isForm = false

      if (typeof fileOrDataUrl === "string") {
        if (fileOrDataUrl.startsWith("data:")) {
          body = JSON.stringify({ image: fileOrDataUrl })
        } else {
          // Fetch asset/blob URL (e.g. "/images/detection_asphalt.jpg") and send real image bytes
          const fetched = await fetch(fileOrDataUrl)
          if (!fetched.ok) {
            throw new ApiError(
              `Unable to load photograph asset (${fetched.status})`,
              "IMAGE_FETCH_FAILED",
              fetched.status,
            )
          }
          const blob = await fetched.blob()
          const fileName = fileOrDataUrl.split("/").pop()?.split("?")[0] || "road_image.jpg"
          const fileObj = new File([blob], fileName, { type: blob.type || "image/jpeg" })
          const formData = new FormData()
          formData.append("photo", fileObj)
          body = formData
          isForm = true
        }
      } else {
        const formData = new FormData()
        formData.append("photo", fileOrDataUrl)
        body = formData
        isForm = true
      }

      const res = await request<any>("/ai/inspect", {
        method: "POST",
        body,
        headers: isForm ? undefined : { "Content-Type": "application/json" },
      })
      return res.data
    },

    async getStatus() {
      const res = await request<{ model: string; validator: string; status: string }>("/ai/status", {
        method: "GET",
      })
      return res.data
    },
  },
}

