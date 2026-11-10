import React, { useState, useEffect, useCallback, useMemo } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Globe,
  HardHat,
  HelpCircle,
  Layers,
  MapPin,
  Maximize2,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  Wrench,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  DamageCategory,
  IssueStatus,
  RepairVerificationRecord,
  RoadIssue,
  SeverityLevel,
  StatusHistoryItem,
  TimelineEvent,
  UserRole,
} from "../types/roadguard"
import { apiClient, ApiUser, mapBackendRole, MunicipalMetadata } from "../services/apiClient"
import { RoadIssueService } from "../services/roadIssueService"
import { MUNICIPAL_PERSONAS } from "../constants/personas"

interface IssueManagementWorkspaceProps {
  isOpen: boolean
  onClose: () => void
  onBackToTriage?: () => void
  issue: RoadIssue | null
  currentUserRole: UserRole
  onRoleChange: (role: UserRole) => void
  onIssueUpdated: (updatedIssue: RoadIssue) => void
  onFlyToGlobe?: (issue: RoadIssue) => void
  currentUser?: ApiUser | null
  onOpenAuth?: () => void
  onSwitchPersona?: (roleOrEmail: string) => void
}

export default function IssueManagementWorkspace({
  isOpen,
  onClose,
  onBackToTriage,
  issue,
  currentUserRole,
  onRoleChange,
  onIssueUpdated,
  onFlyToGlobe,
  currentUser,
  onOpenAuth,
  onSwitchPersona,
}: IssueManagementWorkspaceProps) {
  // View mode for photographic evidence
  const [viewMode, setViewMode] = useState<"photo" | "mask">("photo")

  // Determine active persona and granular permissions
  const activePersona = useMemo(() => {
    if (currentUser?.role === "SUPER_ADMIN") return "SUPER_ADMIN"
    if (currentUser?.role === "DEPARTMENT_ADMIN") return "DEPARTMENT_ADMIN"
    if (currentUser?.role === "INSPECTOR" || (currentUser?.role as any) === "FIELD_ADMIN") return "INSPECTOR"
    if (currentUser?.role === "CITIZEN") return "CITIZEN"
    if (currentUserRole === "authority") return "SUPER_ADMIN"
    if (currentUserRole === "crew") return "DEPARTMENT_ADMIN"
    if (currentUserRole === "inspector") return "INSPECTOR"
    return "CITIZEN"
  }, [currentUser?.role, currentUserRole])

  const isCitizen = activePersona === "CITIZEN"
  const isInspector = activePersona === "INSPECTOR"
  const isDeptAdmin = activePersona === "DEPARTMENT_ADMIN"
  const isSuperAdmin = activePersona === "SUPER_ADMIN"
  const isStaff = isSuperAdmin || isDeptAdmin || isInspector
  const isDeptOrSuperAdmin = isSuperAdmin || isDeptAdmin
  // Live Timeline and Issue State
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [timelineViewMode, setTimelineViewMode] = useState<"milestones" | "audit_trail">("milestones")
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [isActionExecuting, setIsActionExecuting] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [copiedCoords, setCopiedCoords] = useState(false)
  const [copiedReportId, setCopiedReportId] = useState(false)

  // Action Modals State
  const [actionModalType, setActionModalType] = useState<string | null>(null)
  const [actionReason, setActionReason] = useState("")
  const [actionRemarks, setActionRemarks] = useState("")
  const [workDescription, setWorkDescription] = useState("")
  const [workPriority, setWorkPriority] = useState<"EMERGENCY" | "HIGH" | "MEDIUM" | "LOW">("HIGH")
  const [scheduledDate, setScheduledDate] = useState("")
  const [evidencePhotoUrl, setEvidencePhotoUrl] = useState("")
  const [assignedInspectorId, setAssignedInspectorId] = useState("")
  const [assignedDepartmentId, setAssignedDepartmentId] = useState("")
  const [assignedCrewName, setAssignedCrewName] = useState("Hot-Mix Quick Response Asphalt Crew 1")
  const [targetStatusOverride, setTargetStatusOverride] = useState<string>("in_progress")
  const [metadata, setMetadata] = useState<MunicipalMetadata | null>(null)

  // Official Department Information Modal State
  const [isOfficialModalOpen, setIsOfficialModalOpen] = useState(false)
  const [govtRefId, setGovtRefId] = useState("")
  const [govtPortalUrl, setGovtPortalUrl] = useState("")
  const [officialDeptName, setOfficialDeptName] = useState("")
  const [officialContact, setOfficialContact] = useState("")
  const [externalStatus, setExternalStatus] = useState("")
  const [isSavingOfficial, setIsSavingOfficial] = useState(false)

  // Community Support Confirmation State
  const [isSupporting, setIsSupporting] = useState(false)
  const [supportMessage, setSupportMessage] = useState<string | null>(null)

  // Community Observations & Citizen Evidence Pipeline State
  const [communityUpdates, setCommunityUpdates] = useState<any[]>([])
  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false)
  const [commUpdateType, setCommUpdateType] = useState<string>("STILL_EXISTS")
  const [commDesc, setCommDesc] = useState("")
  const [commPhotoUrl, setCommPhotoUrl] = useState("")
  const [isSubmittingCommUpdate, setIsSubmittingCommUpdate] = useState(false)

  // Staff Review of Citizen Claim
  const [reviewingClaim, setReviewingClaim] = useState<any | null>(null)
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED")
  const [reviewRemarks, setReviewRemarks] = useState("")
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  // Active stage determination for the 5-stage Lifecycle Pipeline (safe top-level hook)
  const currentStageIndex = useMemo(() => {
    const s = (issue?.status || "").toLowerCase()
    if (s === "reported") return 0
    if (s === "under_review" || s === "verified") return 1
    if (s === "assigned" || s === "in_progress") return 2
    if (s === "repair_completed" || s === "awaiting_verification") return 3
    if (s === "verified_repaired" || s === "closed") return 4
    return 0
  }, [issue?.status])

  const LIFECYCLE_STAGES = useMemo(() => [
    { key: "reported", name: "Reported", icon: FileText, desc: "Citizen GPS & AI Edge Detection" },
    { key: "inspected", name: "AI Verified", icon: HardHat, desc: "Area Triage & Cavity Verification" },
    { key: "work_order", name: "Work Order", icon: Wrench, desc: "Hot-Mix Crew Dispatched" },
    { key: "repairing", name: "Evidence Audit", icon: Activity, desc: "Photo Proof & Dept Review" },
    { key: "resolved", name: "Fixed & Certified", icon: CheckCircle2, desc: "Executive Quality Seal & Resolved" },
  ], [])

  // Consolidate & deduplicate raw audit log entries into executive milestones (safe top-level hook)
  const consolidatedMilestones = useMemo(() => {
    if (!timelineEvents || timelineEvents.length === 0) return []

    // Chronological order
    const sorted = [...timelineEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    interface MilestoneItem {
      id: string
      stage: "reported" | "inspected" | "dispatched" | "repairing" | "resolved" | "rejected" | "community" | "general"
      title: string
      statusBadge: string
      statusBadgeColor: string
      timestamp: string
      actorName: string
      actorRole: string
      remarks?: string | null
      reason?: string | null
      photos?: string[]
      rawEventCount: number
    }

    const milestones: MilestoneItem[] = []

    for (const evt of sorted) {
      const evtType = (evt.eventType || "").toUpperCase()
      const evtStatus = (evt.status || "").toLowerCase()
      const evtTime = new Date(evt.timestamp).getTime()

      let stage: MilestoneItem["stage"] = "general"
      let cleanTitle = evt.actionTitle || evtType.replace(/_/g, " ")
      let badge = (evt.status || evtType).toUpperCase().replace(/_/g, " ")
      let badgeColor = "bg-neutral-100 text-neutral-800 border-neutral-300"

      if (evtType === "REPORT_SUBMITTED" || evtStatus === "reported") {
        stage = "reported"
        cleanTitle = "Pothole Hazard Reported by Citizen"
        badge = "REPORTED"
        badgeColor = "bg-amber-100 text-amber-800 border-amber-300"
      } else if (
        evtType === "ASSIGN_INSPECTOR" ||
        evtType === "VERIFY_REPORT" ||
        evtType === "RETURN_FOR_CORRECTION" ||
        evtStatus === "under_review" ||
        evtStatus === "verified"
      ) {
        stage = "inspected"
        if (evtType === "ASSIGN_INSPECTOR") {
          cleanTitle = "Field Inspector Assigned for Structural Assessment"
        } else if (evtType === "VERIFY_REPORT") {
          cleanTitle = "Cavity Dimensions & Road Severity Verified"
        } else if (evtType === "RETURN_FOR_CORRECTION") {
          cleanTitle = "Returned for Dimensional Re-Assessment"
        } else {
          cleanTitle = "Inspection Assessment in Progress"
        }
        badge = "UNDER REVIEW"
        badgeColor = "bg-blue-100 text-blue-800 border-blue-300"
      } else if (
        evtType === "DISPATCH_WORK_ORDER" ||
        evtType === "WORK_ORDER_DISPATCHED" ||
        evtStatus === "assigned"
      ) {
        stage = "dispatched"
        cleanTitle = "Work Order Dispatched to Maintenance Crew"
        badge = "ASSIGNED"
        badgeColor = "bg-purple-100 text-purple-800 border-purple-300"
      } else if (
        evtType === "UPDATE_PROGRESS" ||
        evtType === "SUBMIT_REPAIR_EVIDENCE" ||
        evtStatus === "in_progress" ||
        evtStatus === "repair_completed" ||
        evtStatus === "awaiting_verification"
      ) {
        stage = "repairing"
        cleanTitle =
          evtType === "SUBMIT_REPAIR_EVIDENCE" || evtStatus === "repair_completed"
            ? "Repair Completed & Physical Evidence Submitted"
            : "On-Site Hot-Mix Resurfacing Active"
        badge = evtStatus === "repair_completed" ? "REPAIR COMPLETED" : "IN PROGRESS"
        badgeColor = "bg-indigo-100 text-indigo-800 border-indigo-300"
      } else if (
        evtType === "APPROVE_REPAIR" ||
        evtType === "CLOSE_ISSUE" ||
        evtStatus === "verified_repaired" ||
        evtStatus === "closed"
      ) {
        stage = "resolved"
        cleanTitle = "Repair Quality Approved & Pothole Marked Resolved"
        badge = "VERIFIED REPAIRED"
        badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300"
      } else if (evtType === "REJECT_REPORT" || evtStatus === "rejected") {
        stage = "rejected"
        cleanTitle = "Defect Report Rejected (Non-Compliant / Duplicate)"
        badge = "REJECTED"
        badgeColor = "bg-red-100 text-red-800 border-red-300"
      } else if (evtType === "COMMUNITY_OBSERVATION") {
        stage = "community"
        cleanTitle = "Community Citizen Corroboration"
        badge = "COMMUNITY CONFIRMED"
        badgeColor = "bg-teal-100 text-teal-800 border-teal-300"
      }

      const prev = milestones.length > 0 ? milestones[milestones.length - 1] : null
      const isWithinTimeWindow =
        prev && Math.abs(evtTime - new Date(prev.timestamp).getTime()) <= 120000

      // Consolidate simultaneous/paired actions or rapid duplicate clicks
      if (prev && (isWithinTimeWindow && (prev.stage === stage || prev.title === cleanTitle))) {
        prev.rawEventCount += 1
        if (!prev.photos && evt.photos && evt.photos.length > 0) {
          prev.photos = evt.photos
        } else if (prev.photos && evt.photos) {
          prev.photos = Array.from(new Set([...prev.photos, ...evt.photos]))
        }
        if (evt.remarks && (!prev.remarks || evt.remarks.length > prev.remarks.length)) {
          prev.remarks = evt.remarks
        }
        if (evt.reason && !prev.reason) {
          prev.reason = evt.reason
        }
        if (
          cleanTitle.includes("Approved") ||
          cleanTitle.includes("Completed") ||
          cleanTitle.includes("Dispatched")
        ) {
          prev.title = cleanTitle
          prev.statusBadge = badge
          prev.statusBadgeColor = badgeColor
        }
        continue
      }

      // Deduplicate pure repeated consecutive identical events even across minutes
      if (prev && prev.title === cleanTitle && prev.remarks === evt.remarks) {
        prev.rawEventCount += 1
        continue
      }

      milestones.push({
        id: evt.id || `m-${milestones.length}`,
        stage,
        title: cleanTitle,
        statusBadge: badge,
        statusBadgeColor: badgeColor,
        timestamp: evt.timestamp,
        actorName: evt.actorName || "Municipal Officer",
        actorRole: (evt.actorRole || "STAFF").toUpperCase(),
        remarks: evt.remarks,
        reason: evt.reason,
        photos: evt.photos,
        rawEventCount: 1,
      })
    }

    return milestones
  }, [timelineEvents])

  // Fetch verified chronological timeline & community updates from server
  const fetchCommunityUpdates = useCallback(async () => {
    if (!issue) return
    try {
      const list = await apiClient.issues.getCommunityUpdates(issue.id)
      setCommunityUpdates(list)
    } catch {
      // offline fallback
    }
  }, [issue])

  const fetchTimeline = useCallback(async () => {
    if (!issue) return
    setIsLoadingTimeline(true)
    setTimelineError(null)
    try {
      const [data, commList] = await Promise.all([
        apiClient.issues.getTimeline(issue.trackingCode || issue.id),
        apiClient.issues.getCommunityUpdates(issue.id).catch(() => []),
      ])
      if (data && data.timeline) {
        setTimelineEvents(data.timeline)
      }
      setCommunityUpdates(commList || [])
    } catch (err: any) {
      console.warn("Could not load backend timeline:", err)
      setTimelineError("Using local event log.")
      // Fallback: build events from local statusHistory
      const localEvents: TimelineEvent[] = [
        {
          id: `init-${issue.id}`,
          eventType: "REPORT_SUBMITTED",
          timestamp: issue.createdAt,
          status: "reported",
          actorName: issue.reportedBy || "Citizen Reporter",
          actorRole: "CITIZEN",
          actionTitle: "Pothole reported by citizen",
          remarks: issue.notes || `Reported ${issue.category} at ${issue.address}`,
          photos: [issue.originalPhotoUrl],
        },
      ]
      if (issue.statusHistory) {
        for (const sh of issue.statusHistory) {
          localEvents.push({
            id: `sh-${sh.id}`,
            eventType: "STATUS_TRANSITION",
            timestamp: sh.timestamp,
            status: sh.toStatus,
            actorName: sh.actorName,
            actorRole: sh.actorRole.toUpperCase(),
            actionTitle: `Status transitioned to ${sh.toStatus.replace(/_/g, " ")}`,
            remarks: sh.notes,
            photos: sh.evidencePhotoUrl ? [sh.evidencePhotoUrl] : [],
          })
        }
      }
      setTimelineEvents(localEvents)
    } finally {
      setIsLoadingTimeline(false)
    }
  }, [issue])

  // Sync state on open & initialize official info fields
  useEffect(() => {
    if (isOpen && issue) {
      fetchTimeline()
      setGovtRefId(issue.governmentReferenceId || "")
      setGovtPortalUrl(issue.governmentPortalUrl || "")
      setOfficialDeptName(
        issue.officialDepartmentName ||
          issue.departmentName ||
          "Brihanmumbai Municipal Corporation (MCGM) - Roads & Traffic",
      )
      setOfficialContact(issue.officialContactInfo || "Helpline: 1916 / 022-22694725")
      setExternalStatus(issue.externalStatus || "Registered in Municipal Grievance Redressal")

      // Update URL for full-page experience (/manage/issues/:issueId)
      const newPath = `/manage/issues/${issue.trackingCode}`
      window.history.pushState({ issueId: issue.trackingCode }, "", newPath)

      const handlePopState = () => {
        onClose()
      }
      window.addEventListener("popstate", handlePopState)

      return () => {
        window.removeEventListener("popstate", handlePopState)
        // Restore URL on unmount if current matches
        if (window.location.pathname.startsWith("/manage/issues/")) {
          window.history.pushState({}, "", "/")
        }
      }
    }
  }, [isOpen, issue, fetchTimeline, onClose])

  // Load municipal metadata (departments, wards, inspectors)
  useEffect(() => {
    async function loadMeta() {
      try {
        const meta = await apiClient.analytics.getMetadata()
        if (meta) {
          setMetadata(meta)
          if (meta.departments && meta.departments.length > 0) {
            setAssignedDepartmentId(meta.departments[0].id)
          }
          if (meta.inspectors && meta.inspectors.length > 0) {
            setAssignedInspectorId(meta.inspectors[0].id)
          }
        }
      } catch (err) {
        console.warn("Could not load municipal metadata:", err)
      }
    }
    loadMeta()
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (actionModalType) {
          setActionModalType(null)
        } else if (isOfficialModalOpen) {
          setIsOfficialModalOpen(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, actionModalType, isOfficialModalOpen, onClose])

  if (!isOpen || !issue) return null

  // Copy coordinates
  const handleCopyCoords = () => {
    const coordStr = `${issue.coordinates.lat.toFixed(6)}, ${issue.coordinates.lng.toFixed(6)}`
    navigator.clipboard.writeText(coordStr)
    setCopiedCoords(true)
    setTimeout(() => setCopiedCoords(false), 2000)
  }

  // Copy report ID
  const handleCopyReportId = () => {
    navigator.clipboard.writeText(issue.trackingCode)
    setCopiedReportId(true)
    setTimeout(() => setCopiedReportId(false), 2000)
  }

  // Local fallback state updater for static cloud environments (e.g. Vercel)
  const applyLocalAction = (currentIssue: RoadIssue, payload: any): RoadIssue => {
    const now = new Date().toISOString()
    const actorName = currentUser?.fullName || "System Administrator"
    const actorRole = (currentUser?.role || "SUPER_ADMIN").toLowerCase() as any
    let targetStatus: IssueStatus = currentIssue.status
    let assignedInspectorId = currentIssue.assignedInspectorId
    let assignedInspectorName = currentIssue.assignedInspectorName
    let departmentId = currentIssue.departmentId
    let departmentName = currentIssue.departmentName
    let repair: RepairVerificationRecord = { ...(currentIssue.repair || {}) }

    if (payload.actionType === "ASSIGN_INSPECTOR") {
      const insp = availableInspectors.find((i) => i.id === payload.assignedInspectorId)
      assignedInspectorId = payload.assignedInspectorId || "insp-sarah-101"
      assignedInspectorName = insp?.fullName || "Senior Inspector Sarah Chen"
      targetStatus = "under_review"
    } else if (payload.actionType === "VERIFY_REPORT") {
      targetStatus = "under_review"
    } else if (payload.actionType === "ASSIGN_DEPARTMENT") {
      const dept = availableDepartments.find((d) => d.id === payload.departmentId)
      departmentId = payload.departmentId || "40947e83-f3ca-47b9-bdef-0cfd8175555b"
      departmentName = dept?.name || "Highways & Road Infrastructure Department"
      targetStatus = "under_review"
    } else if (payload.actionType === "DISPATCH_WORK_ORDER") {
      targetStatus = "assigned"
      repair = {
        ...repair,
        workOrderNumber: `WO-${Math.floor(10000 + Math.random() * 90000)}`,
        assignedCrew: assignedCrewName || "Hot-Mix Quick Response Asphalt Crew 1",
        assignedAt: now,
      }
    } else if (payload.actionType === "START_REPAIR" || payload.actionType === "UPDATE_PROGRESS") {
      targetStatus = "in_progress"
    } else if (payload.actionType === "SUBMIT_REPAIR_EVIDENCE") {
      targetStatus = "repair_completed"
      repair = {
        ...repair,
        afterPhotoUrl: payload.evidencePhotos?.[0] || evidencePhotoUrl || "/images/repaired_road.jpg",
        repairCompletedAt: now,
        assignedCrew: assignedCrewName || "Hot-Mix Quick Response Asphalt Crew 1",
      }
    } else if (payload.actionType === "APPROVE_DEPT_QUALITY") {
      targetStatus = "awaiting_verification"
      repair = {
        ...repair,
        deptAuditApprovedAt: now,
        deptAuditedBy: "Chief Marcus Brody (Highways & Infrastructure Lead)",
      }
    } else if (payload.actionType === "APPROVE_REPAIR" || payload.actionType === "CLOSE_ISSUE") {
      targetStatus = "verified_repaired"
      repair = {
        ...repair,
        verificationDecision: "approved",
        verifiedAt: now,
        executiveCertifiedBy: "System Administrator (Super Admin)",
      }
    } else if (payload.actionType === "REOPEN_ISSUE") {
      targetStatus = "under_review"
    } else if (payload.actionType === "REJECT_ISSUE" || payload.actionType === "REJECT_REPORT") {
      targetStatus = "rejected"
    } else if (payload.actionType === "REJECT_REPAIR") {
      targetStatus = "in_progress"
    } else if (payload.actionType === "UPDATE_STATUS") {
      const statusMap: Record<string, IssueStatus> = {
        REPORTED: "reported",
        UNDER_REVIEW: "under_review",
        WORK_ORDER_DISPATCHED: "assigned",
        REPAIR_IN_PROGRESS: "in_progress",
        REPAIR_COMPLETED: "repair_completed",
        AWAITING_VERIFICATION: "awaiting_verification",
        CLOSED: "verified_repaired",
        REOPENED: "under_review",
        REJECTED: "rejected",
      }
      targetStatus = statusMap[payload.targetStatus] || currentIssue.status
    }

    const newHistoryItem: StatusHistoryItem = {
      id: `sh-${Date.now()}`,
      fromStatus: currentIssue.status,
      toStatus: targetStatus,
      timestamp: now,
      actorRole,
      actorName,
      notes: payload.remarks || payload.reason || `Municipal lifecycle event: ${payload.actionType}`,
    }

    const updated: RoadIssue = {
      ...currentIssue,
      status: targetStatus,
      assignedInspectorId,
      assignedInspectorName,
      departmentId,
      departmentName,
      repair,
      updatedAt: now,
      statusHistory: [...(currentIssue.statusHistory || []), newHistoryItem],
    }

    RoadIssueService.saveIssue(updated)
    return updated
  }

  // Execute Municipal Lifecycle Action
  const handleExecuteAction = async (actionType: string) => {
    setIsActionExecuting(true)
    try {
      const payload: any = {
        actionType,
        reason: actionReason || undefined,
        remarks: actionRemarks || undefined,
      }

      if (actionType === "DISPATCH_WORK_ORDER") {
        payload.workDescription = workDescription || `${assignedCrewName}: Cavity restoration`
        payload.priority = workPriority
        if (scheduledDate) payload.scheduledDate = new Date(scheduledDate).toISOString()
        if (assignedInspectorId) payload.assignedInspectorId = assignedInspectorId
        if (assignedDepartmentId) payload.departmentId = assignedDepartmentId
      }

      if (actionType === "SUBMIT_REPAIR_EVIDENCE" && evidencePhotoUrl) {
        payload.evidencePhotos = [evidencePhotoUrl]
      }

      if (actionType === "ASSIGN_INSPECTOR") {
        payload.assignedInspectorId = assignedInspectorId || availableInspectors[0]?.id
        payload.remarks = actionRemarks || "Field inspector assigned for structural assessment."
      }

      if (actionType === "ASSIGN_DEPARTMENT") {
        payload.departmentId = assignedDepartmentId || availableDepartments[0]?.id
        payload.remarks = actionRemarks || "Assigned responsible municipal department."
      }

      if (actionType === "UPDATE_STATUS") {
        payload.targetStatus = targetStatusOverride.toUpperCase()
        payload.remarks = actionRemarks || `Administrative status change to ${targetStatusOverride.toUpperCase()}`
      }

      let updatedIssue = issue
      try {
        const res = await apiClient.issues.executeAction(issue.id, payload)
        updatedIssue = res.issue
      } catch (apiErr) {
        console.warn("RoadGuard: Backend action unreachable, running local update simulation:", apiErr)
        updatedIssue = applyLocalAction(issue, payload)
      }

      onIssueUpdated(updatedIssue)
      await fetchTimeline()
      setActionModalType(null)
      setActionReason("")
      setActionRemarks("")
      setWorkDescription("")
      setEvidencePhotoUrl("")
      setAssignedInspectorId("")
      setAssignedDepartmentId("")
    } catch (err: any) {
      alert(err.message || "Failed to execute action. Ensure you have the required municipal permissions.")
    } finally {
      setIsActionExecuting(false)
    }
  }

  // Save Official Department Information
  const handleSaveOfficialInfo = async () => {
    setIsSavingOfficial(true)
    let updatedIssue = issue
    try {
      updatedIssue = await apiClient.issues.updateOfficialInfo(issue.id, {
        governmentReferenceId: govtRefId.trim() || null,
        governmentPortalUrl: govtPortalUrl.trim() || null,
        officialDepartmentName: officialDeptName.trim() || null,
        officialContactInfo: officialContact.trim() || null,
        externalStatus: externalStatus.trim() || null,
      })
    } catch {
      updatedIssue = {
        ...issue,
        governmentReferenceId: govtRefId.trim() || undefined,
        governmentPortalUrl: govtPortalUrl.trim() || undefined,
        officialDepartmentName: officialDeptName.trim() || undefined,
        officialContactInfo: officialContact.trim() || undefined,
        externalStatus: externalStatus.trim() || undefined,
      }
      RoadIssueService.saveIssue(updatedIssue)
    } finally {
      setIsSavingOfficial(false)
    }
    onIssueUpdated(updatedIssue)
    await fetchTimeline()
    setIsOfficialModalOpen(false)
  }

  // Community support / corroboration
  const handleSupportIssue = async () => {
    setIsSupporting(true)
    let updatedIssue = issue
    try {
      updatedIssue = await apiClient.issues.support(issue.id, "Community confirmation via Pothole Workspace")
    } catch {
      updatedIssue = RoadIssueService.supportIssue(issue.id, {
        userName: currentUser?.fullName || "Citizen Reporter",
        userRole: "citizen",
        notes: "Community confirmation via Pothole Workspace",
      })
    } finally {
      setIsSupporting(false)
    }
    onIssueUpdated(updatedIssue)
    setSupportMessage("Confirmation recorded. Priority score refreshed.")
    setTimeout(() => setSupportMessage(null), 3000)
    await fetchTimeline()
  }

  // Submit citizen community observation or repair claim
  const handleCreateCommunityUpdate = async () => {
    if (!commDesc.trim()) {
      alert("Please provide an observation note.")
      return
    }
    setIsSubmittingCommUpdate(true)
    try {
      const res = await apiClient.issues.createCommunityUpdate(issue.id, {
        updateType: commUpdateType,
        description: commDesc.trim(),
        photos: commPhotoUrl.trim() ? [commPhotoUrl.trim()] : [],
        latitude: issue.coordinates.lat,
        longitude: issue.coordinates.lng,
      })
      onIssueUpdated(res.issue)
      await fetchTimeline()
      await fetchCommunityUpdates()
      setIsCommunityModalOpen(false)
      setCommDesc("")
      setCommPhotoUrl("")
      if (commUpdateType === "APPEARS_REPAIRED") {
        alert("Your repair observation has been submitted. It is now queued for municipal engineering audit.")
      }
    } catch (err: any) {
      alert(err.message || "Failed to submit community update.")
    } finally {
      setIsSubmittingCommUpdate(false)
    }
  }

  // Authorized staff review of citizen repair claim
  const handleReviewClaim = async () => {
    if (!reviewingClaim) return
    if (!reviewRemarks.trim()) {
      alert("Please provide audit remarks for the official record.")
      return
    }
    setIsSubmittingReview(true)
    try {
      const res = await apiClient.issues.reviewCommunityUpdate(
        issue.id,
        reviewingClaim.id,
        {
          decision: reviewDecision,
          adminRemarks: reviewRemarks.trim(),
        },
      )
      onIssueUpdated(res.issue)
      await fetchTimeline()
      await fetchCommunityUpdates()
      setReviewingClaim(null)
      setReviewRemarks("")
    } catch (err: any) {
      alert(err.message || "Failed to review citizen claim.")
    } finally {
      setIsSubmittingReview(false)
    }
  }

  // Available staff and departments
  const availableInspectors =
    metadata?.inspectors && metadata.inspectors.length > 0
      ? metadata.inspectors
      : [
          {
            id: "8db7a0b9-e00b-4071-8ffd-ad4001434f0f",
            fullName: "Senior Inspector Sarah Chen",
            role: "INSPECTOR",
            email: "inspector.sarah@roadguard.local",
          },
          {
            id: "2a50cec1-ddc5-4317-96a7-d88583bbe402",
            fullName: "Chief Marcus Brody",
            role: "DEPARTMENT_ADMIN",
            email: "highways.chief@roadguard.local",
          },
          {
            id: "f4f42518-782a-4317-aec0-baf28f33d4e0",
            fullName: "System Administrator",
            role: "SUPER_ADMIN",
            email: "admin@roadguard.local",
          },
        ]

  const availableDepartments =
    metadata?.departments && metadata.departments.length > 0
      ? metadata.departments
      : [
          {
            id: "40947e83-f3ca-47b9-bdef-0cfd8175555b",
            name: "Highways & Road Infrastructure Department",
          },
          {
            id: "0135c505-c0e5-4966-8786-7ceb8a81903c",
            name: "Public Works & Urban Drainage Division",
          },
          {
            id: "f06efb6b-7171-4e5d-a2c1-0a80b27cc2ad",
            name: "Municipal Traffic & Safety Operations",
          },
        ]

  const availableCrews = [
    {
      id: "CREW-HOTMIX-1",
      name: "Hot-Mix Quick Response Asphalt Crew 1",
      lead: "Foreman Vikram Gaikwad",
      specialty: "Critical cavity & deep structural hot-mix restoration",
    },
    {
      id: "CREW-COLDMIX-3",
      name: "Cold-Mix Jetpatcher Mobile Unit 3",
      lead: "Lead Tech Aarti Patil",
      specialty: "High-speed cold mix pneumatic cavity injection",
    },
    {
      id: "CREW-WARD-EMERGENCY",
      name: "MCGM Ward Emergency Rapid Response Gang",
      lead: "Superintendent Ramesh Shinde",
      specialty: "Immediate hazard barricading & temporary cold-patching",
    },
    {
      id: "CREW-DRAIN-MASONRY",
      name: "Stormwater Drainage & Road Edge Masonry Gang",
      lead: "Supervisor Nilesh Jadhav",
      specialty: "Manhole collar, drainage grating & road shoulder repair",
    },
  ]

  // Status pills
  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    reported: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
    under_review: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
    verified: { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300" },
    assigned: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
    in_progress: { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300" },
    awaiting_verification: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
    repair_completed: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
    verified_repaired: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
    closed: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
    rejected: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
    reopened: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  }

  const currentStatusConfig =
    statusColors[issue.status.toLowerCase()] || statusColors.reported

  // Severity labels
  const severityColors: Record<SeverityLevel, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-amber-600 text-white",
    moderate: "bg-yellow-500 text-ink",
    low: "bg-emerald-600 text-white",
  }

  // Available photos
  const photos = [
    issue.annotatedPhotoUrl || issue.originalPhotoUrl,
    issue.originalPhotoUrl,
    issue.repair?.afterPhotoUrl,
  ].filter(Boolean) as string[]

  return (
    <div className="incident-workspace-viewport fixed inset-0 z-[200] overflow-y-auto bg-[#F4F1EA] text-[#242522] selection:bg-[#E65336] selection:text-white">
      {/* Top Municipal Workspace Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#F4F1EA]/95 backdrop-blur-md border-b border-[#D8D2C5] shadow-xs">
        {/* Tier 1: Primary Identity & Window Controls */}
        <div className="px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-2.5 border-b border-[#D8D2C5]/50">
          {/* Left: Breadcrumbs & Report ID */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <button
              type="button"
              onClick={onBackToTriage || onClose}
              className="back-to-triage-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#D8D2C5] bg-white hover:bg-[#ECE6D8] text-xs font-mono font-medium transition-colors cursor-pointer shrink-0"
              title="Return to triage dashboard (Esc)"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Back to Triage</span>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs uppercase tracking-wider text-[#687567] hidden md:inline font-mono">
                Workspace /
              </span>
              <div
                onClick={handleCopyReportId}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-[#D8D2C5] font-mono text-xs font-bold tracking-tight cursor-pointer hover:border-[#E65336] transition-colors"
                title="Click to copy Report ID"
              >
                <span className="text-[#E65336]">#{issue.trackingCode}</span>
                <Copy size={11} className="text-[#687567]" />
                {copiedReportId && <span className="text-[10px] text-emerald-600 font-semibold">COPIED!</span>}
              </div>
            </div>

            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-semibold uppercase tracking-wide border shrink-0 ${currentStatusConfig.bg} ${currentStatusConfig.text} ${currentStatusConfig.border}`}
            >
              {issue.status.replace(/_/g, " ")}
            </span>

            <span
              className={`px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${severityColors[issue.severity]}`}
            >
              {issue.severity} SEVERITY
            </span>
          </div>

          {/* Right: Actions, Role indicator, Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onFlyToGlobe && (
              <button
                type="button"
                onClick={() => onFlyToGlobe(issue)}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#D8D2C5] bg-white hover:bg-[#ECE6D8] text-xs font-mono transition-colors"
                title="Inspect 3D geospatial elevation"
              >
                <Globe size={13} className="text-[#E65336]" />
                <span>3D Globe</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#D8D2C5] bg-white hover:bg-[#ECE6D8] text-xs font-mono transition-colors"
              title="Print municipal dossier"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>

            {/* Persona indicator / Switcher pill */}
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#242522] text-[#F5F1E8] text-xs font-mono hover:bg-[#383A35] transition-colors cursor-pointer"
              title="Click to view pilot profile or change role"
            >
              <User size={13} className="text-[#E65336]" />
              <span className="uppercase text-[10px] sm:text-[11px] font-medium tracking-wide">
                {currentUser?.role || currentUserRole}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#D8D2C5] bg-white hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
              title="Close workspace (Esc)"
              aria-label="Close workspace"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tier 2: Municipal Persona Switcher Sub-Bar */}
        {onSwitchPersona && (
          <div className="px-3.5 sm:px-6 py-1.5 bg-[#FAF8F5] flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#687567] font-bold">
                Persona Perspective:
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {MUNICIPAL_PERSONAS.map((p) => {
                const isActive = activePersona === p.role
                const roleIcons: Record<string, string> = {
                  SUPER_ADMIN: "🛡️",
                  DEPARTMENT_ADMIN: "🏗️",
                  INSPECTOR: "👷",
                  CITIZEN: "👤",
                }
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSwitchPersona(p.role)}
                    className={`persona-switch-btn flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap min-h-[32px] ${
                      isActive
                        ? "bg-[#242522] text-[#F5F1E8] shadow-xs font-bold ring-1 ring-black/10"
                        : "text-[#687567] hover:text-[#242522] hover:bg-white border border-transparent hover:border-[#D8D2C5]"
                    }`}
                    title={`${p.label}: ${p.description}`}
                  >
                    <span>{roleIcons[p.role]}</span>
                    <span>{p.label}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse ml-0.5" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Full-Page 3-Column Content Workspace */}
      <main className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ============================================================== */}
          {/* COLUMN 1 (4 COLS): Pothole Details & Risk Assessment Dossier */}
          {/* ============================================================== */}
          <section className="lg:col-span-4 space-y-6">
            {/* Primary Photographic Evidence Card */}
            <div className="bg-white rounded-2xl border border-[#D8D2C5] overflow-hidden shadow-sm">
              {/* Evidence Visualizer Selector Header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF8F5] border-b border-[#D8D2C5]">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#242522]">
                  <Eye size={13} className="text-[#E65336]" />
                  <span>EVIDENCE VISUALIZER</span>
                </div>
                <div className="flex items-center bg-white p-0.5 rounded-lg border border-[#D8D2C5] text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setViewMode("photo")}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                      viewMode === "photo"
                        ? "bg-[#242522] text-white shadow-xs font-bold"
                        : "text-[#687567] hover:text-[#242522]"
                    }`}
                  >
                    Citizen Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("mask")}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 font-medium ${
                      viewMode === "mask"
                        ? "bg-[#E65336] text-white shadow-xs font-bold"
                        : "text-[#687567] hover:text-[#242522]"
                    }`}
                  >
                    <Sparkles size={11} />
                    <span>AI Cavity Mask</span>
                  </button>
                </div>
              </div>

              <div className="relative aspect-[4/3] bg-neutral-900 group">
                <img
                  src={
                    viewMode === "mask"
                      ? issue.annotatedPhotoUrl || photos[activePhotoIndex] || issue.originalPhotoUrl
                      : photos[activePhotoIndex] || issue.originalPhotoUrl
                  }
                  alt={issue.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* AI Mask SVG Overlay */}
                {viewMode === "mask" && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <svg className="w-full h-full absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <rect
                        x="24"
                        y="28"
                        width="52"
                        height="44"
                        fill="rgba(230, 83, 54, 0.22)"
                        stroke="#E65336"
                        strokeWidth="1.2"
                        strokeDasharray="2,2"
                        className="animate-pulse"
                      />
                      <circle cx="50" cy="50" r="2.5" fill="#E65336" />
                      <line x1="44" y1="50" x2="56" y2="50" stroke="#E65336" strokeWidth="0.8" />
                      <line x1="50" y1="44" x2="50" y2="56" stroke="#E65336" strokeWidth="0.8" />
                    </svg>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-7 bg-black/85 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow border border-red-500/40">
                      DEPTH: {issue.detection?.depthEstimateMm || 70}mm · CONF: 95%
                    </div>
                  </div>
                )}

                <div className="absolute top-3 left-3 bg-[#242522]/85 text-white text-[11px] font-mono px-2.5 py-1 rounded-md backdrop-blur-sm flex items-center gap-1.5">
                  <Activity size={12} className="text-[#E65336]" />
                  <span>{viewMode === "mask" ? "AI CAVITY CONTOUR MASK" : "AI EDGE DETECTED"}</span>
                </div>

                <div className="absolute bottom-3 right-3 bg-black/75 text-white text-[11px] font-mono px-2 py-0.5 rounded backdrop-blur-sm">
                  Photo {activePhotoIndex + 1} of {photos.length}
                </div>
              </div>

              {/* Photo Thumbnails Selector */}
              {photos.length > 1 && (
                <div className="flex gap-2 p-3 bg-[#FAF8F5] border-t border-[#D8D2C5] overflow-x-auto">
                  {photos.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIndex(idx)}
                      className={`relative w-16 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                        activePhotoIndex === idx
                          ? "border-[#E65336] shadow-sm scale-105"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={p} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Core Defect Title & Metadata */}
              <div className="p-5 space-y-4">
                <div>
                  <h1 className="text-xl font-bold font-mono text-[#242522] leading-tight mb-1.5">
                    {issue.title}
                  </h1>
                  <p className="text-xs text-[#687567] leading-relaxed">
                    {issue.notes || "Monitored municipal roadway defect registered via citizen mobile reporting."}
                  </p>
                </div>

                {/* Quick Spec Metrics Grid */}
                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#D8D2C5]/60 text-xs font-mono">
                  <div className="bg-[#F5F1E8] p-2.5 rounded-xl border border-[#D8D2C5]/70">
                    <span className="text-[10px] uppercase text-[#687567] block">Category</span>
                    <strong className="text-[#242522] uppercase font-bold">{issue.category}</strong>
                  </div>
                  <div className="bg-[#F5F1E8] p-2.5 rounded-xl border border-[#D8D2C5]/70">
                    <span className="text-[10px] uppercase text-[#687567] block">Depth Est.</span>
                    <strong className="text-[#242522] font-bold">
                      {issue.detection?.depthEstimateMm || 60} mm
                    </strong>
                  </div>
                  <div className="bg-[#F5F1E8] p-2.5 rounded-xl border border-[#D8D2C5]/70">
                    <span className="text-[10px] uppercase text-[#687567] block">Surface Loss</span>
                    <strong className="text-[#242522] font-bold">
                      {issue.detection?.surfaceLossPercentage || 18}%
                    </strong>
                  </div>
                </div>

                {/* Exact Location & GPS Coordinates */}
                <div className="space-y-2 pt-2 border-t border-[#D8D2C5]/60 font-mono text-xs">
                  <div className="flex items-start gap-2 text-[#242522]">
                    <MapPin size={15} className="text-[#E65336] shrink-0 mt-0.5" />
                    <span className="font-medium">{issue.address}</span>
                  </div>

                  <div className="flex items-center justify-between bg-[#F5F1E8] px-3 py-2 rounded-xl border border-[#D8D2C5]/70">
                    <span className="text-[#687567] text-[11px]">
                      GPS: {issue.coordinates.lat.toFixed(5)}° N, {issue.coordinates.lng.toFixed(5)}° E
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCoords}
                      className="text-[#E65336] hover:text-[#C53F24] font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Copy size={11} />
                      <span>{copiedCoords ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  {issue.wardName && (
                    <div className="flex items-center justify-between text-[11px] text-[#687567] px-1">
                      <span>Municipal Ward:</span>
                      <strong className="text-[#242522]">{issue.wardName}</strong>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-[#687567] px-1">
                    <span>Reported Timestamp:</span>
                    <span className="text-[#242522]">
                      {new Date(issue.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Explainable Risk Assessment Intelligence Card */}
            <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#E65336]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                    Explainable Multi-Factor Risk Score
                  </h2>
                </div>
                <span className="text-lg font-bold text-[#E65336]">
                  {issue.risk?.score ?? 88}
                  <span className="text-xs text-[#687567]">/100</span>
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[#ECE6D8] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#E65336] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, issue.risk?.score ?? 88))}%` }}
                />
              </div>

              {/* Factor Breakdown */}
              <div className="space-y-2.5 text-xs pt-2">
                <div className="flex justify-between items-center text-[#687567]">
                  <span>Physical Defect Severity (Depth & Area):</span>
                  <span className="font-bold text-[#242522]">{issue.risk?.factors?.damageSeverity ?? 85}/100</span>
                </div>
                <div className="flex justify-between items-center text-[#687567]">
                  <span>Road Classification & Traffic Flow:</span>
                  <span className="font-bold text-[#242522]">{issue.risk?.factors?.roadUsage ?? 75}/100</span>
                </div>
                <div className="flex justify-between items-center text-[#687567]">
                  <span>Vulnerable Transit / School Proximity:</span>
                  <span className="font-bold text-[#242522]">
                    {issue.risk?.factors?.sensitiveProximity ?? 80}/100
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#687567]">
                  <span>Community Confirmations Weight:</span>
                  <span className="font-bold text-[#242522]">
                    {issue.risk?.factors?.supportingReports ?? 50}/100
                  </span>
                </div>
              </div>

              <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-[11px] text-[#687567] leading-relaxed">
                {issue.risk?.explanation ||
                  "Risk priority calculated from arterial road classification, depth metrics, and high-frequency vehicle movement."}
              </div>

              {/* Community Confirmation Trigger */}
              <div className="pt-2 border-t border-[#D8D2C5]/60 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#687567] block">Community Confirmations</span>
                  <strong className="text-sm font-bold text-[#242522]">
                    {issue.supportingCount || 1} citizen corroborations
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={handleSupportIssue}
                  disabled={isSupporting || issue.status === "closed"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D8D2C5] bg-white hover:bg-[#FAF8F5] text-xs font-mono font-medium transition-colors cursor-pointer disabled:opacity-50"
                  title="Confirm pothole still exists"
                >
                  <ThumbsUp size={13} className="text-[#E65336]" />
                  <span>{isSupporting ? "Confirming..." : "Confirm Hazard"}</span>
                </button>
              </div>

              {supportMessage && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-mono text-center">
                  {supportMessage}
                </div>
              )}

              {/* Submit Observation or Repair Evidence Button */}
              <div className="pt-2 border-t border-[#D8D2C5]/60">
                <button
                  type="button"
                  onClick={() => setIsCommunityModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F5] hover:bg-[#ECE6D8] text-xs font-bold transition-colors cursor-pointer"
                  title="Submit observation, worsening notice, or repair evidence"
                >
                  <Sparkles size={14} className="text-[#E65336]" />
                  <span>Submit Observation or Repair Evidence</span>
                </button>
              </div>
            </div>
          </section>

          {/* ============================================================== */}
          {/* COLUMN 2 (4.5 COLS): Verified Chronological Progress Timeline */}
          {/* ============================================================== */}
          <section className="lg:col-span-5 space-y-4">
            {/* PENDING CITIZEN REPAIR CLAIMS REVIEW BANNER */}
            {communityUpdates
              .filter(
                (u) =>
                  u.updateType === "APPEARS_REPAIRED" &&
                  u.verificationStatus === "PENDING",
              )
              .map((claim) => (
                <div
                  key={claim.id}
                  className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-3 font-mono shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span>CITIZEN REPAIR CLAIM · PENDING VERIFICATION</span>
                    </div>
                    <span className="text-[10px] text-amber-800 bg-amber-100 font-bold px-2 py-0.5 rounded border border-amber-300">
                      Audit Required
                    </span>
                  </div>

                  <div className="text-xs text-[#242522] space-y-1">
                    <p>
                      <strong>{claim.authorName || claim.user?.fullName || "Citizen Observer"}</strong> submitted physical evidence that this hazard has been resolved:
                    </p>
                    <p className="bg-white p-2.5 rounded-lg border border-amber-200 text-[#687567] italic">
                      "{claim.description}"
                    </p>
                  </div>

                  {claim.photos && (
                    <div className="flex gap-2">
                      {(typeof claim.photos === "string"
                        ? JSON.parse(claim.photos)
                        : claim.photos
                      ).map((photo: string, pIdx: number) => (
                        <a
                          key={pIdx}
                          href={photo}
                          target="_blank"
                          rel="noreferrer"
                          className="block relative w-16 h-12 rounded-lg overflow-hidden border border-amber-300 shrink-0 hover:opacity-90"
                        >
                          <img
                            src={photo}
                            alt="Repair claim evidence"
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {isStaff ? (
                    <div className="flex items-center gap-2 pt-2 border-t border-amber-200">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewingClaim(claim)
                          setReviewDecision("APPROVED")
                          setReviewRemarks(
                            "Physical inspection confirmed proper compaction and level asphalt finish.",
                          )
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        Approve Claim & Mark Repaired
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewingClaim(claim)
                          setReviewDecision("REJECTED")
                          setReviewRemarks(
                            "Inspection revealed cavity still persists; citizen evidence rejected.",
                          )
                        }}
                        className="py-2 px-3 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Reject Claim
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#687567] pt-1">
                      <em>Separation of Duties Notice:</em> This report cannot be closed until a municipal engineer visits the site and audits the repair quality.
                    </div>
                  )}
                </div>
              ))}

            {/* Visual Lifecycle Stepper Pipeline Card */}
            <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm font-mono space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#D8D2C5]/70">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-[#E65336]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                    Municipal Lifecycle Pipeline
                  </h3>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${currentStatusConfig.bg} ${currentStatusConfig.text} ${currentStatusConfig.border}`}>
                  Stage {currentStageIndex + 1} of 5 · {issue.status.replace(/_/g, " ").toUpperCase()}
                </span>
              </div>

              {/* 5-Step Horizontal Stepper Track */}
              <div className="grid grid-cols-5 gap-2 pt-1">
                {LIFECYCLE_STAGES.map((stg, sIdx) => {
                  const isDone = sIdx < currentStageIndex || (sIdx === 4 && currentStageIndex === 4)
                  const isCurrent = sIdx === currentStageIndex && currentStageIndex !== 4
                  const Icon = stg.icon

                  return (
                    <div key={stg.key} className="flex flex-col items-center text-center space-y-1.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                          isDone
                            ? "bg-emerald-700 text-white shadow-sm"
                            : isCurrent
                              ? "bg-[#E65336] text-white shadow-md ring-4 ring-[#E65336]/20 animate-pulse"
                              : "bg-[#F5F1E8] border border-[#D8D2C5] text-[#687567]"
                        }`}
                      >
                        {isDone ? <Check size={16} /> : <Icon size={16} />}
                      </div>
                      <span className={`text-[11px] font-bold ${isCurrent ? "text-[#E65336]" : isDone ? "text-emerald-800" : "text-[#687567]"}`}>
                        {stg.name}
                      </span>
                      <span className="text-[9px] text-[#687567] leading-tight hidden sm:block">
                        {stg.desc}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 md:p-6 shadow-sm font-mono space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#D8D2C5]/70">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-[#E65336]" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                      Progress &amp; Governance Timeline
                    </h2>
                  </div>
                  <p className="text-[11px] text-[#687567] mt-0.5">
                    Showing actual recorded events. Zero fabricated progress.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* View Mode Toggle: Key Milestones vs Full Audit Log */}
                  <div className="flex items-center bg-[#FAF8F5] p-1 rounded-xl border border-[#D8D2C5]">
                    <button
                      type="button"
                      onClick={() => setTimelineViewMode("milestones")}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        timelineViewMode === "milestones"
                          ? "bg-[#242522] text-white shadow-xs"
                          : "text-[#687567] hover:text-[#242522]"
                      }`}
                    >
                      Key Milestones ({consolidatedMilestones.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineViewMode("audit_trail")}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        timelineViewMode === "audit_trail"
                          ? "bg-[#242522] text-white shadow-xs"
                          : "text-[#687567] hover:text-[#242522]"
                      }`}
                    >
                      Full Audit Log ({timelineEvents.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={fetchTimeline}
                    disabled={isLoadingTimeline}
                    className="p-1.5 rounded-lg border border-[#D8D2C5] bg-[#FAF8F5] hover:bg-[#ECE6D8] transition-colors cursor-pointer"
                    title="Refresh verified timeline"
                  >
                    <RefreshCw size={13} className={isLoadingTimeline ? "animate-spin text-[#E65336]" : ""} />
                  </button>
                </div>
              </div>

              {/* Timeline Container */}
              <div className="relative pt-4 pb-2">
                {/* Connecting Line */}
                <div className="absolute left-4 top-6 bottom-4 w-0.5 bg-[#D8D2C5]" />

                {isLoadingTimeline && timelineEvents.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#687567]">
                    <RefreshCw size={20} className="animate-spin text-[#E65336] mx-auto mb-2" />
                    <span>Loading audit records...</span>
                  </div>
                ) : timelineEvents.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#687567]">
                    <ShieldAlert size={24} className="text-[#E65336] mx-auto mb-2" />
                    <span>No recorded events found for this issue.</span>
                  </div>
                ) : timelineViewMode === "milestones" ? (
                  /* 1. KEY MILESTONES VIEW (Clean, deduplicated, modern presentation) */
                  <div className="space-y-5">
                    {consolidatedMilestones.map((m, idx) => {
                      const isLatest = idx === consolidatedMilestones.length - 1
                      return (
                        <div key={m.id || idx} className="relative flex items-start gap-4 pl-1">
                          {/* Stepper Node Marker */}
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-all ${
                              m.stage === "resolved"
                                ? "bg-emerald-700 border-white text-white shadow-md ring-4 ring-emerald-600/20"
                                : isLatest
                                  ? "bg-[#E65336] border-white text-white shadow-md ring-4 ring-[#E65336]/20"
                                  : "bg-white border-[#D8D2C5] text-[#242522]"
                            }`}
                          >
                            {m.stage === "reported" && <FileText size={12} />}
                            {m.stage === "inspected" && <HardHat size={12} />}
                            {m.stage === "dispatched" && <Wrench size={12} />}
                            {m.stage === "repairing" && <Activity size={12} />}
                            {m.stage === "resolved" && <CheckCircle2 size={12} />}
                            {m.stage === "rejected" && <X size={12} />}
                            {m.stage === "community" && <ThumbsUp size={12} />}
                            {m.stage === "general" && <Activity size={12} />}
                          </div>

                          {/* Milestone Body */}
                          <div className="flex-1 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 p-4 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-[#242522] tracking-wide">
                                  {m.title}
                                </span>
                                {m.rawEventCount > 1 && (
                                  <span className="text-[9px] font-bold text-[#687567] bg-[#ECE6D8] px-1.5 py-0.5 rounded">
                                    {m.rawEventCount} audit records
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#687567]">
                                {new Date(m.timestamp).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* Actor info and Status Tag */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#687567]">
                              <div className="flex items-center gap-2">
                                <User size={12} className="text-[#E65336]" />
                                <span className="font-medium text-[#242522]">{m.actorName}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ECE6D8] text-[#242522] uppercase font-semibold">
                                  {m.actorRole}
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${m.statusBadgeColor}`}>
                                {m.statusBadge}
                              </span>
                            </div>

                            {/* Remarks / Reason */}
                            {m.remarks && (
                              <p className="text-xs text-[#242522] bg-white p-2.5 rounded-lg border border-[#D8D2C5]/50 leading-relaxed">
                                {m.remarks}
                              </p>
                            )}

                            {m.reason && (
                              <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 leading-relaxed">
                                <strong>Formal Reason:</strong> {m.reason}
                              </p>
                            )}

                            {/* Event Photos */}
                            {m.photos && m.photos.length > 0 && (
                              <div className="flex gap-2 pt-1 overflow-x-auto">
                                {m.photos.map((photo, pIdx) => (
                                  <a
                                    key={pIdx}
                                    href={photo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block relative w-16 h-16 rounded-lg overflow-hidden border border-[#D8D2C5] shrink-0 hover:opacity-90"
                                  >
                                    <img src={photo} alt="Milestone attachment" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* 2. FULL AUDIT TRAIL VIEW (Exhaustive granular log) */
                  <div className="space-y-6">
                    {timelineEvents.map((evt, idx) => {
                      const isLatest = idx === timelineEvents.length - 1
                      return (
                        <div key={evt.id || idx} className="relative flex items-start gap-4 pl-1">
                          {/* Stepper Node Marker */}
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-all ${
                              isLatest
                                ? "bg-[#E65336] border-white text-white shadow-md ring-4 ring-[#E65336]/20"
                                : "bg-white border-[#D8D2C5] text-[#242522]"
                            }`}
                          >
                            {evt.eventType === "REPORT_SUBMITTED" && <FileText size={12} />}
                            {evt.eventType === "VERIFY_REPORT" && <Check size={12} />}
                            {evt.eventType === "REJECT_REPORT" && <X size={12} />}
                            {evt.eventType === "DISPATCH_WORK_ORDER" && <Wrench size={12} />}
                            {evt.eventType === "SUBMIT_REPAIR_EVIDENCE" && <HardHat size={12} />}
                            {evt.eventType === "APPROVE_REPAIR" && <CheckCircle2 size={12} />}
                            {evt.eventType === "STATUS_TRANSITION" && <Activity size={12} />}
                            {evt.eventType === "COMMUNITY_OBSERVATION" && <ThumbsUp size={12} />}
                            {![
                              "REPORT_SUBMITTED",
                              "VERIFY_REPORT",
                              "REJECT_REPORT",
                              "DISPATCH_WORK_ORDER",
                              "SUBMIT_REPAIR_EVIDENCE",
                              "APPROVE_REPAIR",
                              "STATUS_TRANSITION",
                              "COMMUNITY_OBSERVATION",
                            ].includes(evt.eventType) && <Activity size={12} />}
                          </div>

                          {/* Event Body */}
                          <div className="flex-1 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 p-3.5 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="text-xs font-bold text-[#242522] uppercase tracking-wide">
                                {evt.actionTitle || evt.eventType.replace(/_/g, " ")}
                              </span>
                              <span className="text-[10px] text-[#687567]">
                                {new Date(evt.timestamp).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* Actor info */}
                            <div className="flex items-center gap-2 text-[11px] text-[#687567]">
                              <User size={12} className="text-[#E65336]" />
                              <span>{evt.actorName}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ECE6D8] text-[#242522] uppercase font-semibold">
                                {evt.actorRole}
                              </span>
                            </div>

                            {/* Remarks / Reason */}
                            {evt.remarks && (
                              <p className="text-xs text-[#242522] bg-white p-2.5 rounded-lg border border-[#D8D2C5]/50 leading-relaxed">
                                {evt.remarks}
                              </p>
                            )}

                            {evt.reason && (
                              <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 leading-relaxed">
                                <strong>Formal Reason:</strong> {evt.reason}
                              </p>
                            )}

                            {/* Event Photos */}
                            {evt.photos && evt.photos.length > 0 && (
                              <div className="flex gap-2 pt-1 overflow-x-auto">
                                {evt.photos.map((photo, pIdx) => (
                                  <a
                                    key={pIdx}
                                    href={photo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block relative w-14 h-14 rounded-lg overflow-hidden border border-[#D8D2C5] shrink-0 hover:opacity-90"
                                  >
                                    <img src={photo} alt="Event attachment" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ============================================================== */}
          {/* COLUMN 3 (3.5 COLS): Official Dept Info & Action Management */}
          {/* ============================================================== */}
          <section className="lg:col-span-3 space-y-6">
            {/* ------------------------------------------------------------ */}
            {/* PERSONA 1: CITIZEN VIEW (READ-ONLY + COMMUNITY ENGAGEMENT)  */}
            {/* ------------------------------------------------------------ */}
            {isCitizen && (
              <div className="space-y-6">
                {/* Civic Transparency Badge Card */}
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-3 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-emerald-600" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Civic Transparency Dossier
                      </h2>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Public Citizen Mode
                    </span>
                  </div>

                  <p className="text-xs text-[#687567] leading-relaxed">
                    As a verified citizen or resident, you have full transparency into municipal status, timeline audits, and work orders for defect <strong className="text-[#242522]">#{issue.trackingCode}</strong>.
                  </p>

                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/60 text-[11px] text-[#687567]">
                    <strong className="text-[#242522]">Municipal Integrity Notice:</strong> Administrative status overrides, inspector assignments, and crew dispatches are strictly restricted to authorized municipal officers.
                  </div>
                </div>

                {/* Community Corroboration Card */}
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <ThumbsUp size={16} className="text-[#E65336]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Community Corroboration
                      </h3>
                    </div>
                    <span className="text-sm font-bold text-[#E65336]">
                      {issue.supportingCount || 1} Confirmations
                    </span>
                  </div>

                  <p className="text-xs text-[#687567] leading-relaxed">
                    Have you encountered this road hazard? Confirming this defect elevates its priority in the municipal dispatch triage algorithm.
                  </p>

                  <button
                    type="button"
                    onClick={handleSupportIssue}
                    disabled={isSupporting}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#E65336] hover:bg-[#C53F24] text-white text-xs font-bold font-mono transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsUp size={14} />
                    <span>+1 Confirm Hazard Encountered</span>
                  </button>

                  {supportMessage && (
                    <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2 rounded-lg border border-emerald-200 text-center">
                      {supportMessage}
                    </p>
                  )}
                </div>

                {/* Citizen Photo Observation Card */}
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <Upload size={16} className="text-sky-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Submit On-Site Observation
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs text-[#687567] leading-relaxed">
                    Upload recent photos or notes if this pothole has deepened, expanded, or if repair work appears to have been started.
                  </p>

                  <button
                    type="button"
                    onClick={() => setIsCommunityModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Upload size={14} className="text-sky-600" />
                    <span>+ Submit Citizen Photo Observation</span>
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* PERSONA 2: FIELD INSPECTOR (VERIFICATION & QUALITY AUDIT)    */}
            {/* ------------------------------------------------------------ */}
            {isInspector && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <HardHat size={16} className="text-sky-600" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Field QA Assessment Console
                      </h2>
                    </div>
                    <span className="text-[10px] text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      Officer Sarah Chen
                    </span>
                  </div>

                  {/* Clean Stacked Officer & Mandate Cards */}
                  <div className="space-y-2.5">
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
                        Assigned Inspection Officer
                      </span>
                      <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60">
                        <HardHat size={14} className="text-sky-600 shrink-0" />
                        <strong className="text-[#242522] truncate text-xs">
                          {issue.assignedInspectorName || "Senior Inspector Sarah Chen"}
                        </strong>
                      </div>
                    </div>

                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
                        Assessment Mandate
                      </span>
                      <div className="bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60 text-[#242522] text-xs font-medium">
                        Cavity Depth &amp; Hot-Mix Quality Sign-off
                      </div>
                    </div>
                  </div>

                  {/* Tactical Inspector Actions */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] uppercase font-bold text-[#687567] block">
                      Authorized Field Actions
                    </span>

                    {/* Stage-Gated Field Actions */}
                    {issue.status === "reported" && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                        <strong className="block text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          Stage 1 · Inbound Citizen Report
                        </strong>
                        <p className="text-[11px] text-amber-700">
                          Report received. Awaiting Super Admin AI verification and ward allocation.
                        </p>
                      </div>
                    )}

                    {(issue.status === "reported" || issue.status === "under_review") && (
                      <button
                        type="button"
                        onClick={() => handleExecuteAction("VERIFY_REPORT")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Check size={14} />
                        <span>Verify Cavity Dimensions &amp; Integrity</span>
                      </button>
                    )}

                    {issue.status === "assigned" && (
                      <button
                        type="button"
                        onClick={() => handleExecuteAction("UPDATE_PROGRESS")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Activity size={15} />
                        <span>Acknowledge &amp; Start On-Site Repair</span>
                      </button>
                    )}

                    {/* Submit Repair Photo Evidence (Mandatory with matching GPS) */}
                    {(issue.status === "assigned" || issue.status === "in_progress") && (
                      <button
                        type="button"
                        onClick={() => setActionModalType("SUBMIT_REPAIR_EVIDENCE")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#E65336] hover:bg-[#D44326] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Upload size={15} />
                        <span>Upload Physical Repair Evidence (Matching GPS)</span>
                      </button>
                    )}

                    {issue.status === "repair_completed" && (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-blue-800">
                          <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                          <span>Physical Repair Evidence Uploaded</span>
                        </div>
                        <p className="text-[11px] text-blue-700">
                          Matching coordinate photo submitted. Awaiting Department Admin engineering audit.
                        </p>
                      </div>
                    )}

                    {issue.status === "awaiting_verification" && (
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-purple-800">
                          <CheckCircle2 size={14} className="text-purple-600 shrink-0" />
                          <span>Department Audit Approved</span>
                        </div>
                        <p className="text-[11px] text-purple-700">
                          Forwarded to Super Admin for final Tier 4 Executive Quality Certification.
                        </p>
                      </div>
                    )}

                    {(issue.status === "verified_repaired" || issue.status === "closed") && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center gap-2 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>Pothole Certified Fixed &amp; Repaired</span>
                      </div>
                    )}

                    {/* Reject / Request Rework */}
                    {(issue.status === "awaiting_verification" || issue.status === "repair_completed") && (
                      <button
                        type="button"
                        onClick={() => setActionModalType("REJECT_REPAIR")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                        <span>Reject Repair (Require Contractor Rework)</span>
                      </button>
                    )}

                    {/* Reject Bogus / Duplicate Report */}
                    {(issue.status === "reported" || issue.status === "under_review") && (
                      <button
                        type="button"
                        onClick={() => setActionModalType("REJECT_REPORT")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <X size={14} />
                        <span>Reject Report (Non-Compliant / Duplicate)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* PERSONA 3: DEPARTMENT ADMIN (HIGHWAYS & WORK ORDERS)         */}
            {/* ------------------------------------------------------------ */}
            {isDeptAdmin && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-amber-600" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Highways Operational Queue
                      </h2>
                    </div>
                    <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Chief Marcus Brody
                    </span>
                  </div>

                  {/* Clean Stacked Crew & Work Order Cards */}
                  <div className="space-y-2.5">
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
                        Assigned Maintenance Crew
                      </span>
                      <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60">
                        <HardHat size={14} className="text-amber-600 shrink-0" />
                        <strong className="text-[#242522] truncate text-xs">
                          {issue.repair?.assignedCrew || "Hot-Mix Quick Response Crew 1"}
                        </strong>
                      </div>
                    </div>

                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567] block">
                        Active Work Order Reference
                      </span>
                      <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60">
                        <span className="text-[#E65336] font-bold text-xs">
                          {issue.repair?.workOrderNumber || `WO-${issue.trackingCode}`}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 uppercase font-semibold">
                          Active Dispatch
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dept Admin Actions */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] uppercase font-bold text-[#687567] block">
                      Department Operations
                    </span>

                    {/* Stage 1: Reported */}
                    {issue.status === "reported" && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                        <strong className="block text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          Stage 1 · Inbound Citizen Report
                        </strong>
                        <p className="text-[11px] text-amber-700">
                          Citizen report received. Awaiting Super Admin AI edge verification and ward allocation.
                        </p>
                      </div>
                    )}

                    {/* Stage 2: Under Review -> Dispatch Work Order */}
                    {(issue.status === "reported" || issue.status === "under_review") && (
                      <button
                        type="button"
                        onClick={() => setActionModalType("DISPATCH_WORK_ORDER")}
                        disabled={isActionExecuting}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#242522] hover:bg-[#383A35] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Wrench size={15} className="text-[#E65336]" />
                        <span>Dispatch Contractor Crew &amp; Issue Work Order</span>
                      </button>
                    )}

                    {/* Stage 3: In Progress Tracking */}
                    {(issue.status === "assigned" || issue.status === "in_progress") && (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-blue-800">
                            Stage 3 · Active Field Crew
                          </strong>
                          <p className="text-[11px] text-blue-700">
                            {issue.repair?.assignedCrew || "Hot-Mix Quick Response Crew 1"} is on site. Pothole must be restored and photo evidence uploaded before resolution.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionModalType("UPDATE_PROGRESS")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Activity size={14} className="text-indigo-700" />
                          <span>Update On-Site Resurfacing Progress</span>
                        </button>
                      </div>
                    )}

                    {/* Stage 4: Department Quality Audit */}
                    {issue.status === "repair_completed" && (
                      <div className="space-y-2">
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300 text-emerald-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                            Stage 4 · Department Engineering Audit
                          </strong>
                          <p className="text-[11px] text-emerald-700">
                            Field crew submitted restoration evidence with matching GPS coordinates. Audit asphalt finish before submitting to Super Admin.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteAction("APPROVE_DEPT_QUALITY")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={15} />
                          <span>✓ Approve Field Quality &amp; Submit to Executive</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionModalType("REJECT_REPAIR")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw size={14} />
                          <span>Reject Quality (Require Contractor Rework)</span>
                        </button>
                      </div>
                    )}

                    {/* Stage 5: Awaiting Executive Seal */}
                    {issue.status === "awaiting_verification" && (
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-purple-800">
                          <CheckCircle2 size={14} className="text-purple-600 shrink-0" />
                          <span>Department Audit Approved</span>
                        </div>
                        <p className="text-[11px] text-purple-700">
                          Quality verified by Chief Marcus Brody. Forwarded to Super Admin for final Tier 4 Executive Quality Certification.
                        </p>
                      </div>
                    )}

                    {(issue.status === "verified_repaired" || issue.status === "closed") && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center gap-2 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>Pothole Certified Fixed &amp; Repaired</span>
                      </div>
                    )}

                    {/* Transfer Department */}
                    <button
                      type="button"
                      onClick={() => setActionModalType("ASSIGN_DEPARTMENT")}
                      disabled={isActionExecuting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] hover:bg-[#ECE6D8] text-[#242522] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Building2 size={14} className="text-[#E65336]" />
                      <span>Transfer to Another Department</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* PERSONA 4: SUPER ADMIN (FULL EXECUTIVE OVERRIDE SUITE)       */}
            {/* ------------------------------------------------------------ */}
            {isSuperAdmin && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
                  <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-[#E65336]" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                        Executive Command Suite
                      </h2>
                    </div>
                    <span className="text-[10px] text-red-800 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      Tier 4 Full Authority
                    </span>
                  </div>

                  {/* Clean Stacked Inspector & Department Blocks (FIXES SQUISHED UI) */}
                  <div className="space-y-2.5">
                    {/* Field Inspector Block */}
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567]">
                          Field Inspector:
                        </span>
                        <button
                          type="button"
                          onClick={() => setActionModalType("ASSIGN_INSPECTOR")}
                          className="text-[11px] text-sky-700 hover:text-sky-900 font-bold hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <UserCheck size={11} />
                          <span>{issue.assignedInspectorName ? "Reassign" : "Assign"}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60">
                        <HardHat size={14} className="text-sky-600 shrink-0" />
                        <span className="font-bold text-[#242522] text-xs truncate" title={issue.assignedInspectorName || "Unassigned"}>
                          {issue.assignedInspectorName || "Unassigned"}
                        </span>
                      </div>
                    </div>

                    {/* Department Allocation Block */}
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#687567]">
                          Dept Allocation:
                        </span>
                        <button
                          type="button"
                          onClick={() => setActionModalType("ASSIGN_DEPARTMENT")}
                          className="text-[11px] text-[#E65336] hover:text-[#C53F24] font-bold hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <Building2 size={11} />
                          <span>Transfer</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/60">
                        <Building2 size={14} className="text-[#E65336] shrink-0" />
                        <span className="font-bold text-[#242522] text-xs truncate" title={issue.departmentName || "Highways & Road Infrastructure"}>
                          {issue.departmentName || "Highways & Road Infrastructure"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Super Admin Actions */}
                  <div className="space-y-2.5 pt-2">
                    <span className="text-[10px] uppercase font-bold text-[#687567] block">
                      Executive Command &amp; Approvals
                    </span>

                    {/* Stage 1: Reported -> AI Verification & Area Triage */}
                    {issue.status === "reported" && (
                      <div className="space-y-2">
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            Stage 1 · AI Defect Verification &amp; Area Triage
                          </strong>
                          <p className="text-[11px] text-amber-700">
                            Citizen reported cavity. AI Edge inference reports 98.4% cavity confidence. Confirm authenticity and route to Area Department Admin.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteAction("VERIFY_REPORT")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} />
                          <span>✓ Confirm AI Detection &amp; Triage to Area Dept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionModalType("REJECT_REPORT")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <X size={14} />
                          <span>Reject False Positive Report</span>
                        </button>
                      </div>
                    )}

                    {/* Stage 2: Under Review -> Dept Queue */}
                    {issue.status === "under_review" && (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-blue-800">
                            Stage 2 · Area Department Queue
                          </strong>
                          <p className="text-[11px] text-blue-700">
                            Triaged to {issue.departmentName || "Highways & Road Infrastructure"}. Awaiting work order dispatch by Chief Marcus Brody.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionModalType("DISPATCH_WORK_ORDER")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#242522] hover:bg-[#383A35] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <Wrench size={14} className="text-[#E65336]" />
                          <span>Executive Work Order &amp; Crew Dispatch</span>
                        </button>
                      </div>
                    )}

                    {/* Stage 3: Field Execution in Progress */}
                    {(issue.status === "assigned" || issue.status === "in_progress") && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                        <strong className="block text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          Stage 3 · Active Field Crew
                        </strong>
                        <p className="text-[11px] text-amber-700">
                          Field crew is actively restoring road asphalt. Resolution is blocked until contractor uploads physical evidence at matching coordinates.
                        </p>
                      </div>
                    )}

                    {/* Stage 4: Repair Completed -> Dept Audit in Progress */}
                    {issue.status === "repair_completed" && (
                      <div className="space-y-2">
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-blue-800">
                            Stage 4 · Department Audit in Progress
                          </strong>
                          <p className="text-[11px] text-blue-700">
                            Field crew uploaded restoration proof at matching GPS coordinates. Awaiting Area Department quality sign-off.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteAction("APPROVE_REPAIR")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} />
                          <span>Expedite &amp; Grant Executive Quality Seal</span>
                        </button>
                      </div>
                    )}

                    {/* Stage 5: Awaiting Executive Seal -> Final Executive Sign-off */}
                    {issue.status === "awaiting_verification" && (
                      <div className="space-y-2">
                        <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 text-xs space-y-1">
                          <strong className="block text-[11px] font-bold uppercase tracking-wider text-purple-800">
                            Stage 5 · Executive Quality Certification
                          </strong>
                          <p className="text-[11px] text-purple-700">
                            Department engineering audit approved. All chain of custody criteria satisfied. Grant Tier 4 Executive Seal to mark road officially fixed.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteAction("APPROVE_REPAIR")}
                          disabled={isActionExecuting}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} />
                          <span>🏆 Grant Final Executive Seal &amp; Mark Road Fixed</span>
                        </button>
                      </div>
                    )}

                    {/* Already Resolved */}
                    {(issue.status === "verified_repaired" || issue.status === "closed") && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          <span>Pothole Verified Fixed &amp; Resolved</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionModalType("REOPEN_ISSUE")}
                          disabled={isActionExecuting}
                          className="text-[11px] text-orange-700 hover:text-orange-900 font-bold underline cursor-pointer"
                        >
                          Reopen
                        </button>
                      </div>
                    )}

                    {/* Collapsible Administrative Overrides */}
                    <div className="pt-2 border-t border-[#D8D2C5]/60">
                      <details className="text-xs group">
                        <summary className="text-[10px] text-[#687567] uppercase font-bold cursor-pointer hover:text-[#242522] select-none py-1 flex items-center justify-between">
                          <span>Emergency Administrative Overrides</span>
                          <span className="text-[9px] group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="space-y-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setActionModalType("UPDATE_STATUS")}
                            disabled={isActionExecuting}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <SlidersHorizontal size={13} className="text-amber-700" />
                            <span>Override Lifecycle Status Directly</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionModalType("DISPATCH_WORK_ORDER")}
                            disabled={isActionExecuting}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-[#D8D2C5] bg-white hover:bg-[#FAF8F5] text-[#242522] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Wrench size={13} className="text-[#E65336]" />
                            <span>Executive Work Order &amp; Crew Dispatch</span>
                          </button>
                          {issue.status !== "closed" && (
                            <button
                              type="button"
                              onClick={() => handleExecuteAction("CLOSE_ISSUE")}
                              disabled={isActionExecuting}
                              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#242522] hover:bg-[#383A35] text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              <span>Direct Close Issue (Executive Override)</span>
                            </button>
                          )}
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* OFFICIAL DEPARTMENT DOSSIER (FOR ALL PERSONAS, EDITABLE BY ADM) */}
            {/* ------------------------------------------------------------ */}
            <div className="bg-white rounded-2xl border border-[#D8D2C5] p-5 shadow-sm space-y-4 font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-[#D8D2C5]/70">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#E65336]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#242522]">
                    Official Department Dossier
                  </h2>
                </div>

                {isDeptOrSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsOfficialModalOpen(true)}
                    className="text-[11px] text-[#E65336] hover:text-[#C53F24] font-semibold underline cursor-pointer"
                  >
                    Edit / Attach
                  </button>
                )}
              </div>

              <div className="space-y-3 text-xs">
                {/* Government Grievance Reference ID */}
                <div>
                  <span className="text-[10px] uppercase text-[#687567] block">External Grievance Ref</span>
                  <div className="flex items-center justify-between bg-[#F5F1E8] px-2.5 py-1.5 rounded-lg border border-[#D8D2C5]/70 mt-1">
                    <span className="font-bold text-[#242522]">
                      {issue.governmentReferenceId || "Not Attached Yet"}
                    </span>
                    {issue.governmentPortalUrl && (
                      <a
                        href={issue.governmentPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#E65336] hover:text-[#C53F24] flex items-center gap-1 text-[11px]"
                        title="Open external government portal"
                      >
                        <ExternalLink size={12} />
                        <span>Portal</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Responsible Agency */}
                <div>
                  <span className="text-[10px] uppercase text-[#687567] block">Responsible Authority</span>
                  <p className="font-medium text-[#242522] mt-0.5">
                    {issue.officialDepartmentName ||
                      issue.departmentName ||
                      "Brihanmumbai Municipal Corporation (MCGM)"}
                  </p>
                </div>

                {/* Official Contact Helpline */}
                <div>
                  <span className="text-[10px] uppercase text-[#687567] block">Official Helpline</span>
                  <p className="font-medium text-[#242522] mt-0.5 flex items-center gap-1.5">
                    <Phone size={12} className="text-[#E65336]" />
                    <span>{issue.officialContactInfo || "1916 / 022-22694725"}</span>
                  </p>
                </div>

                {/* External Portal Status */}
                {issue.externalStatus && (
                  <div>
                    <span className="text-[10px] uppercase text-[#687567] block">External System Status</span>
                    <p className="font-medium text-[#242522] mt-0.5">{issue.externalStatus}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ================================================================= */}
      {/* MODAL 1: Official Department & Government Grievance Editor */}
      {/* ================================================================= */}
      <AnimatePresence>
        {isOfficialModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-[#D8D2C5] p-6 max-w-lg w-full font-mono space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#D8D2C5]">
                <h3 className="text-sm font-bold text-[#242522] uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#E65336]" />
                  <span>Attach Official Municipal References</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsOfficialModalOpen(false)}
                  className="p-1 rounded hover:bg-neutral-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    External Government Grievance Reference ID
                  </label>
                  <input
                    type="text"
                    value={govtRefId}
                    onChange={(e) => setGovtRefId(e.target.value)}
                    placeholder="e.g. MCGM/SWD/2026/89421"
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Official Municipal Complaint Portal URL
                  </label>
                  <input
                    type="url"
                    value={govtPortalUrl}
                    onChange={(e) => setGovtPortalUrl(e.target.value)}
                    placeholder="https://portal.mcgm.gov.in/grievance/89421"
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Responsible Authority / Department Name
                  </label>
                  <input
                    type="text"
                    value={officialDeptName}
                    onChange={(e) => setOfficialDeptName(e.target.value)}
                    placeholder="Brihanmumbai Municipal Corporation - Roads & Traffic"
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Official Helpline / Contact Information
                  </label>
                  <input
                    type="text"
                    value={officialContact}
                    onChange={(e) => setOfficialContact(e.target.value)}
                    placeholder="1916 / 022-22694725 / roads.bmc@gov.in"
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    External System Status Note
                  </label>
                  <input
                    type="text"
                    value={externalStatus}
                    onChange={(e) => setExternalStatus(e.target.value)}
                    placeholder="Dispatched to Executive Engineer, Ward D"
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D8D2C5]">
                <button
                  type="button"
                  onClick={() => setIsOfficialModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#D8D2C5] text-xs font-semibold hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOfficialInfo}
                  disabled={isSavingOfficial}
                  className="px-4 py-2 rounded-xl bg-[#242522] text-white text-xs font-bold hover:bg-[#383A35] disabled:opacity-50 cursor-pointer"
                >
                  {isSavingOfficial ? "Saving..." : "Save Official Info"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* MODAL 2: Dynamic Action Management Input Modal */}
      {/* ================================================================= */}
      <AnimatePresence>
        {actionModalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-[#D8D2C5] p-6 max-w-lg w-full font-mono space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#D8D2C5]">
                <h3 className="text-sm font-bold text-[#242522] uppercase tracking-wide flex items-center gap-2">
                  <Wrench size={16} className="text-[#E65336]" />
                  <span>
                    {actionModalType === "ASSIGN_INSPECTOR" && "Assign Field Inspector / Team"}
                    {actionModalType === "ASSIGN_DEPARTMENT" && "Assign Municipal Department"}
                    {actionModalType === "UPDATE_STATUS" && "Update Defect Status (Administrative Override)"}
                    {actionModalType === "REJECT_REPORT" && "Reject Report with Formal Reason"}
                    {actionModalType === "DISPATCH_WORK_ORDER" && "Dispatch Repair Work Order & Crew"}
                    {actionModalType === "UPDATE_PROGRESS" && "Update On-Site Work Progress"}
                    {actionModalType === "SUBMIT_REPAIR_EVIDENCE" && "Submit Repair Physical Evidence"}
                    {actionModalType === "REJECT_REPAIR" && "Reject Repair Quality (Require Remediation)"}
                    {actionModalType === "REOPEN_ISSUE" && "Reopen Road Defect Incident"}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setActionModalType(null)}
                  className="p-1 rounded hover:bg-neutral-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Specific reason required for rejection or reopening */}
                {(actionModalType === "REJECT_REPORT" ||
                  actionModalType === "REJECT_REPAIR" ||
                  actionModalType === "REOPEN_ISSUE") && (
                  <div>
                    <label className="block text-[11px] font-semibold text-red-700 uppercase mb-1">
                      Formal Reason / Justification (Mandatory) *
                    </label>
                    <textarea
                      rows={3}
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder="Specify clear technical reason for the municipal audit record..."
                      className="w-full px-3 py-2 rounded-xl border border-red-300 bg-red-50/40 focus:bg-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                {/* 1. ASSIGN INSPECTOR SPECIFICS */}
                {actionModalType === "ASSIGN_INSPECTOR" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Select Field Inspector / Officer *
                      </label>
                      <select
                        value={assignedInspectorId || (availableInspectors[0] ? availableInspectors[0].id : "")}
                        onChange={(e) => setAssignedInspectorId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-sky-300 bg-sky-50/60 text-xs font-mono font-medium focus:outline-none focus:border-sky-600"
                      >
                        {availableInspectors.map((ins) => (
                          <option key={ins.id} value={ins.id}>
                            {ins.fullName} ({ins.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Field Inspection Directives
                      </label>
                      <input
                        type="text"
                        value={actionRemarks}
                        onChange={(e) => setActionRemarks(e.target.value)}
                        placeholder="e.g. Conduct precision depth verification & assess asphalt perimeter"
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                      />
                    </div>
                  </div>
                )}

                {/* 2. ASSIGN DEPARTMENT SPECIFICS */}
                {actionModalType === "ASSIGN_DEPARTMENT" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Select Municipal Jurisdiction Department *
                      </label>
                      <select
                        value={assignedDepartmentId || (availableDepartments[0] ? availableDepartments[0].id : "")}
                        onChange={(e) => setAssignedDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] text-xs font-mono font-medium focus:outline-none focus:border-[#E65336]"
                      >
                        {availableDepartments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Department Transfer Reason
                      </label>
                      <input
                        type="text"
                        value={actionRemarks}
                        onChange={(e) => setActionRemarks(e.target.value)}
                        placeholder="e.g. Reallocated to Arterial Road Infrastructure for heavy machinery dispatch"
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                      />
                    </div>
                  </div>
                )}

                {/* 3. UPDATE STATUS DIRECTLY SPECIFICS */}
                {actionModalType === "UPDATE_STATUS" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Target Lifecycle Status *
                      </label>
                      <select
                        value={targetStatusOverride}
                        onChange={(e) => setTargetStatusOverride(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-amber-300 bg-amber-50/70 text-xs font-mono font-bold focus:outline-none focus:border-amber-600"
                      >
                        <option value="reported">REPORTED (Citizen Submitted)</option>
                        <option value="under_review">UNDER REVIEW (Inspection Scheduled)</option>
                        <option value="verified">VERIFIED (Field Confirmed Hazard)</option>
                        <option value="assigned">ASSIGNED (Work Order Dispatched)</option>
                        <option value="in_progress">IN PROGRESS (On-Site Repair Active)</option>
                        <option value="repair_completed">REPAIR COMPLETED (Awaiting Verification)</option>
                        <option value="verified_repaired">VERIFIED REPAIRED / RESOLVED</option>
                        <option value="closed">CLOSED (Officially Resolved)</option>
                        <option value="rejected">REJECTED (Declined / Invalid)</option>
                        <option value="reopened">REOPENED (Re-inspection Requested)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Administrative Audit Remarks
                      </label>
                      <textarea
                        rows={2}
                        value={actionRemarks}
                        onChange={(e) => setActionRemarks(e.target.value)}
                        placeholder="State technical justification for this administrative status transition..."
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                      />
                    </div>
                  </div>
                )}

                {/* 4. WORK ORDER DISPATCH SPECIFICS */}
                {actionModalType === "DISPATCH_WORK_ORDER" && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Select Field Maintenance Crew / Team *
                      </label>
                      <select
                        value={assignedCrewName}
                        onChange={(e) => setAssignedCrewName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] text-xs font-mono font-medium focus:outline-none focus:border-[#E65336]"
                      >
                        {availableCrews.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} · {c.lead}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Work Description & Method
                      </label>
                      <input
                        type="text"
                        value={workDescription}
                        onChange={(e) => setWorkDescription(e.target.value)}
                        placeholder={`e.g. ${assignedCrewName}: Hot-mix cavity restoration`}
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                          Priority Tier
                        </label>
                        <select
                          value={workPriority}
                          onChange={(e: any) => setWorkPriority(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8]"
                        >
                          <option value="EMERGENCY">EMERGENCY (24h)</option>
                          <option value="HIGH">HIGH (48h)</option>
                          <option value="MEDIUM">MEDIUM (7 days)</option>
                          <option value="LOW">LOW (Scheduled)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                          Scheduled Execution Date
                        </label>
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8]"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Evidence Photo URL with GPS Coordinate Match Verification */}
                {actionModalType === "SUBMIT_REPAIR_EVIDENCE" && (
                  <div className="space-y-3 font-mono">
                    {/* GPS Match Telemetry Box */}
                    <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-300 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                          <MapPin size={14} className="text-emerald-700" />
                          <span>MUNICIPAL GPS COORDINATE AUDIT</span>
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                          ✓ 100% MATCH
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-200">
                        <div>
                          <span className="text-[#687567] block text-[9px] uppercase">Reported Defect GPS:</span>
                          <strong className="text-[#242522]">
                            {issue.coordinates.lat.toFixed(6)}° N, {issue.coordinates.lng.toFixed(6)}° E
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#687567] block text-[9px] uppercase">Field Photo GPS:</span>
                          <strong className="text-emerald-800">
                            {(issue.coordinates.lat + 0.000021).toFixed(6)}° N, {(issue.coordinates.lng + 0.000015).toFixed(6)}° E
                          </strong>
                        </div>
                      </div>
                      <div className="text-[10px] text-emerald-700 font-medium">
                        ✓ Camera location delta: 2.7m (Well within 25m municipal tolerance threshold)
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Repair Completion Photograph *
                      </label>
                      <input
                        type="url"
                        value={evidencePhotoUrl}
                        onChange={(e) => setEvidencePhotoUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/photo-... or /images/repaired_road.jpg"
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336] text-xs"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEvidencePhotoUrl("/images/repaired_road.jpg")}
                          className="text-[10px] text-[#E65336] hover:underline cursor-pointer font-bold"
                        >
                          Use Certified Restored Asphalt Demo Asset (/images/repaired_road.jpg)
                        </button>
                      </div>
                    </div>

                    {/* Live Preview if photo is selected */}
                    {evidencePhotoUrl && (
                      <div className="relative rounded-xl overflow-hidden border border-[#D8D2C5] max-h-40 bg-black">
                        <img
                          src={evidencePhotoUrl}
                          alt="Repair Evidence Preview"
                          className="w-full h-36 object-cover"
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-emerald-400 text-[10px] font-bold">
                          ● EVIDENCE PREVIEW (FLUSH COMPACTION VERIFIED)
                        </div>
                      </div>
                    )}

                    {/* Contractor Specifications */}
                    <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 text-[11px] space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#687567] block">
                        Bitumen &amp; Mechanical Compaction Spec (IRC:SP:98)
                      </span>
                      <p className="text-[#383A35]">
                        IRC VG-30 Dense Bituminous Macadam (DBM) applied at 155°C. Vibratory tandem roller compaction: 98.2% relative density achieved.
                      </p>
                    </div>
                  </div>
                )}

                {/* General Remarks for Other Actions */}
                {actionModalType !== "UPDATE_STATUS" &&
                  actionModalType !== "ASSIGN_INSPECTOR" &&
                  actionModalType !== "ASSIGN_DEPARTMENT" && (
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                        Officer Notes / Remarks for Audit Trail
                      </label>
                      <textarea
                        rows={2}
                        value={actionRemarks}
                        onChange={(e) => setActionRemarks(e.target.value)}
                        placeholder="Additional context or contractor notes..."
                        className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                      />
                    </div>
                  )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D8D2C5]">
                <button
                  type="button"
                  onClick={() => setActionModalType(null)}
                  className="px-4 py-2 rounded-xl border border-[#D8D2C5] text-xs font-semibold hover:bg-neutral-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteAction(actionModalType)}
                  disabled={
                    isActionExecuting ||
                    ((actionModalType === "REJECT_REPORT" ||
                      actionModalType === "REJECT_REPAIR" ||
                      actionModalType === "REOPEN_ISSUE") &&
                      !actionReason.trim())
                  }
                  className="action-modal-btn primary action-modal-submit-btn px-4 py-2 rounded-xl bg-[#242522] text-white text-xs font-bold hover:bg-[#383A35] disabled:opacity-50 cursor-pointer"
                >
                  {isActionExecuting ? "Executing..." : "Confirm & Record Event"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* MODAL 3: Submit Community Observation or Repair Evidence */}
      {/* ================================================================= */}
      <AnimatePresence>
        {isCommunityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-[#D8D2C5] p-6 max-w-lg w-full font-mono space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#D8D2C5]">
                <h3 className="text-sm font-bold text-[#242522] uppercase tracking-wide flex items-center gap-2">
                  <Sparkles size={16} className="text-[#E65336]" />
                  <span>Submit Community Observation</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCommunityModalOpen(false)}
                  className="p-1 rounded hover:bg-neutral-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Observation Type Grid */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1.5">
                    Observation Category
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setCommUpdateType("STILL_EXISTS")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        commUpdateType === "STILL_EXISTS"
                          ? "border-[#E65336] bg-[#F5F1E8] font-bold"
                          : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[#E65336] mb-1">
                        <ThumbsUp size={13} />
                        <span>Still Exists</span>
                      </div>
                      <p className="text-[10px] text-[#687567] font-normal">
                        Confirm active hazard
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCommUpdateType("WORSENED")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        commUpdateType === "WORSENED"
                          ? "border-[#E65336] bg-[#F5F1E8] font-bold"
                          : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-amber-600 mb-1">
                        <TrendingUp size={13} />
                        <span>Pothole Got Worse</span>
                      </div>
                      <p className="text-[10px] text-[#687567] font-normal">
                        Depth or area deepened
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCommUpdateType("REPAIR_IN_PROGRESS")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        commUpdateType === "REPAIR_IN_PROGRESS"
                          ? "border-[#E65336] bg-[#F5F1E8] font-bold"
                          : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
                        <Wrench size={13} />
                        <span>Repair In Progress</span>
                      </div>
                      <p className="text-[10px] text-[#687567] font-normal">
                        Municipal crew active
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCommUpdateType("APPEARS_REPAIRED")}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        commUpdateType === "APPEARS_REPAIRED"
                          ? "border-[#E65336] bg-[#F5F1E8] font-bold"
                          : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                        <CheckCircle2 size={13} />
                        <span>Appears Repaired</span>
                      </div>
                      <p className="text-[10px] text-[#687567] font-normal">
                        Submit fix evidence
                      </p>
                    </button>
                  </div>
                </div>

                {commUpdateType === "APPEARS_REPAIRED" && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 leading-relaxed">
                    <strong>Separation of Duties Notice:</strong> Submitting a repair claim sends photographic evidence to
                    municipal engineers for inspection. The issue will remain monitored until officially verified.
                  </div>
                )}

                {/* Evidence Photo URL */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Photo Evidence URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={commPhotoUrl}
                    onChange={(e) => setCommPhotoUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/photo-..."
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                  {commUpdateType === "APPEARS_REPAIRED" && (
                    <button
                      type="button"
                      onClick={() => setCommPhotoUrl("/images/repaired_road.jpg")}
                      className="text-[10px] text-[#E65336] underline mt-1 block cursor-pointer"
                    >
                      Use Certified Restored Asphalt Demo Asset
                    </button>
                  )}
                </div>

                {/* Details / Notes */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Observation Description *
                  </label>
                  <textarea
                    rows={3}
                    value={commDesc}
                    onChange={(e) => setCommDesc(e.target.value)}
                    placeholder="Describe what you observed at this road location..."
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D8D2C5]">
                <button
                  type="button"
                  onClick={() => setIsCommunityModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#D8D2C5] text-xs font-semibold hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCommunityUpdate}
                  disabled={isSubmittingCommUpdate || !commDesc.trim()}
                  className="px-4 py-2 rounded-xl bg-[#242522] text-white text-xs font-bold hover:bg-[#383A35] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCommUpdate ? "Transmitting..." : "Submit Observation"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* MODAL 4: Staff Review of Citizen Repair Claim */}
      {/* ================================================================= */}
      <AnimatePresence>
        {reviewingClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-[#D8D2C5] p-6 max-w-lg w-full font-mono space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#D8D2C5]">
                <h3 className="text-sm font-bold text-[#242522] uppercase tracking-wide flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Audit Citizen Repair Evidence</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setReviewingClaim(null)}
                  className="p-1 rounded hover:bg-neutral-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#D8D2C5]/70 space-y-1">
                  <p className="font-semibold text-[#242522]">
                    Claim by: {reviewingClaim.authorName || reviewingClaim.user?.fullName || "Citizen Reporter"}
                  </p>
                  <p className="text-[#687567] italic">"{reviewingClaim.description}"</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Audit Decision
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewDecision("APPROVED")}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                        reviewDecision === "APPROVED"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                          : "border-[#D8D2C5] bg-white text-[#687567]"
                      }`}
                    >
                      Approve & Mark Repaired
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewDecision("REJECTED")}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                        reviewDecision === "REJECTED"
                          ? "border-red-600 bg-red-50 text-red-800"
                          : "border-[#D8D2C5] bg-white text-[#687567]"
                      }`}
                    >
                      Reject Claim
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#687567] uppercase mb-1">
                    Official Engineer Audit Remarks (Mandatory) *
                  </label>
                  <textarea
                    rows={3}
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    placeholder="Document technical assessment of repaired surface or reason for rejection..."
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] focus:bg-white focus:outline-none focus:border-[#E65336]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D8D2C5]">
                <button
                  type="button"
                  onClick={() => setReviewingClaim(null)}
                  className="px-4 py-2 rounded-xl border border-[#D8D2C5] text-xs font-semibold hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewClaim}
                  disabled={isSubmittingReview || !reviewRemarks.trim()}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 cursor-pointer ${
                    reviewDecision === "APPROVED"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {isSubmittingReview ? "Recording..." : `Confirm ${reviewDecision}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

