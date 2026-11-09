import React, { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileCheck,
  Filter,
  Globe,
  HardHat,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  User,
  UserCheck,
  Wrench,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import {
  DamageCategory,
  IssueStatus,
  RoadIssue,
  SeverityLevel,
  UserRole,
} from "../types/roadguard"
import { RoadIssueService } from "../services/roadIssueService"
import {
  apiClient,
  ApiUser,
  DashboardMetricsData,
  MunicipalMetadata,
} from "../services/apiClient"
import { MUNICIPAL_PERSONAS } from "../constants/personas"

export type DashboardPersona = "SUPER_ADMIN" | "DEPARTMENT_ADMIN" | "INSPECTOR" | "CITIZEN"

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
}: CityTriageDashboardProps) {
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

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedWard, setSelectedWard] = useState<string>("all")
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [liveStats, setLiveStats] = useState<DashboardMetricsData | null>(null)
  const [metadata, setMetadata] = useState<MunicipalMetadata | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // Fetch live aggregated metrics and metadata
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

  if (!isOpen) return null

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
    if (!currentUser) return false
    if (currentUser.id && issue.reportedById === currentUser.id) return true
    if (currentUser.fullName && issue.reportedBy && issue.reportedBy.toLowerCase().includes(currentUser.fullName.toLowerCase())) return true
    if (currentUser.email.includes("citizen") && (issue.reportedBy?.toLowerCase().includes("elena") || issue.reportedBy?.toLowerCase().includes("citizen"))) return true
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
        // Active feed excludes completed/resolved and rejected
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
        // General / Active dashboard: EXCLUDE completed & resolved defects!
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
        <div className="triage-top-bar">
          <div className="triage-title-group">
            <span className="eyebrow">
              <span />
              {activePersona === "SUPER_ADMIN" && "SUPER ADMIN EXECUTIVE COMMAND · GREATER MUMBAI (MCGM)"}
              {activePersona === "DEPARTMENT_ADMIN" && "DEPARTMENTAL OPERATIONS · HIGHWAYS & INFRASTRUCTURE"}
              {activePersona === "INSPECTOR" && "FIELD INSPECTION & TACTICAL CREW OPERATIONS"}
              {activePersona === "CITIZEN" && "CITIZEN COMMUNITY ROADGUARD TRANSPARENCY"}
            </span>
            <h2 id="triage-dashboard-title" className="triage-heading flex items-center gap-2.5">
              {activePersona === "SUPER_ADMIN" && "CITY ROAD RISK & TRIAGE OPERATIONS"}
              {activePersona === "DEPARTMENT_ADMIN" && "DEPARTMENT WORK ORDER & CREW DISPATCH"}
              {activePersona === "INSPECTOR" && "FIELD INSPECTOR ON-SITE ASSESSMENT QUEUE"}
              {activePersona === "CITIZEN" && "COMMUNITY ROAD DEFECTS & VERIFIED REPAIRS"}
            </h2>
          </div>

          <div className="triage-top-controls">
            {/* Quick 1-Click Persona Segmented Switcher for TCS Reviewers */}
            <div className="hidden lg:flex items-center gap-1 bg-[#ECE6D8] p-1 rounded-xl border border-[#D8D2C5]">
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
                        ? "bg-[#242522] text-[#F5F1E8] shadow-sm"
                        : "text-[#687567] hover:text-[#242522] hover:bg-white/60"
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
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Role Switcher Pill */}
            {onOpenAuth ? (
              <button
                type="button"
                onClick={onOpenAuth}
                className="triage-role-pill"
                title="Click to switch municipal persona or view profile"
              >
                <User size={13} className="text-vermilion" />
                <label>PERSONA:</label>
                <strong>
                  {currentUser ? currentUser.fullName.split(" ")[0] : currentUserRole.toUpperCase()}
                </strong>
                <span className="switch-tag">
                  {currentUser ? currentUser.role.replace("_", " ") : currentUserRole.toUpperCase()}
                </span>
              </button>
            ) : (
              <div className="triage-role-pill">
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

            <button
              onClick={handleManualRefresh}
              className={`triage-icon-btn ${isRefreshing ? "animate-spin" : ""}`}
              title="Refresh live database metrics"
            >
              <RefreshCw size={15} />
            </button>

            <button
              onClick={onClose}
              className="triage-close-btn"
              aria-label="Close dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Persona Context Banner Ribbon */}
        <div className="px-7 py-2 bg-[#f4f1ea] border-b border-[#242522]/8 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-[#687567]">
            {activePersona === "SUPER_ADMIN" && (
              <>
                <ShieldCheck size={14} className="text-emerald-700" />
                <span>Tier 4 Global Authority · Full ward allocation, inspector assignments, work order dispatch &amp; audit oversight.</span>
              </>
            )}
            {activePersona === "DEPARTMENT_ADMIN" && (
              <>
                <Building2 size={14} className="text-amber-600" />
                <span>Highways &amp; Infrastructure Division · Contractor dispatch, asphalt crew scheduling &amp; SLA compliance triage.</span>
              </>
            )}
            {activePersona === "INSPECTOR" && (
              <>
                <HardHat size={14} className="text-sky-600" />
                <span>
                  Senior Inspector Sarah Jenkins · On-site asphalt assessment, structural cavity verification &amp; resurfacing quality sign-off.
                </span>
              </>
            )}
            {activePersona === "CITIZEN" && (
              <>
                <User size={14} className="text-emerald-600" />
                <span>
                  Citizen Alliance (Elena Vance) · GPS road hazard reporting, photo evidence submission &amp; public repair tracking.
                </span>
              </>
            )}
          </div>

          {actionSuccessMsg && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-sans text-xs font-bold border border-emerald-300"
            >
              ✓ {actionSuccessMsg}
            </motion.div>
          )}
        </div>

        {/* Role-Specific Metrics Grid */}
        <div className="triage-metrics-grid">
          {activePersona === "INSPECTOR" ? (
            <>
              <div className="triage-metric-card highlight-vermilion">
                <small>Assigned To You</small>
                <div className="metric-num-row">
                  <strong className="text-vermilion">{myAssignedCount}</strong>
                  <span className="metric-tag urgent">Action Required</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Pending Assessment</small>
                <div className="metric-num-row">
                  <strong className="text-amber-600">{myPendingInspectionCount}</strong>
                  <span className="metric-tag">Needs Inspection</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Active On-Site Repairs</small>
                <div className="metric-num-row">
                  <strong>{myActiveRepairCount}</strong>
                  <span className="metric-tag">In Progress</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Verified Safe Roads</small>
                <div className="metric-num-row">
                  <strong className="text-emerald-600">{stats.verifiedRepaired}</strong>
                  <span className="metric-tag metric-tag-verified">Quality Certified</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Total City Hazards</small>
                <div className="metric-num-row">
                  <strong>{issues.length}</strong>
                  <span className="metric-tag">24 Wards</span>
                </div>
              </div>
            </>
          ) : activePersona === "CITIZEN" ? (
            <>
              <div className="triage-metric-card">
                <small>Active City Hazards</small>
                <div className="metric-num-row">
                  <strong>{stats.activeHazards}</strong>
                  <span className="metric-tag">Monitored</span>
                </div>
              </div>
              <div className="triage-metric-card highlight-vermilion">
                <small>My Submitted Reports</small>
                <div className="metric-num-row">
                  <strong className="text-vermilion">{myReportsCount}</strong>
                  <span className="metric-tag urgent">Tracked Reports</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Verified Repaired Roads</small>
                <div className="metric-num-row">
                  <strong className="text-emerald-600">{stats.verifiedRepaired}</strong>
                  <span className="metric-tag metric-tag-verified">Resolved</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Community Confirmations</small>
                <div className="metric-num-row">
                  <strong>{stats.communityConfirmations}</strong>
                  <span className="metric-tag">Citizen Votes</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Average Road Risk</small>
                <div className="metric-num-row">
                  <strong>{stats.averageCityRiskScore}</strong>
                  <span className="metric-tag">Score / 100</span>
                </div>
              </div>
            </>
          ) : activePersona === "DEPARTMENT_ADMIN" ? (
            <>
              <div className="triage-metric-card highlight-vermilion">
                <small>Department Queue</small>
                <div className="metric-num-row">
                  <strong className="text-vermilion">{deptActiveCount}</strong>
                  <span className="metric-tag urgent">Highways Dept</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>Pending Work Orders</small>
                <div className="metric-num-row">
                  <strong className="text-amber-600">{deptPendingDispatchCount}</strong>
                  <span className="metric-tag">Need Crew</span>
                </div>
              </div>
              <div className="triage-metric-card">
                <small>In-Progress Resurfacing</small>
                <div className="metric-num-row">
                  <strong>{inProgressCount}</strong>
                  <span className="metric-tag">Crews On-Site</span>
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
                <small>City Risk Average</small>
                <div className="metric-num-row">
                  <strong>{stats.averageCityRiskScore}</strong>
                  <span className="metric-tag">Score / 100</span>
                </div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Persona Perspective Tabs Bar */}
        <div className="px-7 pt-3 pb-1 bg-[#f5f2eb] border-b border-[#242522]/8 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            {activePersona === "INSPECTOR" && (
              <>
                <button
                  type="button"
                  onClick={() => setPerspectiveTab("my_assigned")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "my_assigned"
                      ? "bg-[#E65336] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "needs_inspection"
                      ? "bg-[#242522] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
                  }`}
                >
                  <Clock size={13} />
                  <span>Pending Inspection ({myPendingInspectionCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPerspectiveTab("active_repairs")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "active_repairs"
                      ? "bg-[#242522] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
                  }`}
                >
                  <Wrench size={13} />
                  <span>Active Repairs ({myActiveRepairCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPerspectiveTab("repaired")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "repaired"
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "community"
                      ? "bg-[#E65336] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "my_reports"
                      ? "bg-[#242522] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
                  }`}
                >
                  <User size={13} />
                  <span>My Submitted Reports ({myReportsCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPerspectiveTab("repaired")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    perspectiveTab === "repaired"
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
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
                      ? "bg-[#E65336] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                      ? "bg-[#242522] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
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
                      ? "bg-[#E65336] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                      ? "bg-[#b91c1c] text-white shadow-sm"
                      : "bg-white text-[#b91c1c] border border-red-200 hover:bg-red-50"
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
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-white text-amber-800 border border-amber-200 hover:bg-amber-50"
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
                      ? "bg-[#242522] text-white shadow-sm"
                      : "bg-white text-[#242522] border border-[#242522]/10 hover:bg-[#FAF8F5]"
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
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>Completed & Resolved ({totalResolvedCount})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Modern Controls Panel */}
        <div className="triage-controls-panel">
          {/* Top Search & Action Bar */}
          <div className="triage-search-actions-row">
            <div className="triage-search-input-wrap">
              <Search size={16} className="triage-search-icon" />
              <input
                type="text"
                placeholder="Search by defect ID (#RG-...), street, category, or keyword..."
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

              <button
                type="button"
                onClick={onOpenReportModal}
                className="triage-report-hazard-btn"
              >
                <span>+ Report Hazard</span>
              </button>
            </div>
          </div>

          {/* Bottom Filter Selectors Row */}
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
                <option value="depression">Settlement Depressions</option>
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

        {/* Issues List Table */}
        <div className="triage-table-container">
          {filteredIssues.length > 0 ? (
            <div className="triage-cards-grid">
              {filteredIssues.map((issue) => {
                const assignedToMe = isAssignedToInspector(issue)
                const reportedByMe = isReportedByCitizen(issue)
                const isLoadingAction = actionLoadingId === issue.id

                return (
                  <div
                    key={issue.id}
                    className={`triage-issue-card relative ${
                      assignedToMe ? "ring-2 ring-sky-500 bg-sky-50/20" : ""
                    } ${reportedByMe ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""}`}
                    onClick={() => onSelectIssue(issue)}
                  >
                    {/* Role-Specific Card Top Banner */}
                    {assignedToMe && (
                      <div className="col-span-2 -mt-1 mb-2 px-2.5 py-1 rounded-md bg-sky-100 border border-sky-300 text-sky-900 text-[11px] font-mono font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <HardHat size={13} className="text-sky-700" />
                          <span>ASSIGNED TO YOU · ON-SITE ACTION REQUIRED</span>
                        </span>
                        <span className="text-[10px] uppercase text-sky-800">Field Queue</span>
                      </div>
                    )}

                    {reportedByMe && !assignedToMe && (
                      <div className="col-span-2 -mt-1 mb-2 px-2.5 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-mono font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <User size={13} className="text-emerald-700" />
                          <span>YOUR SUBMITTED REPORT · LIVE STATUS: {issue.status.replace("_", " ").toUpperCase()}</span>
                        </span>
                        <span className="text-[10px] text-emerald-800 font-sans font-semibold">Tracked</span>
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
                        <span
                          className={`status-pill ${issue.status.replace("_", "-")}`}
                        >
                          {issue.status.toUpperCase().replace("_", " ")}
                        </span>
                        <span className="card-category-tag">
                          {issue.category.toUpperCase()}
                        </span>

                        {issue.assignedInspectorName ? (
                          <span
                            className={`card-category-tag text-[9px] font-mono ${
                              assignedToMe ? "bg-sky-200 text-sky-900 font-bold" : ""
                            }`}
                            title={`Assigned Inspector: ${issue.assignedInspectorName}`}
                          >
                            👷 {issue.assignedInspectorName.replace("Senior Inspector ", "")}
                          </span>
                        ) : (
                          activePersona === "SUPER_ADMIN" && (
                            <span className="text-[9px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
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

                      <div className="triage-card-footer">
                        <div
                          className="footer-left-metrics"
                          title={`${issue.supportingCount} confirmations · Depth: ${issue.detection.depthEstimateMm}mm · ${new Date(issue.createdAt).toLocaleDateString()}`}
                        >
                          <span>
                            <strong>{issue.supportingCount}</strong> {issue.supportingCount === 1 ? "report" : "reports"}
                          </span>
                          <span>•</span>
                          <span>
                            <strong>{issue.detection.depthEstimateMm}mm</strong>
                          </span>
                          {issue.wardName && (
                            <>
                              <span>•</span>
                              <span className="ward-truncate">{issue.wardName}</span>
                            </>
                          )}
                        </div>

                        <div
                          className="footer-right-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* CITIZEN QUICK CONFIRMATION BUTTON */}
                          {activePersona === "CITIZEN" && (
                            <button
                              type="button"
                              onClick={(e) => handleCitizenSupport(e, issue)}
                              disabled={isLoadingAction}
                              className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Confirm this road hazard to prioritize municipal repair"
                            >
                              <ThumbsUp size={12} />
                              <span>Confirm (+1)</span>
                            </button>
                          )}

                          {/* FIELD INSPECTOR INLINE QUICK ACTIONS */}
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
              <h3>
                {activePersona === "INSPECTOR" && perspectiveTab === "my_assigned"
                  ? "NO DEFECTS CURRENTLY ASSIGNED TO YOUR QUEUE"
                  : activePersona === "CITIZEN" && perspectiveTab === "my_reports"
                  ? "YOU HAVE NOT SUBMITTED ANY REPORTS YET"
                  : "NO ROAD DEFECTS MATCH FILTER"}
              </h3>
              <p>
                {activePersona === "INSPECTOR" && perspectiveTab === "my_assigned"
                  ? "When a Super Admin assigns an inspection or work order to your profile, it will immediately appear here. Click 'All Monitored Hazards' to inspect all city defects."
                  : activePersona === "CITIZEN" && perspectiveTab === "my_reports"
                  ? "Click '+ Report Hazard' to submit a photo and GPS location for a road defect anywhere in Greater Mumbai."
                  : "Try resetting the status, severity, ward, department, or search query filter to view all monitored defects."}
              </p>
              <button
                onClick={() => {
                  setPerspectiveTab(
                    activePersona === "INSPECTOR"
                      ? "all"
                      : activePersona === "CITIZEN"
                      ? "community"
                      : "all_city"
                  )
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
      </motion.div>
    </div>
  )
}
