import React, { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Compass,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Globe,
  HardHat,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  User,
  UserCheck,
  Waves,
  Wrench,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  DamageCategory,
  IssueStatus,
  RoadIssue,
  SeverityLevel,
  UserRole,
} from "../types/roadguard"
import { RoadIssueService, getMySubmittedReportIds } from "../services/roadIssueService"
import {
  apiClient,
  ApiUser,
  DashboardMetricsData,
  MunicipalMetadata,
} from "../services/apiClient"
import { MUNICIPAL_PERSONAS } from "../constants/personas"
import Interactive2DMap from "./Interactive2DMap"

export type DashboardPersona =
  | "SUPER_ADMIN"
  | "DEPARTMENT_ADMIN"
  | "INSPECTOR"
  | "CITIZEN"

export type DashboardViewTab =
  | "overview"
  | "issues"
  | "risk_map"
  | "resolution"
  | "analytics"
  | "admin"

interface CityTriageDashboardProps {
  isOpen: boolean
  onClose: () => void
  issues: RoadIssue[]
  currentUserRole: UserRole
  onRoleChange: (role: UserRole) => void
  onSelectIssue: (issue: RoadIssue) => void
  onOpenGlobeForIssue: (issue: RoadIssue) => void
  onOpenReportModal: () => void
  onRefreshData: () => void
  currentUser?: ApiUser | null
  onOpenAuth?: () => void
  onSwitchPersona?: (roleOrEmail: string) => void
  onOpenAdminSuite?: () => void
}

