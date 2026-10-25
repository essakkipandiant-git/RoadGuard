import React from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Layers,
  MapPin,
  ShieldAlert,
  ThumbsUp,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import { DuplicateMatchResult } from "../types/roadguard"

interface PossibleDuplicateDialogProps {
  isOpen: boolean
  onClose: () => void
  duplicateResult: DuplicateMatchResult
  onSupportExisting: () => void
  onContinueAsNew: () => void
}

export default function PossibleDuplicateDialog({
  isOpen,
  onClose,
  duplicateResult,
  onSupportExisting,
  onContinueAsNew,
}: PossibleDuplicateDialogProps) {
  if (!isOpen || !duplicateResult.existingIssue) return null

  const existing = duplicateResult.existingIssue
  const distanceFormatted =
    duplicateResult.distanceMeters < 5
      ? "Direct Match (<5m)"
      : `${Math.round(duplicateResult.distanceMeters)}m away`

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-backdrop" onClick={onClose} />

      <motion.div
        className="report-modal-card glass duplicate-dialog-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        style={{ maxWidth: "620px" }}
      >
        <button
          onClick={onClose}
          className="modal-close-btn"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <div className="duplicate-dialog-header">
          <div className="duplicate-warning-badge">
            <ShieldAlert size={20} className="text-vermilion" />
            <span>EXISTING ACTIVE HAZARD DETECTED</span>
          </div>
          <h2 className="modal-title">POSSIBLE DUPLICATE ISSUE</h2>
          <p className="modal-subtitle">
            A previously reported road defect has been found at this exact
            street section. Consolidating reports accelerates municipal crew
            dispatch.
          </p>
        </div>

        {/* Existing Defect Preview Card */}
        <div className="duplicate-comparison-card glass">
          <div className="duplicate-card-media">
            <img
              src={existing.originalPhotoUrl || "/images/detection_asphalt.jpg"}
              alt={existing.title}
              className="duplicate-thumb-img"
            />
            <span className="duplicate-distance-chip">
              <MapPin size={12} /> {distanceFormatted}
            </span>
          </div>

          <div className="duplicate-card-details">
            <div className="duplicate-card-top">
              <span className="tracking-code-pill small">
                #{existing.trackingCode}
              </span>
              <span
                className={`status-pill ${existing.status.replace("_", "-")}`}
              >
                {existing.status.toUpperCase().replace("_", " ")}
              </span>
            </div>

            <h3 className="duplicate-title">{existing.title}</h3>
            <p className="duplicate-address">{existing.address}</p>

            <div className="duplicate-metrics-row">
              <div className="metric-pill">
                <small>RISK SCORE</small>
                <strong className="text-vermilion">
                  {existing.risk.score}/100
                </strong>
              </div>
              <div className="metric-pill">
                <small>CONFIRMATIONS</small>
                <strong>{existing.supportingCount} Reports</strong>
              </div>
              <div className="metric-pill">
                <small>CATEGORY</small>
                <strong>{existing.category.toUpperCase()}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Action Choice Notice */}
        <div className="duplicate-notice-box">
          <p>
            <strong>What would you like to do?</strong>
            <br />
            Supporting this defect attaches your evidence and GPS coordinates to
            the existing work order, elevating its community urgency score
            without creating redundant crew visits.
          </p>
        </div>

        {/* Actions */}
        <div className="duplicate-actions-grid">
          <button
            type="button"
            onClick={onSupportExisting}
            className="button button--primary duplicate-support-btn"
          >
            <ThumbsUp size={16} />
            <span>Support & Add Evidence to #{existing.trackingCode}</span>
          </button>

          <button
            type="button"
            onClick={onContinueAsNew}
            className="duplicate-secondary-btn"
          >
            <span>Continue Creating Independent Report</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  )
}
