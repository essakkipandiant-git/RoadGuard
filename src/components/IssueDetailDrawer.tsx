import React, { useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  Globe,
  MapPin,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  ThumbsUp,
  Upload,
  User,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { IssueStatus, RoadIssue, UserRole } from "../types/roadguard"
import { RoadIssueService } from "../services/roadIssueService"

interface IssueDetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  issue: RoadIssue | null
  currentUserRole: UserRole
  onRoleChange: (role: UserRole) => void
  onIssueUpdated: (updatedIssue: RoadIssue) => void
  onFlyToGlobe?: (issue: RoadIssue) => void
}

export default function IssueDetailDrawer({
  isOpen,
  onClose,
  issue,
  currentUserRole,
  onRoleChange,
  onIssueUpdated,
  onFlyToGlobe,
}: IssueDetailDrawerProps) {
  const [activeTab, setActiveTab] =
    useState<"overview" | "risk" | "repair" | "timeline" | "community">(
      "overview",
    )
  const [sliderPos, setSliderPos] = useState(50)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState("")
  const [afterPhotoUrl, setAfterPhotoUrl] = useState(
    "/images/repaired_road.jpg",
  )
  const [reopenReason, setReopenReason] = useState("")
  const [showReopenModal, setShowReopenModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [supportNotes, setSupportNotes] = useState("")
  const [supportName, setSupportName] = useState("")

  if (!isOpen || !issue) return null

  const handleStatusChange = (newStatus: IssueStatus) => {
    setIsTransitioning(true)
    setTransitionError(null)
    try {
      const updated = RoadIssueService.updateStatus(issue.id, newStatus, {
        actorRole: currentUserRole,
        actorName:
          currentUserRole === "authority"
            ? "District Dispatch Chief"
            : currentUserRole === "crew"
              ? "Municipal Repair Crew 3"
              : currentUserRole === "inspector"
                ? "Senior Verifying Engineer"
                : "Citizen Observer",
        notes: actionNotes || `Status updated to ${newStatus}`,
        afterPhotoUrl:
          newStatus === "awaiting_verification" ? afterPhotoUrl : undefined,
        assignedCrew:
          newStatus === "assigned"
            ? "Municipal Asphalt Response Crew 4"
            : undefined,
        verificationDecision:
          newStatus === "verified_repaired" ? "approved" : undefined,
      })
      onIssueUpdated(updated)
      setActionNotes("")
    } catch (err: any) {
      setTransitionError(err.message || "Failed to transition status.")
    } finally {
      setIsTransitioning(false)
    }
  }

  const handleReopenSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reopenReason.trim()) return
    try {
      const updated = RoadIssueService.updateStatus(issue.id, "reopened", {
        actorRole: currentUserRole,
        actorName: "Citizen Quality Monitor",
        notes: `Issue reopened: ${reopenReason}`,
        reopenReason,
      })
      onIssueUpdated(updated)
      setShowReopenModal(false)
      setReopenReason("")
    } catch (err: any) {
      setTransitionError(err.message)
    }
  }

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const updated = RoadIssueService.supportIssue(issue.id, {
        userName: supportName || "Local Commuter",
        userRole: currentUserRole,
        notes: supportNotes || "Confirmed hazard still present on roadway.",
      })
      onIssueUpdated(updated)
      setShowSupportModal(false)
      setSupportNotes("")
      setSupportName("")
    } catch (err: any) {
      setTransitionError(err.message)
    }
  }

  const statusFormatted = issue.status.replace("_", " ").toUpperCase()

  return (
    <div className="drawer-overlay">
      <div className="drawer-backdrop" onClick={onClose} />

      <motion.aside
        className="drawer-panel glass"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 180, damping: 25 }}
      >
        {/* Top Bar with Role Switcher & Close */}
        <div className="drawer-top-bar">
          <div className="drawer-role-selector">
            <span className="role-selector-label">
              <User size={13} /> ACTIVE ROLE:
            </span>
            <select
              value={currentUserRole}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className="drawer-role-select"
            >
              <option value="citizen">Citizen</option>
              <option value="authority">District Authority</option>
              <option value="crew">Maintenance Crew</option>
              <option value="inspector">Verification Officer</option>
            </select>
          </div>

          <button
            onClick={onClose}
            className="drawer-close-btn"
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Header Metadata */}
        <div className="drawer-header">
          <div className="drawer-header-chips">
            <span className="tracking-code-pill">#{issue.trackingCode}</span>
            <span className={`status-pill ${issue.status.replace("_", "-")}`}>
              {statusFormatted}
            </span>
            <span className={`risk-badge-mini ${issue.risk.level}`}>
              RISK {issue.risk.score}/100 · {issue.risk.level.toUpperCase()}
            </span>
          </div>

          <h2 className="drawer-title">{issue.title}</h2>
          <p className="drawer-address">
            <MapPin size={15} className="text-vermilion" /> {issue.address}
          </p>

          <div className="drawer-coords-row">
            <span>LAT: {issue.coordinates.lat.toFixed(5)}° N</span>
            <span>LNG: {issue.coordinates.lng.toFixed(5)}° W</span>
            {onFlyToGlobe && (
              <button
                type="button"
                onClick={() => onFlyToGlobe(issue)}
                className="fly-globe-link-btn"
                title="Fly to location in 3D Globe"
              >
                <Globe size={13} /> <span>Fly in 3D Globe</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="drawer-nav-tabs">
          {[
            ["overview", "Overview"],
            ["risk", "Risk Engine (0-100)"],
            ["repair", "Repair Verification"],
            ["timeline", `Timeline (${issue.statusHistory.length})`],
            ["community", `Community (${issue.supportingCount})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`drawer-tab-btn ${activeTab === id ? "active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="drawer-content-scroll">
          {transitionError && (
            <div className="drawer-error-banner">
              <AlertTriangle size={16} />
              <span>{transitionError}</span>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="tab-pane">
              {/* Photo & AI Annotations View */}
              <div className="drawer-media-box">
                <div className="drawer-photo-container">
                  <img
                    src={issue.annotatedPhotoUrl || issue.originalPhotoUrl}
                    alt={issue.title}
                    className="drawer-main-photo"
                  />
                  <div className="photo-corner-tag">
                    {issue.detection.engine === "edge_cv"
                      ? "EDGE VISION ANALYZED"
                      : "AI DETECTED"}
                  </div>
                </div>

                <div className="drawer-telemetry-strip glass">
                  <div>
                    <small>CATEGORY</small>
                    <strong>{issue.category.toUpperCase()}</strong>
                  </div>
                  <div>
                    <small>EST. DEPTH</small>
                    <strong>{issue.detection.depthEstimateMm}mm</strong>
                  </div>
                  <div>
                    <small>SURFACE LOSS</small>
                    <strong>
                      {(
                        (issue.detection.surfaceLossRatio || 0.15) * 100
                      ).toFixed(0)}
                      %
                    </strong>
                  </div>
                  <div>
                    <small>CONFIDENCE</small>
                    <strong className="text-vermilion">
                      {((issue.detection.confidence || 0.94) * 100).toFixed(0)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* Status Action Workflow Card */}
              <div className="drawer-action-card glass">
                <div className="action-card-header">
                  <Activity size={16} className="text-vermilion" />
                  <span>LIFECYCLE TRANSITION CONTROLS</span>
                </div>
                <p className="action-card-sub">
                  Controls available for your current role:{" "}
                  <strong>{currentUserRole.toUpperCase()}</strong>
                </p>

                {/* Role Specific Actions */}
                <div className="role-actions-container">
                  {currentUserRole === "authority" && (
                    <>
                      {issue.status === "reported" && (
                        <button
                          onClick={() => handleStatusChange("under_review")}
                          disabled={isTransitioning}
                          className="button button--primary full-width"
                        >
                          <Check size={16} />
                          <span>Approve & Move to Under Review</span>
                        </button>
                      )}
                      {issue.status === "under_review" && (
                        <button
                          onClick={() => handleStatusChange("assigned")}
                          disabled={isTransitioning}
                          className="button button--primary full-width"
                        >
                          <ChevronRight size={16} />
                          <span>Assign to Maintenance Crew</span>
                        </button>
                      )}
                      {["reported", "under_review"].includes(issue.status) && (
                        <button
                          onClick={() => handleStatusChange("rejected")}
                          disabled={isTransitioning}
                          className="button-secondary-danger full-width"
                        >
                          <X size={16} />
                          <span>Reject (Private Property / Duplicate)</span>
                        </button>
                      )}
                    </>
                  )}

                  {currentUserRole === "crew" && (
                    <>
                      {issue.status === "assigned" && (
                        <button
                          onClick={() => handleStatusChange("in_progress")}
                          disabled={isTransitioning}
                          className="button button--primary full-width"
                        >
                          <Activity size={16} />
                          <span>Accept & Begin Repair On-Site</span>
                        </button>
                      )}
                      {issue.status === "in_progress" && (
                        <div className="crew-completion-box">
                          <label className="field-label">
                            AFTER-REPAIR PHOTO EVIDENCE
                          </label>
                          <input
                            type="text"
                            value={afterPhotoUrl}
                            onChange={(e) => setAfterPhotoUrl(e.target.value)}
                            className="text-input-field"
                            placeholder="Enter image URL or select preset"
                          />
                          <div className="preset-photo-buttons">
                            <button
                              type="button"
                              onClick={() =>
                                setAfterPhotoUrl("/images/repaired_road.jpg")
                              }
                              className="preset-btn"
                            >
                              Standard Hot-Mix Resurfaced Photo
                            </button>
                          </div>
                          <button
                            onClick={() =>
                              handleStatusChange("awaiting_verification")
                            }
                            disabled={isTransitioning}
                            className="button button--primary full-width mt-2"
                          >
                            <ShieldCheck size={16} />
                            <span>Submit for Municipal Verification</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {currentUserRole === "inspector" && (
                    <>
                      {issue.status === "awaiting_verification" && (
                        <div className="inspector-actions-grid">
                          <button
                            onClick={() =>
                              handleStatusChange("verified_repaired")
                            }
                            disabled={isTransitioning}
                            className="button button--primary full-width"
                          >
                            <CheckCircle2 size={16} />
                            <span>Approve & Verify Quality Resurfacing</span>
                          </button>
                          <button
                            onClick={() => setShowReopenModal(true)}
                            disabled={isTransitioning}
                            className="button-secondary-danger full-width"
                          >
                            <RotateCcw size={16} />
                            <span>Reject & Request Crew Remediation</span>
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {currentUserRole === "citizen" && (
                    <>
                      <button
                        onClick={() => setShowSupportModal(true)}
                        className="button button--primary full-width"
                      >
                        <ThumbsUp size={16} />
                        <span>Confirm / Add Supporting Evidence</span>
                      </button>
                      {issue.status === "verified_repaired" && (
                        <button
                          onClick={() => setShowReopenModal(true)}
                          className="button-secondary-danger full-width"
                        >
                          <RotateCcw size={16} />
                          <span>Report Defect Return (Reopen Issue)</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXPLAINABLE RISK ENGINE */}
          {activeTab === "risk" && (
            <div className="tab-pane">
              <div className="risk-score-hero glass">
                <div className="risk-gauge-circle">
                  <span className="risk-big-number">{issue.risk.score}</span>
                  <span className="risk-max-denom">/ 100</span>
                </div>
                <div className="risk-hero-meta">
                  <span className={`risk-level-badge ${issue.risk.level}`}>
                    {issue.risk.level.toUpperCase()} PRIORITY
                  </span>
                  <p className="risk-explanation-text">
                    {issue.risk.explanation}
                  </p>
                </div>
              </div>

              {/* Recommended Action */}
              <div className="risk-recommendation-card glass">
                <div className="rec-header">
                  <ShieldCheck size={16} className="text-vermilion" />
                  <span>RECOMMENDED MUNICIPAL ACTION</span>
                </div>
                <p>{issue.risk.recommendedAction}</p>
              </div>

              {/* Factor by Factor Contributions */}
              <div className="risk-factors-breakdown">
                <h4 className="factors-title">
                  FACTOR CONTRIBUTIONS (FORMULA WEIGHTS)
                </h4>

                {[
                  {
                    key: "damageSeverity",
                    label: "1. Damage Severity",
                    desc: "Cavity depth & asphalt surface loss",
                    val: issue.risk.factors.damageSeverity,
                    weight: "35%",
                    contrib: issue.risk.weightedContributions.damageSeverity,
                  },
                  {
                    key: "roadUsage",
                    label: "2. Road Usage / Traffic Exposure",
                    desc: "Arterial volume & cyclist vulnerability",
                    val: issue.risk.factors.roadUsage,
                    weight: "25%",
                    contrib: issue.risk.weightedContributions.roadUsage,
                  },
                  {
                    key: "sensitiveProximity",
                    label: "3. Sensitive Location Proximity",
                    desc: "Distance to schools, hospitals & crossings",
                    val: issue.risk.factors.sensitiveProximity,
                    weight: "15%",
                    contrib:
                      issue.risk.weightedContributions.sensitiveProximity,
                  },
                  {
                    key: "supportingReports",
                    label: "4. Supporting Confirmations",
                    desc: "Distinct community witness reports",
                    val: issue.risk.factors.supportingReports,
                    weight: "15%",
                    contrib: issue.risk.weightedContributions.supportingReports,
                  },
                  {
                    key: "unresolvedDuration",
                    label: "5. Unresolved Age / Duration",
                    desc: "Observation days remaining open",
                    val: issue.risk.factors.unresolvedDuration,
                    weight: "10%",
                    contrib:
                      issue.risk.weightedContributions.unresolvedDuration,
                  },
                ].map((factor) => (
                  <div key={factor.key} className="factor-row glass">
                    <div className="factor-info">
                      <strong>{factor.label}</strong>
                      <small>{factor.desc}</small>
                    </div>
                    <div className="factor-metrics">
                      <div className="factor-bar-track">
                        <div
                          className="factor-bar-fill"
                          style={{ width: `${factor.val}%` }}
                        />
                      </div>
                      <span className="factor-points">
                        +{factor.contrib} pts ({factor.weight})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: REPAIR VERIFICATION */}
          {activeTab === "repair" && (
            <div className="tab-pane">
              {issue.repair.afterPhotoUrl ? (
                <div className="repair-comparison-interactive">
                  <p className="tab-subtext">
                    Interactive Before vs After Split Comparison (Drag slider to
                    inspect repair match):
                  </p>

                  <div className="interactive-slider-container">
                    <img
                      src={issue.repair.afterPhotoUrl}
                      alt="Repaired Road"
                      className="slider-base-img"
                    />

                    <div
                      className="slider-split-overlay"
                      style={{ width: `${sliderPos}%` }}
                    >
                      <img
                        src={issue.originalPhotoUrl}
                        alt="Damaged Road"
                        className="slider-overlay-img"
                      />
                      <span className="slider-label-before">
                        BEFORE (DAMAGED)
                      </span>
                    </div>

                    <span className="slider-label-after">AFTER (REPAIRED)</span>

                    {/* Draggable Divider */}
                    <div
                      className="slider-divider-line"
                      style={{ left: `${sliderPos}%` }}
                    >
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sliderPos}
                        onChange={(e) => setSliderPos(Number(e.target.value))}
                        className="slider-range-input"
                      />
                      <div className="slider-grab-handle">
                        <SlidersHorizontal size={14} />
                      </div>
                    </div>
                  </div>

                  <div className="repair-meta-card glass">
                    <div className="meta-pair">
                      <small>ASSIGNED CREW</small>
                      <strong>
                        {issue.repair.assignedCrew ||
                          "Central Rapid Response Crew"}
                      </strong>
                    </div>
                    <div className="meta-pair">
                      <small>COMPLETION TIMESTAMP</small>
                      <span>
                        {issue.repair.repairCompletedAt
                          ? new Date(
                              issue.repair.repairCompletedAt,
                            ).toLocaleString()
                          : "Recently Finished"}
                      </span>
                    </div>
                    <div className="meta-pair">
                      <small>VERIFICATION DECISION</small>
                      <strong
                        className={
                          issue.repair.verificationDecision === "approved"
                            ? "text-emerald-500"
                            : "text-amber"
                        }
                      >
                        {issue.repair.verificationDecision
                          ? issue.repair.verificationDecision.toUpperCase()
                          : "PENDING REVIEW"}
                      </strong>
                    </div>
                    {issue.repair.verifiedBy && (
                      <div className="meta-pair">
                        <small>VERIFIED BY</small>
                        <span>{issue.repair.verifiedBy}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="no-repair-photo-empty glass">
                  <ShieldAlert size={36} className="text-amber" />
                  <h4>NO AFTER-REPAIR EVIDENCE LOGGED</h4>
                  <p>
                    This hazard has not yet been marked completed with
                    photographic evidence by maintenance crew.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT TIMELINE */}
          {activeTab === "timeline" && (
            <div className="tab-pane">
              <div className="audit-timeline-flow">
                {issue.statusHistory.map((item, idx) => (
                  <div key={item.id || idx} className="timeline-audit-item">
                    <div className="audit-node">
                      <Check size={12} />
                    </div>
                    <div className="audit-card glass">
                      <div className="audit-header">
                        <span className="audit-status-badge">
                          {item.toStatus.toUpperCase().replace("_", " ")}
                        </span>
                        <span className="audit-time">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="audit-actor">
                        By <strong>{item.actorName}</strong> ({item.actorRole})
                      </p>
                      <p className="audit-notes">{item.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: COMMUNITY CONFIRMATIONS */}
          {activeTab === "community" && (
            <div className="tab-pane">
              <div className="community-summary-card glass">
                <div>
                  <small>TOTAL CONFIRMATIONS</small>
                  <strong className="text-vermilion">
                    {issue.supportingCount} Independent Reports
                  </strong>
                </div>
                <button
                  onClick={() => setShowSupportModal(true)}
                  className="button button--primary"
                >
                  <ThumbsUp size={14} /> <span>Add Confirmation</span>
                </button>
              </div>

              <div className="community-reports-list">
                {issue.supportingReports.map((report) => (
                  <div key={report.id} className="community-report-item glass">
                    <div className="report-user-row">
                      <strong>{report.userName}</strong>
                      <small>
                        {new Date(report.timestamp).toLocaleDateString()}
                      </small>
                    </div>
                    <p className="report-notes-text">
                      "{report.notes || "Hazard verified in active lane."}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MODAL: Reopen Issue Modal */}
        <AnimatePresence>
          {showReopenModal && (
            <div className="nested-modal-overlay">
              <motion.div
                className="nested-modal-card glass"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <h3>REOPEN ROAD ISSUE</h3>
                <p>
                  Provide evidence notes describing why this road defect
                  requires remediation:
                </p>
                <form onSubmit={handleReopenSubmit}>
                  <textarea
                    rows={3}
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="E.g. Asphalt patch settled or cracked after rain, cavity reopened..."
                    className="report-textarea"
                    required
                  />
                  <div className="modal-actions mt-3">
                    <button
                      type="button"
                      onClick={() => setShowReopenModal(false)}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="button button--primary">
                      Submit Reopen Evidence
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: Support Existing Modal */}
        <AnimatePresence>
          {showSupportModal && (
            <div className="nested-modal-overlay">
              <motion.div
                className="nested-modal-card glass"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <h3>CONFIRM ROAD DEFECT</h3>
                <p>
                  Add your observation to strengthen community priority for this
                  defect:
                </p>
                <form onSubmit={handleSupportSubmit}>
                  <input
                    type="text"
                    value={supportName}
                    onChange={(e) => setSupportName(e.target.value)}
                    placeholder="Your Name / Commuter handle (optional)"
                    className="text-input-field mb-2"
                  />
                  <textarea
                    rows={3}
                    value={supportNotes}
                    onChange={(e) => setSupportNotes(e.target.value)}
                    placeholder="E.g. Causing traffic brake-checks during peak morning hours..."
                    className="report-textarea"
                    required
                  />
                  <div className="modal-actions mt-3">
                    <button
                      type="button"
                      onClick={() => setShowSupportModal(false)}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                    <button type="submit" className="button button--primary">
                      Confirm Telemetry
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.aside>
    </div>
  )
}
