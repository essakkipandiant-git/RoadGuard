import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  HardHat,
  Layers,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserCheck,
  Wrench,
  X,
  ChevronRight,
  TrendingUp,
  Camera,
  Upload,
} from "lucide-react"
import { RoadIssue, SeverityLevel, IssueStatus, UserRole } from "../types/roadguard"
import { apiClient, ApiUser, mapBackendRole, MunicipalMetadata } from "../services/apiClient"
import { RoadIssueService } from "../services/roadIssueService"
import { MUNICIPAL_PERSONAS } from "../constants/personas"

export interface MunicipalAdminDashboardProps {
  isOpen: boolean
  onClose: () => void
  issues: RoadIssue[]
  currentUserRole: UserRole
  onRoleChange: (role: UserRole) => void
  onSelectIssue: (issue: RoadIssue) => void
  onOpenGlobeForIssue?: (issue: RoadIssue) => void
  onRefreshData: () => Promise<void> | void
  currentUser?: ApiUser | null
  onOpenAuth?: () => void
  onSwitchPersona?: (roleOrEmail: string) => void
  onOpenCitizenView?: () => void
}

export type AdminRole = "SUPER_ADMIN" | "DEPARTMENT_ADMIN" | "INSPECTOR"

export default function MunicipalAdminDashboard({
  isOpen,
  onClose,
  issues,
  currentUserRole,
  onRoleChange,
  onSelectIssue,
  onOpenGlobeForIssue,
  onRefreshData,
  currentUser,
  onOpenAuth,
  onSwitchPersona,
  onOpenCitizenView,
}: MunicipalAdminDashboardProps) {
  // Determine active persona
  const activeRole: AdminRole = useMemo(() => {
    if (currentUser?.role === "SUPER_ADMIN") return "SUPER_ADMIN"
    if (currentUser?.role === "DEPARTMENT_ADMIN") return "DEPARTMENT_ADMIN"
    if (currentUser?.role === "INSPECTOR" || currentUser?.role === "FIELD_ADMIN") return "INSPECTOR"
    if (currentUserRole === "crew") return "DEPARTMENT_ADMIN"
    if (currentUserRole === "inspector") return "INSPECTOR"
    return "SUPER_ADMIN"
  }, [currentUser?.role, currentUserRole])

  // Active Queue Tab - Super Admin defaults to all active city issues for complete executive visibility
  const defaultTab = useMemo(() => {
    if (activeRole === "SUPER_ADMIN") return "all_city"
    if (activeRole === "DEPARTMENT_ADMIN") return "work_orders"
    return "my_assigned"
  }, [activeRole])

  const [activeQueueTab, setActiveQueueTab] = useState<string>(defaultTab)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWard, setSelectedWard] = useState("all")
  const [selectedSeverity, setSelectedSeverity] = useState("all")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // Sync tab when role changes
  useEffect(() => {
    setActiveQueueTab(defaultTab)
  }, [defaultTab])

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Manual refresh
  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefreshData()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Pre-calculated Municipal Counts
  const counts = useMemo(() => {
    const aiVerification = issues.filter((i) => i.status === "reported").length
    const workOrderPending = issues.filter((i) => i.status === "under_review").length
    const fieldActive = issues.filter((i) => i.status === "assigned" || i.status === "in_progress").length
    const auditPending = issues.filter((i) => i.status === "repair_completed").length
    const executiveCertPending = issues.filter((i) => i.status === "awaiting_verification").length
    const certifiedRepaired = issues.filter((i) => i.status === "verified_repaired" || i.status === "closed").length
    const criticalCorridors = issues.filter(
      (i) => (i.severity === "critical" || i.risk.score >= 80) && i.status !== "verified_repaired" && i.status !== "closed"
    ).length
    const allActive = issues.filter(
      (i) => i.status !== "verified_repaired" && i.status !== "closed" && i.status !== "rejected"
    ).length

    return {
      aiVerification,
      workOrderPending,
      fieldActive,
      auditPending,
      executiveCertPending,
      certifiedRepaired,
      criticalCorridors,
      allActive,
    }
  }, [issues])

  // Role-Scoped Filtered Issues
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // 1. Queue Tab Filter
      if (activeRole === "SUPER_ADMIN") {
        if (activeQueueTab === "all_city") {
          // Show all active city defects
          if (issue.status === "verified_repaired" || issue.status === "closed") return false
        } else if (activeQueueTab === "ai_verification") {
          if (issue.status !== "reported") return false
        } else if (activeQueueTab === "work_orders") {
          if (issue.status !== "under_review") return false
        } else if (activeQueueTab === "field_active") {
          if (issue.status !== "assigned" && issue.status !== "in_progress") return false
        } else if (activeQueueTab === "final_certification") {
          if (issue.status !== "awaiting_verification" && issue.status !== "repair_completed") return false
        } else if (activeQueueTab === "critical") {
          if (issue.severity !== "critical" && issue.risk.score < 80) return false
          if (issue.status === "verified_repaired" || issue.status === "closed") return false
        } else if (activeQueueTab === "certified_repaired") {
          if (issue.status !== "verified_repaired" && issue.status !== "closed") return false
        }
      } else if (activeRole === "DEPARTMENT_ADMIN") {
        if (activeQueueTab === "work_orders") {
          if (issue.status !== "under_review" && issue.status !== "reported") return false
        } else if (activeQueueTab === "dept_audit") {
          if (issue.status !== "repair_completed") return false
        } else if (activeQueueTab === "active_crews") {
          if (issue.status !== "assigned" && issue.status !== "in_progress") return false
        } else if (activeQueueTab === "certified_repaired") {
          if (issue.status !== "verified_repaired" && issue.status !== "closed") return false
        }
      } else if (activeRole === "INSPECTOR") {
        if (activeQueueTab === "my_assigned") {
          if (issue.status !== "assigned") return false
        } else if (activeQueueTab === "upload_evidence") {
          if (issue.status !== "in_progress") return false
        } else if (activeQueueTab === "completed_jobs") {
          if (issue.status !== "repair_completed" && issue.status !== "awaiting_verification" && issue.status !== "verified_repaired" && issue.status !== "closed") return false
        }
      }

      // 2. Dropdown Ward Filter
      if (selectedWard !== "all") {
        const matchWard =
          issue.wardName?.toLowerCase().includes(selectedWard.toLowerCase()) ||
          issue.wardId?.toLowerCase().includes(selectedWard.toLowerCase()) ||
          issue.address?.toLowerCase().includes(selectedWard.toLowerCase())
        if (!matchWard) return false
      }

      // 3. Dropdown Severity Filter
      if (selectedSeverity !== "all" && issue.severity !== selectedSeverity) {
        return false
      }

      // 4. Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const text = `${issue.title} ${issue.address} ${issue.trackingCode} ${issue.category} ${issue.assignedInspectorName || ""}`.toLowerCase()
        if (!text.includes(q)) return false
      }

      return true
    })
  }, [issues, activeRole, activeQueueTab, selectedWard, selectedSeverity, searchQuery])

  // Execute Direct Municipal Role Action
  const handleExecuteQuickAction = async (
    e: React.MouseEvent,
    issue: RoadIssue,
    actionType: string,
    remarks?: string
  ) => {
    e.stopPropagation()
    setActionLoadingId(issue.id)
    try {
      try {
        await apiClient.issues.executeAction(issue.id, {
          actionType,
          remarks: remarks || `Municipal action executed from Admin Command Suite: ${actionType}`,
        })
      } catch {
        // Local simulation fallback
        let targetStatus: IssueStatus = issue.status
        if (actionType === "VERIFY_REPORT") targetStatus = "under_review"
        else if (actionType === "DISPATCH_WORK_ORDER") targetStatus = "assigned"
        else if (actionType === "UPDATE_PROGRESS") targetStatus = "in_progress"
        else if (actionType === "APPROVE_DEPT_QUALITY") targetStatus = "awaiting_verification"
        else if (actionType === "APPROVE_REPAIR") targetStatus = "verified_repaired"

        RoadIssueService.updateStatus(issue.id, targetStatus, {
          notes: remarks || `Action: ${actionType}`,
          actorName: currentUser?.fullName || "System Administrator",
          actorRole: (currentUser?.role || "SUPER_ADMIN").toLowerCase() as any,
          afterPhotoUrl: actionType === "APPROVE_REPAIR" ? "/images/repaired_road.jpg" : undefined,
        })
      }
      setSuccessToast(`Action executed on #${issue.trackingCode}: ${actionType}`)
      setTimeout(() => setSuccessToast(null), 3500)
      await handleManualRefresh()
    } catch (err: any) {
      alert(err.message || "Action failed.")
    } finally {
      setActionLoadingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="triage-modal-overlay">
      <div className="triage-modal-backdrop" onClick={onClose} />
      <div className="triage-modal-container font-mono">
        {/* Top Municipal Government Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#D8D2C5] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-[#E65336] flex items-center justify-center text-white font-bold shadow-md shrink-0">
              <ShieldAlert size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-[#242522] tracking-wide">
                  MUNICIPAL ADMIN COMMAND SUITE
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-300">
                  GOVERNMENT OF GREATER MUMBAI (MCGM)
                </span>
              </div>
              <p className="text-xs text-[#687567] truncate">
                Automated Pothole Triage, Field Contractor Dispatch &amp; Executive Resolution Certification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            {/* Quick Switch to Citizen Public View */}
            {onOpenCitizenView && (
              <button
                type="button"
                onClick={onOpenCitizenView}
                className="px-3 py-1.5 rounded-xl border border-[#D8D2C5] bg-white hover:bg-[#F5F1E8] text-[#242522] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                title="Preview what citizens and commuters see on the public road health portal"
              >
                <Eye size={14} className="text-[#E65336]" />
                <span className="hidden sm:inline">Switch to Citizen View</span>
                <span className="sm:hidden">Citizen View</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-[#D8D2C5] bg-white hover:bg-[#F5F1E8] text-[#242522] transition-colors cursor-pointer"
              title="Refresh municipal database"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin text-[#E65336]" : ""} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-[#D8D2C5] bg-white hover:bg-[#F5F1E8] text-[#242522] transition-colors cursor-pointer"
              title="Close Command Suite (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Persona Identity & Fast Role Switcher */}
        <div className="px-6 py-3 bg-[#161715] text-white flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold">
              Active Municipal Persona:
            </span>
            <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <strong className="text-xs text-[#F5F1E8]">
                {currentUser?.fullName || (activeRole === "SUPER_ADMIN" ? "System Administrator" : activeRole === "DEPARTMENT_ADMIN" ? "Chief Marcus Brody" : "Senior Inspector Sarah Chen")}
              </strong>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#E65336] text-white">
                {activeRole.replace("_", " ")}
              </span>
            </div>
          </div>

          {onSwitchPersona && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-400 mr-1 uppercase">Switch Role:</span>
              <button
                type="button"
                onClick={() => onSwitchPersona("SUPER_ADMIN")}
                className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  activeRole === "SUPER_ADMIN"
                    ? "bg-[#E65336] text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                Super Admin
              </button>
              <button
                type="button"
                onClick={() => onSwitchPersona("DEPARTMENT_ADMIN")}
                className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  activeRole === "DEPARTMENT_ADMIN"
                    ? "bg-[#E65336] text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                Dept Admin
              </button>
              <button
                type="button"
                onClick={() => onSwitchPersona("INSPECTOR")}
                className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  activeRole === "INSPECTOR"
                    ? "bg-[#E65336] text-white"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                Field Inspector
              </button>
            </div>
          )}
        </div>

        {/* Executive Governance Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 bg-[#FAF8F5] border-b border-[#D8D2C5]">
          <div className="p-3 bg-white rounded-xl border border-[#D8D2C5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
              1. Inbound AI Triage
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <strong className="text-xl font-bold text-amber-700">{counts.aiVerification}</strong>
              <span className="text-[10px] text-[#687567]">Stage 1 · Reported</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#D8D2C5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
              2. Work Orders Pending
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <strong className="text-xl font-bold text-blue-700">{counts.workOrderPending}</strong>
              <span className="text-[10px] text-[#687567]">Stage 2 · Dept Queue</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#D8D2C5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
              3. Field Crews Active
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <strong className="text-xl font-bold text-indigo-700">{counts.fieldActive}</strong>
              <span className="text-[10px] text-[#687567]">Stage 3 · Restoring</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-[#D8D2C5] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
              4. Awaiting Final Seal
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <strong className="text-xl font-bold text-purple-700">
                {counts.auditPending + counts.executiveCertPending}
              </strong>
              <span className="text-[10px] text-[#687567]">Stage 4/5 · Approvals</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-emerald-300 bg-emerald-50/50 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              5. Certified Fixed
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <strong className="text-xl font-bold text-emerald-800">{counts.certifiedRepaired}</strong>
              <span className="text-[10px] text-emerald-700">✓ Road Certified</span>
            </div>
          </div>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-700" />
              <span>{successToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Role-Specific Triage Queues and Filters */}
        <div className="p-6 space-y-4">
          {/* Queue Tab Buttons based on Active Role */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8D2C5]">
            <div className="flex flex-wrap items-center gap-2">
              {activeRole === "SUPER_ADMIN" && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("all_city")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "all_city"
                        ? "bg-[#242522] text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    All Active City Defects ({counts.allActive})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("ai_verification")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "ai_verification"
                        ? "bg-amber-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 1: AI Triage ({counts.aiVerification})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("work_orders")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "work_orders"
                        ? "bg-blue-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 2: Dept Work Orders ({counts.workOrderPending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("field_active")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "field_active"
                        ? "bg-indigo-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 3: Field Crews ({counts.fieldActive})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("final_certification")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "final_certification"
                        ? "bg-purple-800 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 4 &amp; 5: Executive Seal ({counts.auditPending + counts.executiveCertPending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("critical")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "critical"
                        ? "bg-[#E65336] text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Critical Corridors ({counts.criticalCorridors})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("certified_repaired")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "certified_repaired"
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Certified Repaired ({counts.certifiedRepaired})
                  </button>
                </>
              )}

              {activeRole === "DEPARTMENT_ADMIN" && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("work_orders")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "work_orders"
                        ? "bg-[#242522] text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 2: Work Order Dispatch ({counts.workOrderPending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("dept_audit")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "dept_audit"
                        ? "bg-purple-800 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 4: Quality Audit ({counts.auditPending})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("active_crews")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "active_crews"
                        ? "bg-blue-800 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Active Contractor Crews ({counts.fieldActive})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("certified_repaired")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "certified_repaired"
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Certified Repaired ({counts.certifiedRepaired})
                  </button>
                </>
              )}

              {activeRole === "INSPECTOR" && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("my_assigned")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "my_assigned"
                        ? "bg-[#242522] text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 3: Assigned Work Orders
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("upload_evidence")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "upload_evidence"
                        ? "bg-[#E65336] text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Stage 3/4: Upload Physical Evidence (Matching GPS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQueueTab("completed_jobs")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeQueueTab === "completed_jobs"
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "bg-white text-[#687567] hover:bg-[#F5F1E8] border border-[#D8D2C5]"
                    }`}
                  >
                    Completed Inspections
                  </button>
                </>
              )}
            </div>

            {/* Ward & Search Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#687567]" />
                <input
                  type="text"
                  placeholder="Search tracking #, street..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-[#D8D2C5] bg-white text-xs w-48 focus:outline-none focus:border-[#E65336]"
                />
              </div>

              <select
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D8D2C5] bg-white text-xs font-medium focus:outline-none"
              >
                <option value="all">All Mumbai Wards</option>
                <option value="Ward K/E">Ward K/E (Andheri WEH)</option>
                <option value="Ward H/W">Ward H/W (Bandra)</option>
                <option value="Ward A">Ward A (Marine Drive)</option>
                <option value="Ward G/N">Ward G/N (Dadar)</option>
              </select>

              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#D8D2C5] bg-white text-xs font-medium focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Issue Cards Grid */}
          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {filteredIssues.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-[#D8D2C5] space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                <h3 className="text-sm font-bold text-[#242522]">Queue Clear</h3>
                <p className="text-xs text-[#687567]">
                  No road defects found in this specific municipal queue. All SLA obligations currently fulfilled.
                </p>
              </div>
            ) : (
              filteredIssues.map((issue) => {
                const s = issue.status
                let stageNumber = 1
                let stageName = "Stage 1: Citizen Reported"
                let stageColor = "bg-amber-100 text-amber-900 border-amber-300"

                if (s === "under_review") {
                  stageNumber = 2
                  stageName = "Stage 2: AI Verified (Dept Queue)"
                  stageColor = "bg-blue-100 text-blue-900 border-blue-300"
                } else if (s === "assigned" || s === "in_progress") {
                  stageNumber = 3
                  stageName = s === "assigned" ? "Stage 3: Work Order Dispatched" : "Stage 3: Resurfacing on Site"
                  stageColor = "bg-indigo-100 text-indigo-900 border-indigo-300"
                } else if (s === "repair_completed" || s === "awaiting_verification") {
                  stageNumber = 4
                  stageName = s === "repair_completed" ? "Stage 4: Evidence Uploaded (Pending Audit)" : "Stage 4: Dept Audit Approved"
                  stageColor = "bg-purple-100 text-purple-900 border-purple-300"
                } else if (s === "verified_repaired" || s === "closed") {
                  stageNumber = 5
                  stageName = "Stage 5: Fixed & Certified Safe"
                  stageColor = "bg-emerald-100 text-emerald-900 border-emerald-300"
                }

                return (
                  <div
                    key={issue.id}
                    onClick={() => onSelectIssue(issue)}
                    className="p-4 bg-white rounded-xl border border-[#D8D2C5] hover:border-[#E65336] transition-all shadow-xs hover:shadow-sm cursor-pointer space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#242522] text-xs">
                            #{issue.trackingCode}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${stageColor}`}>
                            {stageName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              issue.severity === "critical"
                                ? "bg-red-500 text-white"
                                : issue.severity === "high"
                                ? "bg-amber-500 text-white"
                                : "bg-neutral-200 text-neutral-800"
                            }`}
                          >
                            {issue.severity}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#FAF8F5] text-[#242522] text-[10px] font-bold border border-[#D8D2C5] uppercase">
                            {issue.category}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#242522] leading-tight">
                          {issue.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#687567]">
                          <MapPin size={12} className="text-[#E65336] shrink-0" />
                          <span>{issue.address}</span>
                          <span>•</span>
                          <span>Ward: {issue.wardName || "Ward K/E Western Express Highway"}</span>
                        </div>
                      </div>

                      {/* Right Action Block */}
                      <div className="flex items-center gap-2">
                        {/* Stage 1 Super Admin Quick Action */}
                        {activeRole === "SUPER_ADMIN" && issue.status === "reported" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === issue.id}
                            onClick={(e) =>
                              handleExecuteQuickAction(
                                e,
                                issue,
                                "VERIFY_REPORT",
                                "AI Computer Vision Detection Confirmed by Super Admin; triaged to Area Ward Department."
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} />
                            <span>Verify AI &amp; Triage</span>
                          </button>
                        )}

                        {/* Stage 2 Dept Admin Quick Action */}
                        {(activeRole === "DEPARTMENT_ADMIN" || activeRole === "SUPER_ADMIN") && issue.status === "under_review" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === issue.id}
                            onClick={(e) =>
                              handleExecuteQuickAction(
                                e,
                                issue,
                                "DISPATCH_WORK_ORDER",
                                "Work Order issued to Municipal Hot-Mix Asphalt Crew 4."
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Wrench size={13} />
                            <span>Dispatch Crew</span>
                          </button>
                        )}

                        {/* Stage 3 Inspector / Crew Quick Action */}
                        {(activeRole === "INSPECTOR" || activeRole === "SUPER_ADMIN") && issue.status === "assigned" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === issue.id}
                            onClick={(e) =>
                              handleExecuteQuickAction(
                                e,
                                issue,
                                "UPDATE_PROGRESS",
                                "Traffic cones deployed. Field milling & resurfacing initiated on site."
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Activity size={13} />
                            <span>Start Resurfacing</span>
                          </button>
                        )}

                        {/* Stage 4 Dept Admin Quick Action */}
                        {activeRole === "DEPARTMENT_ADMIN" && issue.status === "repair_completed" && (
                          <button
                            type="button"
                            disabled={actionLoadingId === issue.id}
                            onClick={(e) =>
                              handleExecuteQuickAction(
                                e,
                                issue,
                                "APPROVE_DEPT_QUALITY",
                                "Chief Marcus Brody approved field asphalt quality and forwarded to Super Admin."
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve Quality</span>
                          </button>
                        )}

                        {/* Stage 5 Super Admin Final Executive Seal */}
                        {activeRole === "SUPER_ADMIN" && (issue.status === "awaiting_verification" || issue.status === "repair_completed") && (
                          <button
                            type="button"
                            disabled={actionLoadingId === issue.id}
                            onClick={(e) =>
                              handleExecuteQuickAction(
                                e,
                                issue,
                                "APPROVE_REPAIR",
                                "Super Admin granted Tier 4 Executive Quality Certification. Pothole permanently resolved."
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} />
                            <span>🏆 Grant Executive Seal</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectIssue(issue)
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#D8D2C5] bg-white hover:bg-[#F5F1E8] text-[#242522] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <span>Manage Workspace</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Metadata Telemetry Footnote */}
                    <div className="pt-2 border-t border-[#D8D2C5]/60 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#687567]">
                      <div className="flex items-center gap-3">
                        <span>Risk Score: <strong className="text-[#242522]">{issue.risk.score}/100</strong></span>
                        <span>Estimated Depth: <strong className="text-[#242522]">{issue.detection?.depthEstimateMm || 60}mm</strong></span>
                        <span>Assigned Crew: <strong className="text-[#242522]">{issue.repair?.assignedCrew || "Hot-Mix Asphalt Crew 1"}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        {issue.status === "repair_completed" || issue.status === "verified_repaired" ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Camera size={11} />
                            <span>Physical Photo Proof Uploaded</span>
                          </span>
                        ) : null}
                        <span>Reported: {new Date(issue.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
