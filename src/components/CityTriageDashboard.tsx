import React, { useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Filter,
  Globe,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  User,
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
}: CityTriageDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  if (!isOpen) return null

  const stats = RoadIssueService.getCityStatistics()

  const filteredIssues = issues.filter((issue) => {
    if (selectedStatus !== "all" && issue.status !== selectedStatus)
      return false
    if (selectedSeverity !== "all" && issue.severity !== selectedSeverity)
      return false
    if (selectedCategory !== "all" && issue.category !== selectedCategory)
      return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchText =
        `${issue.title} ${issue.address} ${issue.trackingCode} ${issue.category}`.toLowerCase()
      if (!matchText.includes(q)) return false
    }
    return true
  })

  return (
    <div className="triage-modal-overlay">
      <div className="triage-modal-backdrop" onClick={onClose} />

      <motion.div
        className="triage-modal-container glass"
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      >
        {/* Top Header */}
        <div className="triage-top-bar">
          <div className="triage-title-group">
            <span className="eyebrow">
              <span /> MUNICIPAL STREET INTELLIGENCE
            </span>
            <h2 className="triage-heading">
              CITY ROAD RISK & TRIAGE OPERATIONS
            </h2>
          </div>

          <div className="triage-top-controls">
            {/* Role Switcher */}
            <div className="triage-role-pill glass">
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

            <button
              onClick={onRefreshData}
              className="triage-icon-btn glass"
              title="Refresh city data"
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

        {/* City Stats Bar */}
        <div className="triage-metrics-grid">
          <div className="triage-metric-card glass">
            <small>ACTIVE ROAD DEFECTS</small>
            <div className="metric-num-row">
              <strong>{stats.activeHazards}</strong>
              <span className="metric-tag">Monitored</span>
            </div>
          </div>

          <div className="triage-metric-card glass highlight-vermilion">
            <small>CRITICAL EMERGENCIES</small>
            <div className="metric-num-row">
              <strong className="text-vermilion">
                {stats.criticalEmergencies}
              </strong>
              <span className="metric-tag urgent">Immediate Dispatch</span>
            </div>
          </div>

          <div className="triage-metric-card glass">
            <small>AVERAGE CITY RISK</small>
            <div className="metric-num-row">
              <strong>{stats.averageCityRiskScore}</strong>
              <span className="metric-tag">Score / 100</span>
            </div>
          </div>

          <div className="triage-metric-card glass">
            <small>VERIFIED REPAIRED</small>
            <div className="metric-num-row">
              <strong className="text-emerald-500">
                {stats.verifiedRepaired}
              </strong>
              <span className="metric-tag verified">Resolved</span>
            </div>
          </div>

          <div className="triage-metric-card glass">
            <small>COMMUNITY CONFIRMATIONS</small>
            <div className="metric-num-row">
              <strong>{stats.communityConfirmations}</strong>
              <span className="metric-tag">Citizen Reports</span>
            </div>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="triage-filters-bar glass">
          <div className="triage-search-input-wrap">
            <Search size={15} className="triage-search-icon" />
            <input
              type="text"
              placeholder="Filter by defect ID, street, category, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="triage-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="search-clear-btn"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="triage-filters-group">
            {/* Status Filter */}
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
              <option value="awaiting_verification">
                Awaiting Verification
              </option>
              <option value="verified_repaired">Verified Repaired</option>
              <option value="reopened">Reopened</option>
            </select>

            {/* Severity Filter */}
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

            {/* Category Filter */}
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

            <button
              onClick={onOpenReportModal}
              className="button button--primary triage-add-btn"
            >
              <span>+ Report Hazard</span>
            </button>
          </div>
        </div>

        {/* Issues List Table */}
        <div className="triage-table-container">
          {filteredIssues.length > 0 ? (
            <div className="triage-cards-grid">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="triage-issue-card glass"
                  onClick={() => onSelectIssue(issue)}
                >
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
                    </div>

                    <h3 className="triage-card-title">{issue.title}</h3>
                    <p className="triage-card-address">
                      <MapPin size={13} className="text-vermilion" />{" "}
                      {issue.address}
                    </p>

                    <p className="triage-card-explanation-snippet">
                      {issue.risk.explanation}
                    </p>

                    <div className="triage-card-footer">
                      <div className="footer-left-metrics">
                        <span>
                          <strong>{issue.supportingCount}</strong> Confirmations
                        </span>
                        <span>•</span>
                        <span>
                          Depth:{" "}
                          <strong>{issue.detection.depthEstimateMm}mm</strong>
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(issue.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div
                        className="footer-right-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenGlobeForIssue(issue)}
                          className="triage-sub-btn"
                          title="View on 3D Globe"
                        >
                          <Globe size={14} />
                          <span>3D Globe</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectIssue(issue)}
                          className="triage-action-btn"
                        >
                          <span>Manage</span>
                          <ArrowDownRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="triage-empty-state glass">
              <ShieldAlert size={40} className="text-vermilion" />
              <h3>NO ROAD DEFECTS MATCH FILTER</h3>
              <p>
                Try resetting the status, severity, or search query filter to
                view all monitored defects.
              </p>
              <button
                onClick={() => {
                  setSelectedStatus("all")
                  setSelectedSeverity("all")
                  setSelectedCategory("all")
                  setSearchQuery("")
                }}
                className="button button--secondary"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
