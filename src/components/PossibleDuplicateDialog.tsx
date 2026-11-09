import React, { useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  HardHat,
  HelpCircle,
  Layers,
  MapPin,
  ShieldAlert,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react"
import { motion } from "motion/react"
import { DuplicateMatchResult } from "../types/roadguard"

interface PossibleDuplicateDialogProps {
  isOpen: boolean
  onClose: () => void
  duplicateResult: DuplicateMatchResult
  onSupportExisting: (updateType?: string, observationNotes?: string) => Promise<void> | void
  onContinueAsNew: () => void
  initialNotes?: string
}

export default function PossibleDuplicateDialog({
  isOpen,
  onClose,
  duplicateResult,
  onSupportExisting,
  onContinueAsNew,
  initialNotes = "",
}: PossibleDuplicateDialogProps) {
  const [selectedUpdateType, setSelectedUpdateType] = useState<string>("STILL_EXISTS")
  const [customNotes, setCustomNotes] = useState(initialNotes)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !duplicateResult.existingIssue) return null

  const existing = duplicateResult.existingIssue
  const distanceFormatted =
    duplicateResult.distanceMeters < 5
      ? "Direct Match (<5m)"
      : `${Math.round(duplicateResult.distanceMeters)}m away`

  const handleConfirmSupport = async () => {
    setIsSubmitting(true)
    try {
      await onSupportExisting(selectedUpdateType, customNotes)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-backdrop" onClick={onClose} />

      <motion.div
        className="report-modal-card glass duplicate-dialog-card"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        style={{ maxWidth: "660px" }}
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
            <ShieldAlert size={18} className="text-vermilion" />
            <span>ACTIVE HAZARD RECORD WITHIN 40 METERS</span>
          </div>
          <h2 className="modal-title font-mono">NEARBY ROAD HAZARD DETECTED</h2>
          <p className="modal-subtitle">
            A previously reported road defect exists within {distanceFormatted}.
            Consolidating observations elevates municipal urgency and prevents duplicate crew dispatch.
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

        {/* Choose Citizen Observation Type */}
        <div className="space-y-3 pt-2 text-left font-mono">
          <label className="block text-xs font-bold text-[#242522] uppercase tracking-wide">
            Select Observation Type to Attach:
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectedUpdateType("STILL_EXISTS")}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedUpdateType === "STILL_EXISTS"
                  ? "border-[#E65336] bg-[#F5F1E8] shadow-sm font-bold"
                  : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[#E65336] mb-1">
                <ThumbsUp size={13} />
                <span>Still Exists</span>
              </div>
              <p className="text-[10px] text-[#687567] font-normal">
                Corroborates active unresolved cavity
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedUpdateType("WORSENED")}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedUpdateType === "WORSENED"
                  ? "border-[#E65336] bg-[#F5F1E8] shadow-sm font-bold"
                  : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-amber-600 mb-1">
                <TrendingUp size={13} />
                <span>Pothole Got Worse</span>
              </div>
              <p className="text-[10px] text-[#687567] font-normal">
                Depth or edge breakdown expanded
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedUpdateType("REPAIR_IN_PROGRESS")}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedUpdateType === "REPAIR_IN_PROGRESS"
                  ? "border-[#E65336] bg-[#F5F1E8] shadow-sm font-bold"
                  : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
                <Wrench size={13} />
                <span>Repair In Progress</span>
              </div>
              <p className="text-[10px] text-[#687567] font-normal">
                Municipal road crew spotted on site
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedUpdateType("APPEARS_REPAIRED")}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                selectedUpdateType === "APPEARS_REPAIRED"
                  ? "border-[#E65336] bg-[#F5F1E8] shadow-sm font-bold"
                  : "border-[#D8D2C5] bg-white hover:bg-[#FAF8F5]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                <CheckCircle2 size={13} />
                <span>Appears Repaired</span>
              </div>
              <p className="text-[10px] text-[#687567] font-normal">
                Submit evidence for staff verification
              </p>
            </button>
          </div>

          {selectedUpdateType === "APPEARS_REPAIRED" && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 leading-relaxed">
              <strong>Separation of Duties Notice:</strong> Your photograph and repair observation will be placed in
              the municipal audit queue for engineer verification before closing the report.
            </div>
          )}

          <div>
            <input
              type="text"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Optional observation remark for the audit timeline..."
              className="w-full px-3 py-2 rounded-xl border border-[#D8D2C5] bg-[#F5F1E8] text-xs focus:bg-white focus:outline-none focus:border-[#E65336]"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="duplicate-actions-grid pt-3">
          <button
            type="button"
            onClick={handleConfirmSupport}
            disabled={isSubmitting}
            className="button button--primary duplicate-support-btn"
          >
            <ThumbsUp size={15} />
            <span>{isSubmitting ? "Attaching Evidence..." : `Attach Evidence to #${existing.trackingCode}`}</span>
          </button>

          <button
            type="button"
            onClick={onContinueAsNew}
            disabled={isSubmitting}
            className="duplicate-secondary-btn"
          >
            <span>Different Hazard (Submit New Report)</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  )
}
