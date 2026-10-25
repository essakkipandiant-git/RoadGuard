import React, { useEffect, useRef, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  ThumbsUp,
  Upload,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { SelectedLocation } from "./GlobeLocationPicker"
import {
  AIDetectionResult,
  DamageCategory,
  DuplicateMatchResult,
  RoadClass,
  RoadIssue,
  SeverityLevel,
} from "../types/roadguard"
import {
  inspectRoadImage,
  validateImageFile,
} from "../services/aiInspectionService"
import {
  calculateRiskAssessment,
  calculateDamageSeverityFactor,
} from "../services/riskEngine"
import {
  findPotentialDuplicates,
  supportExistingIssue,
} from "../services/duplicateService"
import { RoadIssueService } from "../services/roadIssueService"
import PossibleDuplicateDialog from "./PossibleDuplicateDialog"

type PotholeReportModalProps = {
  isOpen: boolean
  onClose: () => void
  location: SelectedLocation | null
  onOpenGlobe: () => void
  onReportCreated?: (issue: RoadIssue) => void
}

const DAMAGE_TYPES: {
  id: DamageCategory
  label: string
  icon: any
  defaultSeverity: SeverityLevel
}[] = [
  {
    id: "cavity",
    label: "Deep Pothole Cavity",
    icon: AlertTriangle,
    defaultSeverity: "critical",
  },
  {
    id: "crack",
    label: "Longitudinal / Web Cracking",
    icon: ShieldAlert,
    defaultSeverity: "high",
  },
  {
    id: "edge",
    label: "Asphalt Edge Failure",
    icon: Compass,
    defaultSeverity: "moderate",
  },
  {
    id: "depression",
    label: "Subsurface Settlement",
    icon: FileText,
    defaultSeverity: "high",
  },
  {
    id: "rutting",
    label: "Wheelpath Rutting",
    icon: Layers,
    defaultSeverity: "moderate",
  },
]

const SEVERITIES: {
  id: SeverityLevel
  label: string
  color: string
  desc: string
}[] = [
  {
    id: "critical",
    label: "Level 1 · Critical",
    color: "#E65336",
    desc: "Immediate rim/chassis hazard",
  },
  {
    id: "high",
    label: "Level 2 · High",
    color: "#F16649",
    desc: "Significant vehicle impact",
  },
  {
    id: "moderate",
    label: "Level 3 · Moderate",
    color: "#E69D36",
    desc: "Early structural wear",
  },
  {
    id: "low",
    label: "Level 4 · Low",
    color: "#687567",
    desc: "Superficial road distress",
  },
]

export default function PotholeReportModal({
  isOpen,
  onClose,
  location,
  onOpenGlobe,
  onReportCreated,
}: PotholeReportModalProps) {
  // Form State
  const [selectedType, setSelectedType] = useState<DamageCategory>("cavity")
  const [selectedSeverity, setSelectedSeverity] =
    useState<SeverityLevel>("critical")
  const [roadClass, setRoadClass] = useState<RoadClass>("arterial")
  const [notes, setNotes] = useState("")
  const [reporterName, setReporterName] = useState("")

  // Photo & AI Inspection State
  const [selectedPhoto, setSelectedPhoto] = useState<string>(
    "/images/detection_asphalt.jpg",
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState("")
  const [detectionResult, setDetectionResult] =
    useState<AIDetectionResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [viewAnnotated, setViewAnnotated] = useState(true)

  // Duplicate Matching State
  const [duplicateResult, setDuplicateResult] =
    useState<DuplicateMatchResult | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [isDuplicateDismissed, setIsDuplicateDismissed] = useState(false)

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedReport, setSubmittedReport] = useState<RoadIssue | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Run AI Inspection whenever photo changes
  const runInspection = async (fileOrUrl: File | string) => {
    setIsAnalyzing(true)
    setUploadError(null)
    try {
      const result = await inspectRoadImage(fileOrUrl, (stage) =>
        setAnalysisProgress(stage),
      )
      setDetectionResult(result)
      setSelectedType(result.category)
      setSelectedSeverity(result.severity)
    } catch (err: any) {
      setUploadError(err.message || "Failed to analyze road photograph.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Run initial analysis when modal opens
  useEffect(() => {
    if (isOpen && !detectionResult) {
      runInspection(selectedPhoto)
    }
  }, [isOpen])

  // Check for duplicate issues when location or category updates
  useEffect(() => {
    if (location && !isDuplicateDismissed) {
      const allIssues = RoadIssueService.getAllIssues()
      const match = findPotentialDuplicates(
        { lat: location.lat, lng: location.lng },
        selectedType,
        allIssues,
        40, // 40m threshold
      )

      if (match.isDuplicate && match.existingIssue) {
        setDuplicateResult(match)
        setShowDuplicateDialog(true)
      }
    }
  }, [location, selectedType, isDuplicateDismissed])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.isValid) {
      setUploadError(validation.error || "Invalid file format.")
      return
    }

    setPhotoFile(file)
    const objectUrl = URL.createObjectURL(file)
    setSelectedPhoto(objectUrl)
    runInspection(file)
  }

  const handleRemovePhoto = () => {
    setSelectedPhoto("/images/detection_asphalt.jpg")
    setPhotoFile(null)
    setDetectionResult(null)
    runInspection("/images/detection_asphalt.jpg")
  }

  // User decides to support existing issue from duplicate dialog
  const handleSupportExisting = () => {
    if (!duplicateResult?.existingIssue) return
    try {
      const updated = RoadIssueService.supportIssue(
        duplicateResult.existingIssue.id,
        {
          userName: reporterName || "Local Resident",
          photoUrl: selectedPhoto,
          notes: notes || "Confirmed identical hazard at this location.",
        },
      )
      setShowDuplicateDialog(false)
      setSubmittedReport(updated)
      onReportCreated?.(updated)
    } catch (err: any) {
      setUploadError(err.message)
    }
  }

  // User dismisses duplicate dialog and insists on separate report
  const handleContinueAsNew = () => {
    setIsDuplicateDismissed(true)
    setShowDuplicateDialog(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!location) {
      setUploadError(
        "Please select a location on the 3D Globe before submitting.",
      )
      return
    }

    setIsSubmitting(true)
    setUploadError(null)

    try {
      const depthMm =
        detectionResult?.depthEstimateMm ||
        (selectedType === "cavity" ? 60 : 25)
      const damageFactor = calculateDamageSeverityFactor({
        category: selectedType,
        depthMm,
        surfaceLossRatio: detectionResult?.surfaceLossRatio || 0.15,
      })

      // Calculate Deterministic Explainable Risk Assessment
      const calculatedRisk = calculateRiskAssessment({
        factors: {
          damageSeverity: damageFactor,
          roadUsage:
            roadClass === "arterial" ? 90 : roadClass === "collector" ? 70 : 40,
          sensitiveProximity: 60, // Baseline sensitive proximity
          supportingReports: 20, // Initial report
          unresolvedDuration: 10, // Fresh report
        },
        category: selectedType,
        depthMm,
        roadClass,
        supportingCount: 1,
        nearestSensitiveType: "crossing",
        distanceMeters: 120,
      })

      const effectiveDetection: AIDetectionResult = detectionResult || {
        engine: "edge_cv",
        category: selectedType,
        confidence: 0.94,
        boxes: [],
        surfaceLossRatio: 0.14,
        depthEstimateMm: depthMm,
        severity: selectedSeverity,
        originalImageUrl: selectedPhoto,
        annotatedImageUrl: selectedPhoto,
        rawInferenceTimeMs: 15,
      }

      const newIssue = RoadIssueService.createIssue({
        title: `${DAMAGE_TYPES.find((t) => t.id === selectedType)?.label || "Road Damage"}`,
        category: selectedType,
        severity: selectedSeverity,
        status: "reported",
        coordinates: { lat: location.lat, lng: location.lng },
        address: location.address,
        roadName: location.road || location.address.split(",")[0],
        city: location.city || "Urban District",
        originalPhotoUrl: selectedPhoto,
        annotatedPhotoUrl:
          effectiveDetection.annotatedImageUrl || selectedPhoto,
        detection: effectiveDetection,
        risk: calculatedRisk,
        reportedBy: reporterName || "Citizen Reporter",
        reporterName: reporterName || "Citizen Reporter",
        notes,
      })

      setSubmittedReport(newIssue)
      onReportCreated?.(newIssue)
    } catch (err: any) {
      setUploadError(err.message || "Failed to transmit report.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setSubmittedReport(null)
    setNotes("")
    setIsDuplicateDismissed(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <div className="report-modal-overlay">
        <div className="report-modal-backdrop" onClick={onClose} />

        <motion.div
          className="report-modal-card glass"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>

          {submittedReport ? (
            /* SUCCESS STATE */
            <div className="report-success-state">
              <div className="success-badge-icon">
                <CheckCircle2 size={48} className="text-emerald-500" />
              </div>
              <span className="eyebrow">
                <span /> ROAD TELEMETRY DISPATCH CREATED
              </span>
              <h2 className="success-title">INCIDENT LOGGED</h2>
              <div className="tracking-code-pill">
                <span>TRACKING ID:</span>
                <strong>#{submittedReport.trackingCode}</strong>
              </div>

              <p className="success-copy">
                Thank you for contributing to safer streets. Your report has
                been inspected by RoadGuard AI, evaluated for municipal risk
                priority, and added to the city dispatch registry.
              </p>

              <div className="success-details-card glass">
                <div>
                  <small>LOCATION</small>
                  <strong>{submittedReport.address}</strong>
                </div>
                <div>
                  <small>COORDINATES</small>
                  <span>
                    {submittedReport.coordinates.lat.toFixed(5)}° N,{" "}
                    {submittedReport.coordinates.lng.toFixed(5)}° W
                  </span>
                </div>
                <div>
                  <small>AI RISK PRIORITY</small>
                  <strong className="text-vermilion">
                    {submittedReport.risk.score}/100 (
                    {submittedReport.risk.level.toUpperCase()})
                  </strong>
                </div>
                <div>
                  <small>COMMUNITY CONFIRMATIONS</small>
                  <strong>{submittedReport.supportingCount} Reports</strong>
                </div>
              </div>

              <div className="success-actions">
                <button
                  onClick={handleReset}
                  className="button button--primary"
                >
                  Done & Return to Overview
                </button>
              </div>
            </div>
          ) : (
            /* REPORT FORM WITH AI INSPECTOR */
            <form onSubmit={handleSubmit} className="report-form-flow">
              <div className="modal-header">
                <p className="eyebrow">
                  <span /> AI ROAD TELEMETRY
                </p>
                <h2 className="modal-title">REPORT ROAD DAMAGE</h2>
                <p className="modal-subtitle">
                  Upload road photography to run automated computer vision
                  inspection and calculate explainable risk.
                </p>
              </div>

              {uploadError && (
                <div className="drawer-error-banner">
                  <AlertTriangle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* 1. PHOTO EVIDENCE & AI ROAD INSPECTOR */}
              <div className="form-group">
                <div className="field-label-row">
                  <label className="field-label">
                    ROAD DAMAGE PHOTOGRAPHY & AI INSPECTION
                  </label>
                  {detectionResult && (
                    <button
                      type="button"
                      onClick={() => setViewAnnotated(!viewAnnotated)}
                      className="toggle-annotation-btn"
                    >
                      <Eye size={12} />
                      <span>
                        {viewAnnotated
                          ? "Show Original"
                          : "Show AI Annotations"}
                      </span>
                    </button>
                  )}
                </div>

                <div className="ai-inspector-container glass">
                  {/* Photo Preview Stage */}
                  <div className="ai-photo-stage">
                    <img
                      src={
                        viewAnnotated && detectionResult?.annotatedImageUrl
                          ? detectionResult.annotatedImageUrl
                          : selectedPhoto
                      }
                      alt="Road damage evidence"
                      className="ai-preview-img"
                    />

                    {isAnalyzing && (
                      <div className="ai-analyzing-overlay">
                        <Loader2
                          size={32}
                          className="animate-spin text-vermilion"
                        />
                        <span className="analyzing-text">
                          {analysisProgress || "Analyzing asphalt surface..."}
                        </span>
                      </div>
                    )}

                    <div className="ai-engine-chip">
                      <span className="live-dot" />
                      <span>
                        {detectionResult?.engine === "edge_cv"
                          ? "EDGE COMPUTER VISION"
                          : "AI DETECTED"}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Sample Selector */}
                  <div className="ai-controls-col">
                    <div className="upload-buttons-row">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileUpload}
                        style={{ display: "none" }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="button button--secondary upload-photo-btn"
                      >
                        <Upload size={14} />
                        <span>Upload Photograph (JPG/PNG/WEBP)</span>
                      </button>

                      {photoFile && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="remove-photo-link"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="sample-selector-row">
                      <small>QUICK SAMPLES:</small>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPhoto("/images/detection_asphalt.jpg")
                          runInspection("/images/detection_asphalt.jpg")
                        }}
                        className={`sample-pill ${
                          selectedPhoto === "/images/detection_asphalt.jpg"
                            ? "active"
                            : ""
                        }`}
                      >
                        Deep Cavity
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPhoto("/images/hero_road.jpg")
                          runInspection("/images/hero_road.jpg")
                        }}
                        className={`sample-pill ${
                          selectedPhoto === "/images/hero_road.jpg"
                            ? "active"
                            : ""
                        }`}
                      >
                        Web Cracking
                      </button>
                    </div>

                    {/* AI Inspection Metrics Readout */}
                    {detectionResult && (
                      <div className="ai-telemetry-metrics glass">
                        <div className="metric-box">
                          <small>DETECTED HAZARD</small>
                          <strong>
                            {detectionResult.category.toUpperCase()}
                          </strong>
                        </div>
                        <div className="metric-box">
                          <small>CONFIDENCE</small>
                          <strong className="text-vermilion">
                            {(
                              (detectionResult.confidence || 0.94) * 100
                            ).toFixed(0)}
                            %
                          </strong>
                        </div>
                        <div className="metric-box">
                          <small>EST. DEPTH</small>
                          <strong>{detectionResult.depthEstimateMm}mm</strong>
                        </div>
                        <div className="metric-box">
                          <small>SURFACE LOSS</small>
                          <strong>
                            {(
                              (detectionResult.surfaceLossRatio || 0.15) * 100
                            ).toFixed(0)}
                            %
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. GEOGRAPHIC COORDINATES (3D GLOBE INTEGRATION) */}
              <div className="form-group">
                <div className="selected-location-box glass">
                  <div className="location-box-header">
                    <div className="loc-label-group">
                      <MapPin size={16} className="text-vermilion" />
                      <span>SELECTED ROAD COORDINATES</span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenGlobe}
                      className="repick-globe-btn"
                      title="Adjust on 3D Globe"
                    >
                      <Globe size={13} />
                      <span>Pick on 3D Globe</span>
                    </button>
                  </div>

                  {location ? (
                    <div className="location-verified-info">
                      <strong>{location.address}</strong>
                      <div className="coord-chips">
                        <span>LAT: {location.lat.toFixed(5)}° N</span>
                        <span>LNG: {location.lng.toFixed(5)}° W</span>
                        <span className="verified-chip">
                          <Check size={11} /> 3D TERRAIN VERIFIED
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="no-location-prompt">
                      <p>
                        No coordinates selected yet. Open the 3D globe to pick
                        precise street location.
                      </p>
                      <button
                        type="button"
                        onClick={onOpenGlobe}
                        className="button button--primary"
                      >
                        <span>Launch 3D Globe Picker</span>
                        <ArrowDownRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. CLASSIFICATION & SEVERITY CORRECTION */}
              <div className="form-group">
                <label className="field-label">
                  HAZARD CLASSIFICATION (AI ASSIGNED · USER CONFIRMABLE)
                </label>
                <div className="damage-type-grid">
                  {DAMAGE_TYPES.map((type) => {
                    const Icon = type.icon
                    return (
                      <button
                        type="button"
                        key={type.id}
                        className={`damage-type-card ${
                          selectedType === type.id ? "is-selected" : ""
                        }`}
                        onClick={() => setSelectedType(type.id)}
                      >
                        <Icon size={18} className="type-icon" />
                        <span>{type.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 4. SEVERITY LEVEL */}
              <div className="form-group">
                <label className="field-label">SEVERITY LEVEL</label>
                <div className="severity-row">
                  {SEVERITIES.map((sev) => (
                    <button
                      type="button"
                      key={sev.id}
                      className={`severity-pill ${
                        selectedSeverity === sev.id ? "active" : ""
                      }`}
                      onClick={() => setSelectedSeverity(sev.id)}
                    >
                      <span
                        className="sev-indicator"
                        style={{ backgroundColor: sev.color }}
                      />
                      <div>
                        <strong>{sev.label}</strong>
                        <small>{sev.desc}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. ROAD CORRIDOR CLASS */}
              <div className="form-group">
                <label className="field-label">ROAD USAGE CORRIDOR</label>
                <div className="road-class-selector-row">
                  {[
                    [
                      "arterial",
                      "Heavy Arterial / Multi-lane (Highest priority)",
                    ],
                    ["collector", "District Collector / Bus Corridor"],
                    [
                      "pedestrian_cycle",
                      "Dedicated Bike Lane / Pedestrian Zone",
                    ],
                    ["local", "Local Residential Street"],
                  ].map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setRoadClass(id as RoadClass)}
                      className={`road-class-pill ${
                        roadClass === id ? "active" : ""
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. DETAILS & REPORTER */}
              <div className="form-group">
                <label className="field-label">
                  OBSERVATIONS & DETAILS (OPTIONAL)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. In the curb lane 50m before school crossing; severe vibration on vehicle rims..."
                  className="report-textarea"
                  rows={2}
                />
              </div>

              {/* Submit Buttons */}
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="cancel-btn"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button--primary submit-report-btn"
                  disabled={isSubmitting || !location}
                >
                  {isSubmitting ? (
                    <span>Calculating Risk & Transmitting...</span>
                  ) : (
                    <>
                      <span>Submit Verified Report</span>
                      <ArrowDownRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>

      {/* Possible Duplicate Confirmation Dialog */}
      {duplicateResult && (
        <PossibleDuplicateDialog
          isOpen={showDuplicateDialog}
          onClose={() => setShowDuplicateDialog(false)}
          duplicateResult={duplicateResult}
          onSupportExisting={handleSupportExisting}
          onContinueAsNew={handleContinueAsNew}
        />
      )}
    </>
  )
}