export default function CityTriageDashboard({
  isOpen,
  onClose,
  issues,
  currentUserRole,
  onRoleChange,
  onSelectIssue,
  onOpenGlobeForIssue,
  onOpenReportModal,
  onRefreshData,
  currentUser,
  onOpenAuth,
  onSwitchPersona,
  onOpenAdminSuite,
}: CityTriageDashboardProps) {
  // 6 Structured Views: Overview, Reported Issues, Risk Map, Resolution Tracking, Analytics, Administration
  const [activeView, setActiveView] = useState<DashboardViewTab>("issues")

  // Determine active persona with strict precedence
  const activePersona: DashboardPersona = useMemo(() => {
    if (currentUser?.role === "SUPER_ADMIN") return "SUPER_ADMIN"
    if (currentUser?.role === "DEPARTMENT_ADMIN") return "DEPARTMENT_ADMIN"
    if (currentUser?.role === "INSPECTOR" || currentUser?.role === "FIELD_ADMIN") return "INSPECTOR"
    if (currentUser?.role === "CITIZEN") return "CITIZEN"
    if (currentUserRole === "authority") return "SUPER_ADMIN"
    if (currentUserRole === "crew") return "DEPARTMENT_ADMIN"
    if (currentUserRole === "inspector") return "INSPECTOR"
    return "CITIZEN"
  }, [currentUser?.role, currentUserRole])

  // Default tab based on persona
  const defaultTab = useMemo(() => {
    switch (activePersona) {
      case "INSPECTOR":
        return "my_assigned"
      case "DEPARTMENT_ADMIN":
        return "dept_queue"
      case "CITIZEN":
        return "community"
      default:
        return "all_city"
    }
  }, [activePersona])

  const [perspectiveTab, setPerspectiveTab] = useState<string>(defaultTab)

  // Sync tab whenever activePersona changes
  useEffect(() => {
    setPerspectiveTab(defaultTab)
  }, [defaultTab])

  // Progressive Disclosure: Track which cards are expanded for extra details
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null)

  // Map view selected issue
  const [mapSelectedIssue, setMapSelectedIssue] = useState<RoadIssue | null>(null)
  const [resolutionFilter, setResolutionFilter] = useState<"in_progress" | "verified_repaired">("in_progress")

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedWard, setSelectedWard] = useState<string>("all")
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")

  // Live Server Metrics
  const [liveStats, setLiveStats] = useState<DashboardMetricsData | null>(null)
  const [metadata, setMetadata] = useState<MunicipalMetadata | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // Fetch live metrics
  useEffect(() => {
    let isCancelled = false

    async function fetchDashboardData() {
      if (!isOpen) return
      setIsRefreshing(true)
      try {
        const [dashData, metaData] = await Promise.all([
          apiClient.analytics.getDashboard({
            wardId: selectedWard !== "all" ? selectedWard : undefined,
            departmentId: selectedDepartment !== "all" ? selectedDepartment : undefined,
          }),
          apiClient.analytics.getMetadata(),
        ])
        if (!isCancelled) {
          setLiveStats(dashData)
          setMetadata(metaData)
        }
      } catch (err) {
        console.warn("RoadGuard: Using local stats calculation:", err)
      } finally {
        if (!isCancelled) {
          setIsRefreshing(false)
        }
      }
    }

    fetchDashboardData()
    return () => {
      isCancelled = true
    }
  }, [isOpen, selectedWard, selectedDepartment])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Helpers to test persona ownership/assignment
  const isAssignedToInspector = (issue: RoadIssue) => {
    if (activePersona !== "INSPECTOR" && !currentUser) return false
    const uId = currentUser?.id
    const uName = (currentUser?.fullName || "").toLowerCase()
    const uEmail = (currentUser?.email || "").toLowerCase()

    if (uId && issue.assignedInspectorId === uId) return true
    if (issue.assignedInspectorName) {
      const assigned = issue.assignedInspectorName.toLowerCase()
      if (uName && assigned.includes(uName)) return true
      if (uEmail.includes("sarah") && (assigned.includes("sarah") || assigned.includes("chen") || assigned.includes("jenkins"))) {
        return true
      }
    }
    return false
  }

  const isReportedByCitizen = (issue: RoadIssue) => {
    // 1. Check device persistent submission tracking (tracks reports submitted on this device)
    const myDeviceIds = getMySubmittedReportIds()
    if (myDeviceIds.includes(issue.id) || (issue.trackingCode && myDeviceIds.includes(issue.trackingCode))) {
      return true
    }
    // 2. Check authenticated user profile match
    if (currentUser) {
      if (currentUser.id && issue.reportedById === currentUser.id) return true
      if (currentUser.fullName && issue.reportedBy && issue.reportedBy.toLowerCase().includes(currentUser.fullName.toLowerCase())) return true
      if (currentUser.email.includes("citizen") && (issue.reportedBy?.toLowerCase().includes("elena") || issue.reportedBy?.toLowerCase().includes("citizen"))) return true
    }
    return false
  }

  const isDepartmentIssue = (issue: RoadIssue) => {
    if (currentUser?.departmentId && issue.departmentId === currentUser.departmentId) return true
    if (issue.departmentName?.toLowerCase().includes("highways") || issue.departmentName?.toLowerCase().includes("infrastructure")) return true
    return false
  }

  // True if defect is repaired, completed, or closed
  const isIssueResolved = (issue: RoadIssue) =>
    issue.status === "verified_repaired" ||
    issue.status === "closed" ||
    issue.status === "repair_completed"

  // Pre-calculate counts for perspective tabs
  const myAssignedIssues = issues.filter(isAssignedToInspector)
  const myAssignedCount = myAssignedIssues.filter((i) => !isIssueResolved(i)).length
  const myPendingInspectionCount = myAssignedIssues.filter(
    (i) => !isIssueResolved(i) && (i.status === "reported" || i.status === "under_review")
  ).length
  const myActiveRepairCount = myAssignedIssues.filter(
    (i) => !isIssueResolved(i) && (i.status === "in_progress" || i.status === "assigned")
  ).length
  const myResolvedCount = myAssignedIssues.filter(isIssueResolved).length

  const myReportedIssues = issues.filter(isReportedByCitizen)
  const myReportsCount = myReportedIssues.length

  const deptIssues = issues.filter(isDepartmentIssue)
  const deptActiveCount = deptIssues.filter((i) => !isIssueResolved(i)).length
  const deptPendingDispatchCount = deptIssues.filter(
    (i) => !isIssueResolved(i) && (i.status === "under_review" || i.status === "assigned")
  ).length
  const deptResolvedCount = deptIssues.filter(isIssueResolved).length

  const activeHazardsCount = issues.filter((i) => !isIssueResolved(i) && i.status !== "rejected").length
  const criticalActiveCount = issues.filter(
    (i) => !isIssueResolved(i) && (i.risk.score >= 80 || i.severity === "critical")
  ).length
  const unassignedActiveCount = issues.filter(
    (i) => !isIssueResolved(i) && !i.assignedInspectorName && !i.assignedInspectorId
  ).length
  const inProgressCount = issues.filter(
    (i) => i.status === "in_progress" || i.status === "assigned"
  ).length
  const totalResolvedCount = issues.filter(isIssueResolved).length

  // Emergency Triage Alerts: top critical issues needing immediate dispatch
  const emergencyAlerts = issues
    .filter((i) => !isIssueResolved(i) && (i.risk.score >= 80 || i.severity === "critical"))
    .slice(0, 4)

  // Filter issues based on active persona tab + standard dropdown filters
  const filteredIssues = issues.filter((issue) => {
    // 1. Perspective tab filter
    if (activePersona === "INSPECTOR") {
      if (perspectiveTab === "my_assigned") {
        if (!isAssignedToInspector(issue) || isIssueResolved(issue)) return false
      } else if (perspectiveTab === "needs_inspection") {
        if (!isAssignedToInspector(issue) || isIssueResolved(issue)) return false
        if (issue.status !== "reported" && issue.status !== "under_review") return false
      } else if (perspectiveTab === "active_repairs") {
        if (!isAssignedToInspector(issue) || isIssueResolved(issue)) return false
        if (issue.status !== "in_progress" && issue.status !== "assigned") return false
      } else if (perspectiveTab === "repaired" || perspectiveTab === "verified") {
        if (!isAssignedToInspector(issue) || !isIssueResolved(issue)) return false
      }
    } else if (activePersona === "CITIZEN") {
      if (perspectiveTab === "community") {
        if (isIssueResolved(issue) || issue.status === "rejected") return false
      } else if (perspectiveTab === "my_reports") {
        if (!isReportedByCitizen(issue)) return false
      } else if (perspectiveTab === "repaired" || perspectiveTab === "verified") {
        if (!isIssueResolved(issue)) return false
      }
    } else if (activePersona === "DEPARTMENT_ADMIN") {
      if (perspectiveTab === "dept_queue") {
        if (!isDepartmentIssue(issue) || isIssueResolved(issue)) return false
      } else if (perspectiveTab === "pending_dispatch") {
        if (!isDepartmentIssue(issue) || isIssueResolved(issue) || (issue.status !== "under_review" && issue.status !== "assigned")) return false
      } else if (perspectiveTab === "repaired" || perspectiveTab === "verified") {
        if (!isDepartmentIssue(issue) || !isIssueResolved(issue)) return false
      }
    } else if (activePersona === "SUPER_ADMIN") {
      if (perspectiveTab === "all_city") {
        if (isIssueResolved(issue) || issue.status === "rejected") return false
      } else if (perspectiveTab === "critical") {
        if (isIssueResolved(issue) || (issue.risk.score < 80 && issue.severity !== "critical")) return false
      } else if (perspectiveTab === "unassigned") {
        if (isIssueResolved(issue) || issue.assignedInspectorName || issue.assignedInspectorId) return false
      } else if (perspectiveTab === "in_progress") {
        if (issue.status !== "in_progress" && issue.status !== "assigned") return false
      } else if (perspectiveTab === "repaired" || perspectiveTab === "verified") {
        if (!isIssueResolved(issue)) return false
      }
    }

    // 2. Dropdown filters
    if (selectedStatus !== "all" && issue.status !== selectedStatus) return false
    if (selectedSeverity !== "all" && issue.severity !== selectedSeverity) return false
    if (selectedCategory !== "all" && issue.category !== selectedCategory) return false
    if (
      selectedWard !== "all" &&
      issue.wardId !== selectedWard &&
      issue.wardName !== selectedWard &&
      issue.city !== selectedWard
    )
      return false
    if (
      selectedDepartment !== "all" &&
      issue.departmentId !== selectedDepartment
    )
      return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchText =
        `${issue.title} ${issue.address} ${issue.trackingCode} ${issue.category} ${issue.notes || ""} ${issue.assignedInspectorName || ""}`.toLowerCase()
      if (!matchText.includes(q)) return false
    }
    return true
  })

  // Manual refresh that synchronizes local + server data
  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      const [dashData] = await Promise.all([
        apiClient.analytics.getDashboard({
          wardId: selectedWard !== "all" ? selectedWard : undefined,
          departmentId: selectedDepartment !== "all" ? selectedDepartment : undefined,
        }),
        onRefreshData(),
      ])
      if (dashData) setLiveStats(dashData)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Field Inspector Quick Action
  const handleQuickInspectorAction = async (
    e: React.MouseEvent,
    issue: RoadIssue,
    targetStatus: string,
    remarks: string,
    evidencePhotoUrl?: string
  ) => {
    e.stopPropagation()
    setActionLoadingId(issue.id)
    try {
      const payload: any = {
        actionType: "UPDATE_STATUS",
        targetStatus,
        remarks,
      }
      if (evidencePhotoUrl) {
        payload.actionType = "SUBMIT_REPAIR_EVIDENCE"
        payload.evidencePhotos = [evidencePhotoUrl]
      }
      try {
        await apiClient.issues.executeAction(issue.id, payload)
      } catch {
        const frontendStatusMap: Record<string, IssueStatus> = {
          REPORTED: "reported",
          UNDER_REVIEW: "under_review",
          WORK_ORDER_DISPATCHED: "assigned",
          REPAIR_IN_PROGRESS: "in_progress",
          REPAIR_COMPLETED: "verified_repaired",
          CLOSED: "closed",
          REOPENED: "reopened",
          REJECTED: "rejected",
        }
        const mappedStatus = frontendStatusMap[targetStatus] || "reported"
        RoadIssueService.updateStatus(issue.id, mappedStatus, {
          notes: remarks,
          actorName: currentUser?.fullName || "System Administrator",
          actorRole: (currentUser?.role || "SUPER_ADMIN").toLowerCase() as any,
          afterPhotoUrl: evidencePhotoUrl,
        })
      }
      setActionSuccessMsg(`Status updated to ${targetStatus.replace("_", " ")} on #${issue.trackingCode}`)
      setTimeout(() => setActionSuccessMsg(null), 3500)
      await handleManualRefresh()
    } catch (err: any) {
      alert(err.message || "Failed to update defect status.")
    } finally {
      setActionLoadingId(null)
    }
  }

  // Citizen Quick Support (+1 Confirmation)
  const handleCitizenSupport = async (e: React.MouseEvent, issue: RoadIssue) => {
    e.stopPropagation()
    setActionLoadingId(issue.id)
    try {
      try {
        await apiClient.issues.support(issue.id, "Citizen confirmed road defect location on community feed.")
      } catch {
        RoadIssueService.supportIssue(issue.id, {
          userName: currentUser?.fullName || "Citizen Reporter",
          userRole: "citizen",
          notes: "Citizen confirmed road defect location on community feed.",
        })
      }
      setActionSuccessMsg(`Confirmed defect #${issue.trackingCode} (+1)`)
      setTimeout(() => setActionSuccessMsg(null), 3500)
      await handleManualRefresh()
    } catch (err: any) {
      alert(err.message || "Failed to submit community confirmation.")
    } finally {
      setActionLoadingId(null)
    }
  }

  // Fallback stats
  const stats = liveStats
    ? {
        totalReported: liveStats.totalReported,
        activeHazards: liveStats.activeHazards,
        criticalEmergencies: liveStats.criticalEmergencies,
        averageCityRiskScore: liveStats.averageRiskScore,
        verifiedRepaired: liveStats.verifiedRepaired,
        communityConfirmations: liveStats.communityConfirmations,
      }
    : RoadIssueService.getCityStatistics()

  // Resolution tracking items
  const inProgressIssues = issues.filter(
    (i) => i.status === "in_progress" || i.status === "assigned" || i.status === "repair_completed"
  )
  const resolvedIssues = issues.filter(isIssueResolved)

  // Analytics counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      cavity: 0,
      crack: 0,
      edge: 0,
      waterlogging: 0,
      collapse: 0,
      other: 0,
    }
    issues.forEach((i) => {
      if (counts[i.category] !== undefined) counts[i.category]++
      else counts.other++
    })
    return counts
  }, [issues])

  const riskBands = useMemo(() => {
    let critical = 0
    let high = 0
    let moderate = 0
    let low = 0
    issues.forEach((i) => {
      if (i.risk.score >= 80) critical++
      else if (i.risk.score >= 60) high++
      else if (i.risk.score >= 40) moderate++
      else low++
    })
    return { critical, high, moderate, low }
  }, [issues])

  if (!isOpen) return null

  return (
    <div className="triage-modal-overlay">
      <div className="triage-modal-backdrop" onClick={onClose} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="triage-dashboard-title"
        className="triage-modal-container"
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      >
        {/* Top Header with Role-Specific Branding */}
        {/* Top Header with Role-Specific Branding */}
        <div className="px-3.5 sm:px-7 py-3 sm:py-4 bg-[#FFFFFF] border-b border-[#E5E3DC] flex flex-col gap-2.5 sm:gap-3 shrink-0">
          {/* Row 1: Eyebrow, Heading, and Primary Window Controls (Refresh & Close) */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="eyebrow mb-1">
                <span />
                {activePersona === "SUPER_ADMIN" && "SUPER ADMIN EXECUTIVE COMMAND · GREATER MUMBAI (MCGM)"}
                {activePersona === "DEPARTMENT_ADMIN" && "DEPARTMENTAL OPERATIONS · HIGHWAYS & INFRASTRUCTURE"}
                {activePersona === "INSPECTOR" && "FIELD INSPECTION & TACTICAL CREW OPERATIONS"}
                {activePersona === "CITIZEN" && "CITIZEN COMMUNITY ROADGUARD TRANSPARENCY"}
              </span>
              <h2 id="triage-dashboard-title" className="text-sm sm:text-xl font-bold text-[#181916] tracking-tight leading-snug">
                {activePersona === "SUPER_ADMIN" && "CITY ROAD RISK & TRIAGE OPERATIONS"}
                {activePersona === "DEPARTMENT_ADMIN" && "DEPARTMENT WORK ORDER & CREW DISPATCH"}
                {activePersona === "INSPECTOR" && "FIELD INSPECTOR ON-SITE ASSESSMENT QUEUE"}
                {activePersona === "CITIZEN" && "COMMUNITY ROAD DEFECTS & VERIFIED REPAIRS"}
              </h2>
            </div>

            {/* Top-Right Window Controls: Refresh & Close always accessible */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleManualRefresh}
                className={`triage-icon-btn ${isRefreshing ? "animate-spin" : ""}`}
                title="Refresh live database metrics"
                aria-label="Refresh dashboard"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="triage-close-btn"
                aria-label="Close dashboard"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Row 2: Role Switcher & Persona Controls (Stacked below on mobile, inline on desktop) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#242522]/5">
            <div className="flex flex-wrap items-center gap-2">
              {onOpenAdminSuite && (
                <button
                  type="button"
                  onClick={onOpenAdminSuite}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#242522] hover:bg-[#383A35] text-white text-[11px] sm:text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-xs cursor-pointer min-h-[34px]"
                  title="Open Municipal Admin Command Suite for authorized officers"
                >
                  <ShieldAlert size={13} className="text-[#E65336]" />
                  <span className="hidden sm:inline">Admin Command Suite →</span>
                  <span className="sm:hidden">Admin Suite →</span>
                </button>
              )}

              {/* Role Switcher Pill */}
              {onOpenAuth ? (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="triage-role-pill min-h-[34px]"
                  title="Click to switch municipal persona or view profile"
                >
                  <User size={13} className="text-vermilion" />
                  <label className="hidden sm:inline">PERSONA:</label>
                  <strong>
                    {currentUser ? currentUser.fullName.split(" ")[0] : currentUserRole.toUpperCase()}
                  </strong>
                  <span className="switch-tag">
                    {currentUser ? (currentUser.role === "SUPER_ADMIN" ? "ADMIN" : currentUser.role.replace("_", " ")) : currentUserRole.toUpperCase()}
                  </span>
                </button>
              ) : (
                <div className="triage-role-pill min-h-[34px]">
                  <User size={13} className="text-vermilion" />
                  <label>ROLE:</label>
                  <select
                    value={currentUserRole}
                    onChange={(e) => onRoleChange(e.target.value as UserRole)}
                    className="role-dropdown-clean"
                  >
                    <option value="citizen">Citizen Observer</option>
                    <option value="authority">District Authority</option>
                    <option value="crew">Maintenance Crew</option>
                    <option value="inspector">Verification Officer</option>
                  </select>
                </div>
              )}
            </div>

            {/* Quick 1-Click Persona Segmented Switcher for TCS Reviewers (desktop only) */}
            <div className="hidden lg:flex items-center gap-1 bg-[#F4F3EF] p-1 rounded-xl border border-[#DFDDD6]">
              {MUNICIPAL_PERSONAS.map((p) => {
                const isActive = activePersona === p.role
                return (
                  <button
                    key={p.role}
                    type="button"
                    onClick={() => {
                      if (onSwitchPersona) {
                        onSwitchPersona(p.role)
                      } else {
                        onRoleChange(
                          p.role === "SUPER_ADMIN"
                            ? "authority"
                            : p.role === "INSPECTOR"
                              ? "inspector"
                              : "citizen",
                        )
                      }
                    }}
                    className={`persona-switch-btn px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                        : "text-[#5C5B55] hover:text-[#141413] hover:bg-[#FFFFFF]"
                    }`}
                    title={`Switch view to ${p.name} (${p.label})`}
                  >
                    <span>
                      {p.role === "SUPER_ADMIN"
                        ? "🛡️ Super Admin"
                        : p.role === "DEPARTMENT_ADMIN"
                          ? "🏗️ Dept Admin"
                          : p.role === "INSPECTOR"
                            ? "👷 Field Inspector"
                            : "👤 Citizen"}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Persona Context Banner Ribbon */}
        <div className="px-3.5 sm:px-7 py-2.5 bg-[#FAF9F7] border-b border-[#E5E3DC] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono shrink-0">
          <div className="flex items-start sm:items-center gap-2.5 text-[#5C5B55] min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#EAE8E1] border border-[#D8D5CD] text-[#141413] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              {activePersona === "SUPER_ADMIN" && <ShieldCheck size={14} />}
              {activePersona === "DEPARTMENT_ADMIN" && <Building2 size={14} />}
              {activePersona === "INSPECTOR" && <HardHat size={14} />}
              {activePersona === "CITIZEN" && <User size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <strong className="text-[#141413] font-sans font-bold text-xs">
                  {currentUser?.fullName || (activePersona === "CITIZEN" ? "Citizen Alliance (Elena Vance)" : "Municipal Officer")}
                </strong>
                <span className="px-1.5 py-0.5 rounded bg-[#141413] text-[#FFFFFF] text-[9.5px] font-mono font-bold uppercase tracking-wide">
                  {activePersona === "CITIZEN" ? "Citizen Alliance" : activePersona.replace("_", " ")}
                </span>
              </div>
              <p className="text-[11px] text-[#687567] leading-relaxed break-words">
                {activePersona === "CITIZEN" && "GPS road hazard reporting, photographic evidence submission & public repair tracking across Greater Mumbai."}
                {activePersona === "SUPER_ADMIN" && "Tier 4 Global Authority · Full ward allocation, inspector assignments, work order dispatch & audit oversight."}
                {activePersona === "DEPARTMENT_ADMIN" && "Highways & Infrastructure Division · Contractor dispatch, asphalt crew scheduling & SLA compliance triage."}
                {activePersona === "INSPECTOR" && "Senior Inspector Sarah Jenkins · On-site asphalt assessment, structural cavity verification & resurfacing quality sign-off."}
              </p>
            </div>
          </div>

          {actionSuccessMsg && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="self-start sm:self-auto px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-sans text-xs font-bold border border-emerald-300 shrink-0"
            >
              ✓ {actionSuccessMsg}
            </motion.div>
          )}
        </div>

        {/* 6 STRUCTURED TOP VIEWS NAVIGATION BAR */}
        <div className="px-3.5 sm:px-7 py-2.5 bg-[#FFFFFF] border-b border-[#E5E3DC] flex items-center justify-between gap-3 overflow-x-auto overflow-y-hidden scrollbar-none shrink-0">
          <nav aria-label="Dashboard primary views" className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView("overview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                activeView === "overview"
                  ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                  : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
              }`}
            >
              <BarChart3 size={13} />
              <span>1. Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("issues")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                activeView === "issues"
                  ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                  : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
              }`}
            >
              <FileText size={13} />
              <span>2. Reported Issues</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeView === "issues"
                    ? "bg-white/20 text-white"
                    : "bg-[#E2DFD7] text-[#141413]"
                }`}
              >
                {activeHazardsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("risk_map")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                activeView === "risk_map"
                  ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                  : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
              }`}
            >
              <MapPin size={13} />
              <span>3. Risk Map</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("resolution")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                activeView === "resolution"
                  ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                  : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
              }`}
            >
              <Clock size={13} />
              <span>4. Resolution Tracking</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeView === "resolution"
                    ? "bg-white/20 text-white"
                    : "bg-[#E2DFD7] text-[#141413]"
                }`}
              >
                {totalResolvedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("analytics")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                activeView === "analytics"
                  ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                  : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
              }`}
            >
              <TrendingUp size={13} />
              <span>5. Analytics</span>
            </button>

            {activePersona !== "CITIZEN" && (
              <button
                type="button"
                onClick={() => setActiveView("admin")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap h-[34px] cursor-pointer ${
                  activeView === "admin"
                    ? "bg-[#141413] text-[#FFFFFF] shadow-xs"
                    : "bg-[#F4F3EF] text-[#141413] hover:bg-[#EAE8E1] border border-[#DFDDD6]"
                }`}
              >
                <ShieldAlert size={13} />
                <span>6. Administration</span>
              </button>
            )}
          </nav>

          <button
            type="button"
            onClick={onOpenReportModal}
            className="px-3.5 py-1.5 rounded-lg bg-[#141413] hover:bg-[#2C2C29] text-white text-xs font-mono font-bold transition-all flex items-center gap-2 shrink-0 whitespace-nowrap shadow-xs cursor-pointer h-[34px]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E65336]" />
            <span>+ Report Hazard</span>
          </button>
        </div>

        {/* =========================================================================
            VIEW 1: OVERVIEW (EXECUTIVE KPIS, EMERGENCY TRIAGE ALERTS, WARD SUMMARY)
           ========================================================================= */}
        {activeView === "overview" && (
          <div className="p-3.5 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto max-h-[75vh]">
            {/* Executive KPIs */}
            <div>
              <span className="eyebrow mb-2">
                <span /> EXECUTIVE MUNICIPAL METRICS
              </span>
              <div className="triage-metrics-grid">
                <div className="triage-metric-card">
                  <small>Active Road Defects</small>
                  <div className="metric-num-row">
                    <strong>{stats.activeHazards}</strong>
                    <span className="metric-tag">Monitored</span>
                  </div>
                </div>
                <div className="triage-metric-card highlight-vermilion">
                  <small>Critical Emergencies</small>
                  <div className="metric-num-row">
                    <strong className="text-vermilion">{stats.criticalEmergencies}</strong>
                    <span className="metric-tag urgent">Immediate Dispatch</span>
                  </div>
                </div>
                <div className="triage-metric-card">
                  <small>Average City Risk</small>
                  <div className="metric-num-row">
                    <strong>{stats.averageCityRiskScore}</strong>
                    <span className="metric-tag">Score / 100</span>
                  </div>
                </div>
                <div className="triage-metric-card">
                  <small>Verified Repaired</small>
                  <div className="metric-num-row">
                    <strong className="text-emerald-600">{stats.verifiedRepaired}</strong>
                    <span className="metric-tag metric-tag-verified">Resolved</span>
                  </div>
                </div>
                <div className="triage-metric-card">
                  <small>Community Confirmations</small>
                  <div className="metric-num-row">
                    <strong>{stats.communityConfirmations}</strong>
                    <span className="metric-tag">Citizen Reports</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Triage Alerts Section */}
            <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-l-4 border-l-[#C8321E] shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#141413] text-white flex items-center justify-center">
                    <AlertTriangle size={14} className="text-[#E65336]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#141413]">
                      EMERGENCY TRIAGE ALERTS (CRITICAL SEVERITY & RISK SCORE &gt;= 80)
                    </h3>
                    <p className="text-xs text-[#6B6A64]">
                      Immediate high-impact hazards requiring inspector dispatch or hot-mix crew repair.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView("issues")
                    setPerspectiveTab("critical")
                  }}
                  className="text-xs font-mono font-bold text-[#141413] hover:underline flex items-center gap-1"
                >
                  <span>View All Critical ({criticalActiveCount})</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {emergencyAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    onClick={() => onSelectIssue(alert)}
                    className="p-3.5 rounded-xl bg-[#FAF9F7] border border-[#DFDDD6] border-l-[3px] border-l-[#C8321E] hover:border-[#141413] transition-all cursor-pointer shadow-xs flex items-start gap-3 group"
                  >
                    <img
                      src={alert.annotatedPhotoUrl || alert.originalPhotoUrl}
                      alt={alert.title}
                      className="w-16 h-16 rounded-lg object-cover border border-[#242522]/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          #{alert.trackingCode}
                        </span>
                        <span className="font-mono text-xs font-bold text-rose-600">
                          RISK {alert.risk.score}/100
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-[#242522] truncate group-hover:text-rose-600">
                        {alert.title}
                      </h4>
                      <p className="text-[11px] text-[#687567] truncate mb-2">
                        {alert.address}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#8B9185]">
                          {alert.assignedInspectorName ? `👷 ${alert.assignedInspectorName}` : "⚠️ UNASSIGNED"}
                        </span>
                        <span className="text-rose-600 font-bold flex items-center gap-0.5">
                          Triage Now <ArrowDownRight size={11} />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ward Summary Deck */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-2">
                <span className="text-xs font-mono font-bold text-[#8B9185] block uppercase">
                  Wards with Highest Activity
                </span>
                <div className="space-y-2">
                  {[
                    { ward: "Ward H/W (Bandra West)", count: 14, risk: 88 },
                    { ward: "Ward A (Colaba & Fort)", count: 11, risk: 84 },
                    { ward: "Ward K/E (Andheri East)", count: 9, risk: 81 },
                    { ward: "Ward G/N (Dadar West)", count: 7, risk: 76 },
                  ].map((w) => (
                    <div key={w.ward} className="flex items-center justify-between text-xs py-1 border-b border-[#242522]/5">
                      <span className="text-[#242522] font-semibold">{w.ward}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[#687567] font-mono">{w.count} defects</span>
                        <span className="px-1.5 py-0.5 rounded bg-orange-100 text-[#E65336] font-mono font-bold text-[10px]">
                          Risk {w.risk}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-2">
                <span className="text-xs font-mono font-bold text-[#8B9185] block uppercase">
                  SLA Response Readiness
                </span>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span>Critical (4-Hour Target)</span>
                      <strong className="text-emerald-700">96.2% On Time</strong>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full" style={{ width: "96%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span>High (24-Hour Target)</span>
                      <strong className="text-emerald-700">92.8% On Time</strong>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full" style={{ width: "93%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span>Medium (72-Hour Target)</span>
                      <strong className="text-emerald-700">94.5% On Time</strong>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-600 rounded-full" style={{ width: "94%" }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-3">
                <span className="text-xs font-mono font-bold text-[#8B9185] block uppercase">
                  Quick Navigation
                </span>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveView("issues")}
                    className="p-2.5 rounded-lg bg-[#ECE6D8] hover:bg-[#D8D2C5] text-left text-xs font-mono font-bold text-[#242522] flex items-center justify-between"
                  >
                    <span>View All Active Defects</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("risk_map")}
                    className="p-2.5 rounded-lg bg-[#ECE6D8] hover:bg-[#D8D2C5] text-left text-xs font-mono font-bold text-[#242522] flex items-center justify-between"
                  >
                    <span>Interactive 2D Risk Map</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("resolution")}
                    className="p-2.5 rounded-lg bg-[#ECE6D8] hover:bg-[#D8D2C5] text-left text-xs font-mono font-bold text-[#242522] flex items-center justify-between"
                  >
                    <span>Resolution & SLA Tracking</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 2: REPORTED ISSUES (SEARCH, MULTI-FILTER, PROGRESSIVE DISCLOSURE)
           ========================================================================= */}
        {activeView === "issues" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Persona Perspective Tabs Bar */}
            <div className="px-3.5 sm:px-7 py-2.5 bg-[#F4F3EF] border-b border-[#E5E3DC] flex items-center justify-between gap-2 overflow-x-auto overflow-y-hidden scrollbar-none shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                {activePersona === "INSPECTOR" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("my_assigned")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "my_assigned"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <HardHat size={13} />
                      <span>My Assigned Tasks</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                        {myAssignedCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("needs_inspection")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "needs_inspection"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Clock size={13} />
                      <span>Pending Inspection ({myPendingInspectionCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("active_repairs")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "active_repairs"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Wrench size={13} />
                      <span>Active Repairs ({myActiveRepairCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("repaired")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "repaired"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      <span>Completed Sign-Offs ({myResolvedCount})</span>
                    </button>
                  </>
                )}

                {activePersona === "CITIZEN" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("community")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "community"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Globe size={13} />
                      <span>Community Hazards Feed</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                        {activeHazardsCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("my_reports")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "my_reports"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <User size={13} />
                      <span>My Submitted Reports ({myReportsCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("repaired")}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap min-h-[36px] cursor-pointer ${
                        perspectiveTab === "repaired"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>Verified Safe Roads ({totalResolvedCount})</span>
                    </button>
                  </>
                )}

                {activePersona === "DEPARTMENT_ADMIN" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("dept_queue")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "dept_queue"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Building2 size={13} />
                      <span>Active Dept Queue ({deptActiveCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("pending_dispatch")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "pending_dispatch"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Clock size={13} />
                      <span>Pending Crew Dispatch ({deptPendingDispatchCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("repaired")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "repaired"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      <span>Completed & Resolved ({deptResolvedCount})</span>
                    </button>
                  </>
                )}

                {activePersona === "SUPER_ADMIN" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("all_city")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "all_city"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Layers size={13} />
                      <span>Active City Hazards ({activeHazardsCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("critical")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "critical"
                          ? "bg-[#9E1C1C] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <AlertTriangle size={13} />
                      <span>Critical Emergencies ({criticalActiveCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("unassigned")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "unassigned"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <UserCheck size={13} />
                      <span>Unassigned Queue ({unassignedActiveCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("in_progress")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "in_progress"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <Wrench size={13} />
                      <span>In Progress ({inProgressCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPerspectiveTab("repaired")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        perspectiveTab === "repaired"
                          ? "bg-[#141413] text-white shadow-xs"
                          : "bg-[#FFFFFF] text-[#141413] border border-[#D8D5CD] hover:bg-[#EAE8E1]"
                      }`}
                    >
                      <CheckCircle2 size={13} />
                      <span>Completed & Resolved ({totalResolvedCount})</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Controls Panel */}
            <div className="triage-controls-panel">
              <div className="triage-search-actions-row">
                <div className="triage-search-input-wrap">
                  <Search size={16} className="triage-search-icon" />
                  <input
                    type="text"
                    placeholder="Search defect ID (#RG-...), street or keyword..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="triage-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="search-clear-btn"
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="triage-action-buttons-group">
                  {(selectedStatus !== "all" ||
                    selectedSeverity !== "all" ||
                    selectedCategory !== "all" ||
                    selectedWard !== "all" ||
                    selectedDepartment !== "all" ||
                    searchQuery.trim() !== "") && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStatus("all")
                        setSelectedSeverity("all")
                        setSelectedCategory("all")
                        setSelectedWard("all")
                        setSelectedDepartment("all")
                        setSearchQuery("")
                      }}
                      className="triage-reset-filters-btn"
                      title="Reset all active filters"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Selectors */}
              <div className="triage-filter-selectors-row">
                <div className="triage-filter-select-wrap">
                  <label>Status:</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="triage-select-filter"
                  >
                    <option value="all">All Statuses ({issues.length})</option>
                    <option value="reported">Reported</option>
                    <option value="under_review">Under Review</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="awaiting_verification">Awaiting Verification</option>
                    <option value="verified_repaired">Verified Repaired</option>
                    <option value="reopened">Reopened</option>
                  </select>
                </div>

                <div className="triage-filter-select-wrap">
                  <label>Severity:</label>
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="triage-select-filter"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical Priority</option>
                    <option value="high">High Priority</option>
                    <option value="moderate">Moderate Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div className="triage-filter-select-wrap">
                  <label>Category:</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="triage-select-filter"
                  >
                    <option value="all">All Categories</option>
                    <option value="cavity">Pothole Cavities</option>
                    <option value="crack">Surface Cracks</option>
                    <option value="edge">Edge Failures</option>
                    <option value="waterlogging">Waterlogging</option>
                    <option value="collapse">Road Collapse</option>
                    <option value="other">Other Hazards</option>
                  </select>
                </div>

                <div className="triage-filter-select-wrap">
                  <label>Ward:</label>
                  <select
                    value={selectedWard}
                    onChange={(e) => setSelectedWard(e.target.value)}
                    className="triage-select-filter"
                  >
                    <option value="all">All Wards</option>
                    {metadata?.wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.wardCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="triage-filter-select-wrap">
                  <label>Dept:</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="triage-select-filter"
                  >
                    <option value="all">All Departments</option>
                    {metadata?.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name.split(" ")[0]} Dept
                      </option>
                    ))}
                  </select>
                </div>

                <div className="triage-match-count-pill">
                  Showing {filteredIssues.length} of {issues.length}
                </div>
              </div>
            </div>

            {/* Issues List with Progressive Disclosure */}
            <div className="triage-table-container flex-1 overflow-y-auto">
              {filteredIssues.length > 0 ? (
                <div className="triage-cards-grid">
                  {filteredIssues.map((issue) => {
                    const assignedToMe = isAssignedToInspector(issue)
                    const reportedByMe = isReportedByCitizen(issue)
                    const isLoadingAction = actionLoadingId === issue.id
                    const isExpanded = expandedIssueId === issue.id
                    const issueCardTone = isIssueResolved(issue)
                      ? "card-tone-resolved"
                      : issue.status === "in_progress" || issue.status === "repair_completed"
                        ? "card-tone-in-progress"
                        : issue.status === "assigned"
                          ? "card-tone-assigned"
                          : issue.risk.score >= 85 || issue.severity === "critical"
                            ? "card-tone-critical"
                            : issue.status === "under_review"
                              ? "card-tone-review"
                              : issue.risk.score >= 60 || issue.severity === "high"
                                ? "card-tone-high"
                                : ""

                    return (
                      <div
                        key={issue.id}
                        className={`triage-issue-card ${issueCardTone} relative ${
                          assignedToMe || reportedByMe ? "border-[#141413]/35" : ""
                        }`}
                        onClick={() => onSelectIssue(issue)}
                      >
                        {/* Role-Specific Card Top Banner */}
                        {assignedToMe && (
                          <div className="col-span-2 -mt-0.5 mb-0.5 px-2.5 py-1 rounded-md bg-[#F4F3EF] border border-[#DFDDD6] text-[#141413] text-[10.5px] font-mono font-semibold flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 min-w-0 truncate">
                              <HardHat size={12} className="text-[#141413] shrink-0" />
                              <span className="truncate">ASSIGNED TO YOU · ON-SITE ACTION REQUIRED</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#141413] text-white text-[9px] uppercase tracking-wider shrink-0">
                              Field Queue
                            </span>
                          </div>
                        )}

                        {reportedByMe && !assignedToMe && (
                          <div className="col-span-2 -mt-0.5 mb-0.5 px-2.5 py-1 rounded-md bg-[#F5F4F0] border border-[#DFDDD6] text-[#141413] text-[10.5px] font-mono font-semibold flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 min-w-0 truncate">
                              <User size={12} className="text-[#141413] shrink-0" />
                              <span className="truncate">YOUR REPORT · {issue.status.replace("_", " ").toUpperCase()}</span>
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[#141413] text-white text-[9px] uppercase tracking-wider shrink-0">
                              Tracked
                            </span>
                          </div>
                        )}

                        <div className="triage-card-img-col">
                          <img
                            src={issue.annotatedPhotoUrl || issue.originalPhotoUrl}
                            alt={issue.title}
                            className="triage-card-thumb"
                          />
                          <span className={`risk-badge-corner ${issue.risk.level}`}>
                            {issue.risk.score}/100
                          </span>
                        </div>

                        <div className="triage-card-main-col">
                          <div className="triage-card-top-row">
                            <span className="tracking-code-pill small">
                              #{issue.trackingCode}
                            </span>
                            <span className={`status-pill ${issue.status.replace("_", "-")}`}>
                              {issue.status.toUpperCase().replace("_", " ")}
                            </span>
                            <span className="card-category-tag">
                              {issue.category.toUpperCase()}
                            </span>

                            {issue.assignedInspectorName ? (
                              <span
                                className={`card-category-tag text-[9px] font-mono ${
                                  assignedToMe ? "bg-[#141413] text-white border-[#141413] font-bold" : ""
                                }`}
                                title={`Assigned Inspector: ${issue.assignedInspectorName}`}
                              >
                                {issue.assignedInspectorName.replace("Senior Inspector ", "")}
                              </span>
                            ) : (
                              activePersona === "SUPER_ADMIN" && (
                                <span className="text-[9px] font-mono text-[#5C5B55] bg-[#F4F3EF] px-1.5 py-0.5 rounded border border-[#D8D5CD]">
                                  UNASSIGNED
                                </span>
                              )
                            )}
                          </div>

                          <h3 className="triage-card-title">{issue.title}</h3>
                          <p className="triage-card-address">
                            <MapPin size={13} className="text-vermilion shrink-0" />{" "}
                            <span>{issue.address}</span>
                          </p>

                          <p className="triage-card-explanation-snippet">
                            {issue.risk.explanation || issue.notes || "Monitored roadway defect."}
                          </p>

                          {/* PROGRESSIVE DISCLOSURE: Inline Details Section */}
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-2.5 p-3 rounded-lg bg-[#F7F6F3] border border-[#DFDDD6] text-xs font-mono space-y-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <div>
                                  <span className="text-[#8B9185] block">COORDINATES:</span>
                                  <strong>{issue.coordinates.lat.toFixed(5)}°N, {issue.coordinates.lng.toFixed(5)}°E</strong>
                                </div>
                                <div>
                                  <span className="text-[#8B9185] block">MCGM WARD:</span>
                                  <strong>{issue.wardName || "Ward H/W"}</strong>
                                </div>
                                <div>
                                  <span className="text-[#8B9185] block">DEPTH ESTIMATE:</span>
                                  <strong>
                                    {issue.detection.depthEstimateMm != null ? `${issue.detection.depthEstimateMm} mm` : "Unmeasured"}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[#8B9185] block">SURFACE LOSS:</span>
                                  <strong>{((issue.detection.surfaceLossRatio || 0.15) * 100).toFixed(0)}%</strong>
                                </div>
                              </div>
                              {issue.notes && (
                                <div className="pt-1 border-t border-[#242522]/5">
                                  <span className="text-[#8B9185] block">REPORTER NOTES:</span>
                                  <p className="font-sans text-[11px] text-[#242522]">{issue.notes}</p>
                                </div>
                              )}
                            </motion.div>
                          )}

                          <div className="triage-card-footer">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="footer-left-metrics">
                                <span>
                                  <strong>{issue.supportingCount}</strong> {issue.supportingCount === 1 ? "report" : "reports"}
                                </span>
                                <span>·</span>
                                <span>
                                  <strong>
                                    {issue.detection.depthEstimateMm != null ? `${issue.detection.depthEstimateMm}mm` : "N/A"}
                                  </strong>
                                </span>
                              </div>
                              {/* Progressive disclosure toggle - kept outside overflow clipping */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedIssueId(isExpanded ? null : issue.id)
                                }}
                                className="text-[10.5px] font-mono font-semibold text-[#141413] underline-offset-2 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Less</span>
                                    <ChevronUp size={11} />
                                  </>
                                ) : (
                                  <>
                                    <span>Details</span>
                                    <ChevronDown size={11} />
                                  </>
                                )}
                              </button>
                            </div>

                            <div
                              className="footer-right-actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* CITIZEN CONFIRMATION BUTTON */}
                              {activePersona === "CITIZEN" && (
                                <button
                                  type="button"
                                  onClick={(e) => handleCitizenSupport(e, issue)}
                                  disabled={isLoadingAction}
                                  className="h-[26px] px-2 rounded-md border border-[#D4D1C8] bg-[#F7F6F2] hover:bg-[#141413] hover:text-white text-[#141413] text-[10.5px] font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Confirm this road hazard to prioritize municipal repair"
                                >
                                  <ThumbsUp size={11} />
                                  <span>+1</span>
                                </button>
                              )}

                              {/* FIELD INSPECTOR ACTIONS */}
                              {activePersona === "INSPECTOR" && assignedToMe && (
                                <>
                                  {(issue.status === "reported" || issue.status === "under_review") && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickInspectorAction(
                                          e,
                                          issue,
                                          "UNDER_REVIEW",
                                          "Inspector arrived on site; cavity assessment initiated."
                                        )
                                      }
                                      disabled={isLoadingAction}
                                      className="px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Begin on-site asphalt assessment"
                                    >
                                      <Activity size={12} />
                                      <span>Start Inspection</span>
                                    </button>
                                  )}

                                  {(issue.status === "under_review" || issue.status === "assigned") && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickInspectorAction(
                                          e,
                                          issue,
                                          "IN_PROGRESS",
                                          "Excavation and hot-mix asphalt patching commenced."
                                        )
                                      }
                                      disabled={isLoadingAction}
                                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Begin resurfacing work on-site"
                                    >
                                      <Wrench size={12} />
                                      <span>Mark In Progress</span>
                                    </button>
                                  )}

                                  {issue.status === "in_progress" && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickInspectorAction(
                                          e,
                                          issue,
                                          "AWAITING_VERIFICATION",
                                          "Asphalt compaction completed; ready for quality verification.",
                                          "/images/repaired_road.jpg"
                                        )
                                      }
                                      disabled={isLoadingAction}
                                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Submit repair completion photo for verification"
                                    >
                                      <FileCheck size={12} />
                                      <span>Submit Evidence</span>
                                    </button>
                                  )}

                                  {issue.status === "awaiting_verification" && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleQuickInspectorAction(
                                          e,
                                          issue,
                                          "VERIFIED_REPAIRED",
                                          "Quality assurance inspection passed; surface smooth and traffic restored."
                                        )
                                      }
                                      disabled={isLoadingAction}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Approve and certify repair quality"
                                    >
                                      <CheckCircle2 size={12} />
                                      <span>Verify Quality</span>
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => onOpenGlobeForIssue(issue)}
                                className="triage-sub-btn"
                                title="View on 3D Globe"
                              >
                                <Globe size={13} />
                                <span>3D Globe</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onSelectIssue(issue)}
                                className="triage-action-btn"
                                title="Manage road issue workflow in dedicated workspace"
                              >
                                <span>Manage</span>
                                <ArrowDownRight size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="triage-empty-state glass">
                  <ShieldAlert size={40} className="text-vermilion" />
                  <h3>NO ROAD DEFECTS MATCH FILTER</h3>
                  <p>Try resetting the status, severity, ward, department, or search query filter to view all monitored defects.</p>
                  <button
                    onClick={() => {
                      setSelectedStatus("all")
                      setSelectedSeverity("all")
                      setSelectedCategory("all")
                      setSelectedWard("all")
                      setSelectedDepartment("all")
                      setSearchQuery("")
                    }}
                    className="button button--secondary"
                  >
                    <span>Reset All Filters</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 3: RISK MAP (GEOSPATIAL 2D MUMBAI MAP OF DEFECTS)
           ========================================================================= */}
        {activeView === "risk_map" && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            <div className="flex-1 h-full min-h-[420px] relative">
              <Interactive2DMap
                height={560}
                issues={issues}
                onSelectIssue={(issue) => setMapSelectedIssue(issue)}
              />
            </div>

            {/* Side Drawer with Selected Issue or Quick Cluster List */}
            <div className="w-full md:w-80 bg-[#FFFFFF] border-t md:border-t-0 md:border-l border-[#DFDDD6] p-4 overflow-y-auto max-h-[300px] md:max-h-none flex flex-col justify-between">
              {mapSelectedIssue ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                      #{mapSelectedIssue.trackingCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapSelectedIssue(null)}
                      className="text-xs text-[#8B9185] hover:text-[#242522]"
                    >
                      Clear Pin
                    </button>
                  </div>

                  <img
                    src={mapSelectedIssue.annotatedPhotoUrl || mapSelectedIssue.originalPhotoUrl}
                    alt={mapSelectedIssue.title}
                    className="w-full h-36 object-cover rounded-xl border border-[#242522]/10"
                  />

                  <div>
                    <h4 className="text-sm font-bold text-[#242522]">{mapSelectedIssue.title}</h4>
                    <p className="text-xs text-[#687567] flex items-center gap-1 mt-0.5">
                      <MapPin size={12} className="text-[#E65336] shrink-0" />
                      <span>{mapSelectedIssue.address}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-lg bg-[#ECE6D8]">
                    <div>
                      <small className="text-[#8B9185] block">RISK SCORE</small>
                      <strong className="text-[#E65336]">{mapSelectedIssue.risk.score}/100</strong>
                    </div>
                    <div>
                      <small className="text-[#8B9185] block">SEVERITY</small>
                      <strong className="uppercase">{mapSelectedIssue.severity}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectIssue(mapSelectedIssue)}
                    className="button button--primary w-full text-xs"
                  >
                    <span>Open Management Workspace</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-[#242522] flex items-center gap-1.5">
                      <MapPin size={15} className="text-[#E65336]" />
                      Geospatial Defect Map
                    </h4>
                    <p className="text-xs text-[#687567]">
                      Click any pin on the map to inspect defect coordinates, edge CV analysis, and municipal assignment.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase text-[#8B9185]">
                      High-Priority Hazard Pins
                    </span>
                    <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                      {issues.slice(0, 5).map((i) => (
                        <div
                          key={i.id}
                          onClick={() => setMapSelectedIssue(i)}
                          className="p-2.5 rounded-lg border border-[#DFDDD6] hover:border-[#141413] bg-[#FAF9F7] cursor-pointer text-xs transition-colors"
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <strong className="truncate max-w-[170px]">{i.title}</strong>
                            <span className="font-mono text-[10px] text-orange-600 font-bold">
                              {i.risk.score}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#687567] truncate block">
                            {i.address}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 4: RESOLUTION TRACKING (SLA COMPLIANCE & VERIFIED REPAIRS)
           ========================================================================= */}
        {activeView === "resolution" && (
          <div className="p-3.5 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto max-h-[75vh]">
            <div className="flex items-center justify-between">
              <div>
                <span className="eyebrow mb-1">
                  <span /> MUNICIPAL SLA PERFORMANCE
                </span>
                <h3 className="text-lg font-bold text-[#242522]">
                  Defect Resolution &amp; Contractor Quality Sign-Offs
                </h3>
              </div>

              {/* Resolution Sub-Tabs */}
              <div className="flex items-center gap-1 bg-[#ECE6D8] p-1 rounded-xl border border-[#D8D2C5]">
                <button
                  type="button"
                  onClick={() => setResolutionFilter("in_progress")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    resolutionFilter === "in_progress"
                      ? "bg-[#242522] text-[#F5F1E8] shadow-sm"
                      : "text-[#687567] hover:text-[#242522]"
                  }`}
                >
                  In Progress SLA ({inProgressIssues.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionFilter("verified_repaired")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    resolutionFilter === "verified_repaired"
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "text-[#687567] hover:text-[#242522]"
                  }`}
                >
                  Verified Repaired ({resolvedIssues.length})
                </button>
              </div>
            </div>

            {/* List of In Progress or Resolved Defects */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(resolutionFilter === "in_progress" ? inProgressIssues : resolvedIssues).map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => onSelectIssue(issue)}
                  className={`p-4 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-l-[3px] shadow-xs transition-all cursor-pointer flex flex-col justify-between space-y-3 hover:border-[#141413] ${
                    isIssueResolved(issue)
                      ? "border-l-[#4c6452]"
                      : "border-l-[#141413]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                          #{issue.trackingCode}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            isIssueResolved(issue)
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {issue.status.replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[#242522]">{issue.title}</h4>
                      <p className="text-xs text-[#687567]">{issue.address}</p>
                    </div>

                    <span className="font-mono text-xs font-bold text-[#E65336]">
                      Risk {issue.risk.score}/100
                    </span>
                  </div>

                  {/* Photo comparison for resolved issues */}
                  {isIssueResolved(issue) ? (
                    <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-mono">
                      <div>
                        <span className="text-[#8B9185] block mb-1">BEFORE (HAZARD)</span>
                        <img
                          src={issue.originalPhotoUrl}
                          alt="Before repair"
                          className="w-full h-24 object-cover rounded-lg border border-[#242522]/10"
                        />
                      </div>
                      <div>
                        <span className="text-emerald-700 font-bold block mb-1">AFTER (VERIFIED)</span>
                        <img
                          src={issue.repair?.afterPhotoUrl || "/images/repaired_road.jpg"}
                          alt="After repair"
                          className="w-full h-24 object-cover rounded-lg border border-emerald-300"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Wrench size={14} className="text-sky-700" />
                        <span>SLA Target: 24h Hot-Mix Resurfacing</span>
                      </span>
                      <strong className="font-mono text-[11px] text-sky-700">Elapsed: 4.2h</strong>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#242522]/10 text-xs font-mono">
                    <span className="text-[#687567]">
                      {issue.assignedInspectorName ? `Inspector: ${issue.assignedInspectorName}` : "Central Dispatch"}
                    </span>
                    <span className="text-[#E65336] font-bold flex items-center gap-1">
                      Manage Case <ArrowDownRight size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 5: ANALYTICS (RISK DISTRIBUTION, CATEGORY BREAKDOWN, WARD STATS)
           ========================================================================= */}
        {activeView === "analytics" && (
          <div className="p-3.5 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto max-h-[75vh]">
            <div>
              <span className="eyebrow mb-1">
                <span /> SPATIAL & INFRASTRUCTURE INTELLIGENCE
              </span>
              <h3 className="text-lg font-bold text-[#242522]">
                Greater Mumbai Road Defect Analytics &amp; Severity Distribution
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Risk Distribution Chart */}
              <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-[#242522] flex items-center gap-2">
                  <TrendingUp size={16} className="text-[#E65336]" />
                  AI Risk Priority Distribution
                </h4>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-rose-700 font-bold">Critical Risk (&gt;= 80)</span>
                      <strong>{riskBands.critical} defects</strong>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-rose-600 rounded-full"
                        style={{ width: `${(riskBands.critical / issues.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-orange-600 font-bold">High Risk (60 - 79)</span>
                      <strong>{riskBands.high} defects</strong>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full"
                        style={{ width: `${(riskBands.high / issues.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-amber-600 font-bold">Moderate Risk (40 - 59)</span>
                      <strong>{riskBands.moderate} defects</strong>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${(riskBands.moderate / issues.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-slate-600 font-bold">Low Distress (&lt; 40)</span>
                      <strong>{riskBands.low} defects</strong>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-400 rounded-full"
                        style={{ width: `${(riskBands.low / issues.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Defect Category Breakdown */}
              <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-[#242522] flex items-center gap-2">
                  <Layers size={16} className="text-[#E65336]" />
                  Defect Classification Breakdown
                </h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                    <span className="text-[#8B9185] block font-mono">POTHOLE CAVITIES</span>
                    <strong className="text-lg text-[#E65336]">{categoryCounts.cavity}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#ECE6D8] border border-[#D8D2C5]">
                    <span className="text-[#8B9185] block font-mono">SURFACE CRACKS</span>
                    <strong className="text-lg text-[#242522]">{categoryCounts.crack}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#ECE6D8] border border-[#D8D2C5]">
                    <span className="text-[#8B9185] block font-mono">EDGE RAVELING</span>
                    <strong className="text-lg text-[#242522]">{categoryCounts.edge}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-sky-50 border border-sky-200">
                    <span className="text-[#8B9185] block font-mono">WATERLOGGING</span>
                    <strong className="text-lg text-sky-800">{categoryCounts.waterlogging}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <span className="text-[#8B9185] block font-mono">ROAD COLLAPSE</span>
                    <strong className="text-lg text-rose-800">{categoryCounts.collapse}</strong>
                  </div>
                  <div className="p-3 rounded-lg bg-[#ECE6D8] border border-[#D8D2C5]">
                    <span className="text-[#8B9185] block font-mono">OTHER HAZARDS</span>
                    <strong className="text-lg text-[#242522]">{categoryCounts.other}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 6: ADMINISTRATION (MUNICIPAL ROSTER, WARD JURISDICTIONS, AUDIT TRAIL)
           ========================================================================= */}
        {activeView === "admin" && (
          <div className="p-3.5 sm:p-7 space-y-4 sm:space-y-6 overflow-y-auto max-h-[75vh]">
            <div>
              <span className="eyebrow mb-1">
                <span /> MUNICIPAL GOVERNANCE &amp; PERSONNEL
              </span>
              <h3 className="text-lg font-bold text-[#242522]">
                Municipal Personnel Roster &amp; Authority Boundaries
              </h3>
            </div>

            {/* Personnel Roster */}
            <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-4">
              <h4 className="text-sm font-bold text-[#242522] flex items-center gap-2">
                <UserCheck size={16} className="text-[#E65336]" />
                Registered Municipal Officers &amp; Field Staff
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    name: "System Administrator",
                    role: "SUPER_ADMIN",
                    title: "Tier 4 Global Authority",
                    assignedCount: 48,
                    jurisdiction: "All 24 MCGM Wards",
                  },
                  {
                    name: "Chief Marcus Brody",
                    role: "DEPARTMENT_ADMIN",
                    title: "Highways & Infrastructure Lead",
                    assignedCount: 16,
                    jurisdiction: "Citywide Asphalt Crew Allocation",
                  },
                  {
                    name: "Senior Inspector Sarah Jenkins",
                    role: "INSPECTOR",
                    title: "On-Site Road Quality Assessor",
                    assignedCount: 6,
                    jurisdiction: "Ward H/W & Ward A Sector",
                  },
                ].map((officer) => (
                  <div
                    key={officer.name}
                    className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#242522]/15 space-y-1.5 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-sm font-sans font-bold text-[#242522]">{officer.name}</strong>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        ACTIVE
                      </span>
                    </div>
                    <span className="text-[11px] text-[#E65336] font-bold block">{officer.title}</span>
                    <span className="text-[#687567] block">Jurisdiction: {officer.jurisdiction}</span>
                    <div className="pt-2 border-t border-[#242522]/5 flex items-center justify-between text-[11px]">
                      <span>Active Workload:</span>
                      <strong className="text-[#242522]">{officer.assignedCount} items</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* System Audit Trail Log */}
            <div className="p-5 rounded-xl bg-[#FFFFFF] border border-[#DFDDD6] border-t-[2.5px] border-t-[#141413] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#242522] flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#E65336]" />
                  Global Municipal Audit Trail (Tamper-Evident Events)
                </h4>
                <span className="text-[10px] font-mono text-[#8B9185]">Showing recent recorded logs</span>
              </div>

              <div className="space-y-2 font-mono text-xs max-h-56 overflow-y-auto">
                {[
                  {
                    time: "Today, 11:20 AM",
                    actor: "System Administrator (SUPER_ADMIN)",
                    action: "Work Order Dispatched for Bandstand Cavity #RG-25388",
                    hash: "0x8f2a...c14d",
                  },
                  {
                    time: "Today, 10:45 AM",
                    actor: "Senior Inspector Sarah Jenkins (INSPECTOR)",
                    action: "Asphalt Compaction Quality Sign-off on Marine Drive #RG-81319",
                    hash: "0x3e1b...99a0",
                  },
                  {
                    time: "Today, 09:15 AM",
                    actor: "Elena Vance (CITIZEN)",
                    action: "GPS Defect Report Transmitted via RoadGuard Citizen Portal",
                    hash: "0x77c4...55b2",
                  },
                ].map((log, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-[#FAF8F5] border border-[#242522]/10 flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[#8B9185] text-[10px]">{log.time}</span>
                        <strong className="text-[#242522] text-[11px]">{log.actor}</strong>
                      </div>
                      <p className="text-[#687567] text-[11px] font-sans">{log.action}</p>
                    </div>
                    <span className="text-[10px] text-[#55544E] bg-[#F4F3EF] px-2 py-1 rounded border border-[#DFDDD6]">
                      {log.hash}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
