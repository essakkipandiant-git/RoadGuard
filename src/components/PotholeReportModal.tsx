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
  Navigation,
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
import { apiClient, mapBackendIssueToRoadIssue } from "../services/apiClient"
import { validateMumbaiLocation } from "../services/mumbaiBoundaryClient"
import PossibleDuplicateDialog from "./PossibleDuplicateDialog"

type PotholeReportModalProps = {
  isOpen: boolean
  onClose: () => void
  location: SelectedLocation | null
  onOpenGlobe: () => void
  onReportCreated?: (issue: RoadIssue) => void
  onUpdateLocation?: (loc: SelectedLocation) => void
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
  onUpdateLocation,
}: PotholeReportModalProps) {
  // Location & Boundary State
  const [localLocation, setLocalLocation] = useState<SelectedLocation | null>(null)
  const [isLocatingGPS, setIsLocatingGPS] = useState(false)
  const activeLocation = localLocation || location
  const boundaryStatus = activeLocation
    ? validateMumbaiLocation(activeLocation.lat, activeLocation.lng)
    : null

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
    let isCancelled = false

    async function checkDuplicates() {
      if (!activeLocation || isDuplicateDismissed) return

      // 1. Try real-time backend proximity check first
      try {
        const res = await apiClient.issues.checkDuplicate({
          latitude: activeLocation.lat,
          longitude: activeLocation.lng,
          damageCategory: selectedType.toUpperCase(),
          thresholdMeters: 40,
        })

        if (isCancelled) return

        if (res.isDuplicate && res.matchedIssue) {
          const matchedRoadIssue = mapBackendIssueToRoadIssue(res.matchedIssue)
          setDuplicateResult({
            isDuplicate: true,
            existingIssue: matchedRoadIssue,
            distanceMeters: Math.round(res.distanceMeters || 0),
            categoryMatch: true,
            confidenceScore: (res.confidencePercentage || 85) / 100,
            reason:
              res.reason ||
              `Active road hazard detected ${Math.round(res.distanceMeters || 0)}m away.`,
          })
          setShowDuplicateDialog(true)
          return
        }
      } catch {
        // Fall back to local check if backend is unreachable
      }

      // 2. Local check fallback
      const allIssues = RoadIssueService.getAllIssues()
      const match = findPotentialDuplicates(
        { lat: activeLocation.lat, lng: activeLocation.lng },
        selectedType,
        allIssues,
        40, // 40m threshold
      )

      if (match.isDuplicate && match.existingIssue && !isCancelled) {
        setDuplicateResult(match)
        setShowDuplicateDialog(true)
      }
    }

    checkDuplicates()
    return () => {
      isCancelled = true
    }
  }, [activeLocation, selectedType, isDuplicateDismissed])

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
  const handleSupportExisting = async (
    updateType: string = "STILL_EXISTS",
    customNotes?: string,
  ) => {
    if (!duplicateResult?.existingIssue) return
    setIsSubmitting(true)
    setUploadError(null)
    const effectiveNotes =
      customNotes?.trim() ||
      notes?.trim() ||
      `Community observation (${updateType.replace(/_/g, " ")}) recorded via citizen reporting.`

    try {
      let updated: RoadIssue
      try {
        const res = await apiClient.issues.createCommunityUpdate(
          duplicateResult.existingIssue.id,
          {
            updateType,
            description: effectiveNotes,
            photos: [selectedPhoto],
            latitude: activeLocation?.lat,
            longitude: activeLocation?.lng,
          },
        )
        updated = res.issue
      } catch {
        updated = await RoadIssueService.supportIssueLive(
          duplicateResult.existingIssue.id,
          {
            userName: reporterName || "Local Resident",
            photoUrl: selectedPhoto,
            notes: effectiveNotes,
          },
        )
      }
      setShowDuplicateDialog(false)
      setSubmittedReport(updated)
      onReportCreated?.(updated)
    } catch (err: any) {
      setUploadError(err.message || "Failed to confirm duplicate report.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // User dismisses duplicate dialog and insists on separate report
  const handleContinueAsNew = () => {
    setIsDuplicateDismissed(true)
    setShowDuplicateDialog(false)
  }

  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setUploadError("Geolocation is not supported by your browser.")
      return
    }
    setIsLocatingGPS(true)
    setUploadError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGPS(false)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const check = validateMumbaiLocation(lat, lng)

        const gpsLoc: SelectedLocation = {
          lat,
          lng,
          address: check.isInsideMumbai
            ? `GPS Captured: Ward ${check.wardName || "MCGM"}, Mumbai`
            : `GPS Captured: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`,
          city: "Mumbai",
          road: "Captured GPS Coordinate",
        }
        setLocalLocation(gpsLoc)
        onUpdateLocation?.(gpsLoc)
      },
      (err) => {
        setIsLocatingGPS(false)
        setUploadError(`GPS capture failed: ${err.message}. You can manually pick on the 3D globe or use pilot presets.`)
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }

  const handleSelectPilotPreset = (preset: { name: string; lat: number; lng: number; address: string }) => {
    const presetLoc: SelectedLocation = {
      lat: preset.lat,
      lng: preset.lng,
      address: preset.address,
      city: "Mumbai",
      road: preset.name,
    }
    setLocalLocation(presetLoc)
    onUpdateLocation?.(presetLoc)
    setUploadError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeLocation) {
      setUploadError(
        "Please select a location or use GPS before submitting.",
      )
      return
    }

    const boundaryCheck = validateMumbaiLocation(activeLocation.lat, activeLocation.lng)
    if (!boundaryCheck.isInsideMumbai) {
      setUploadError(boundaryCheck.message)
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

      const newIssue = await RoadIssueService.createIssueLive({
        title: `${DAMAGE_TYPES.find((t) => t.id === selectedType)?.label || "Road Damage"}`,
        category: selectedType,
        severity: selectedSeverity,
        status: "reported",
        coordinates: { lat: activeLocation.lat, lng: activeLocation.lng },
        address: activeLocation.address,
        roadName: activeLocation.road || activeLocation.address.split(",")[0],
        city: activeLocation.city || "Mumbai",
        originalPhotoUrl: selectedPhoto,
        annotatedPhotoUrl:
          effectiveDetection.annotatedImageUrl || selectedPhoto,
        detection: effectiveDetection,
        risk: calculatedRisk,
        reportedBy: reporterName || "Citizen Reporter",
        reporterName: reporterName || "Citizen Reporter",
        notes,
        photoFile,
        forceDuplicate: isDuplicateDismissed,
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

  return (
    <>
      <div className="report-modal-overlay">
        <div className="report-modal-backdrop" onClick={onClose} />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
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
                <h2 id="report-modal-title" className="modal-title">REPORT ROAD DAMAGE</h2>
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

              {/* 2. GEOGRAPHIC COORDINATES (MUMBAI MCGM JURISDICTION VALIDATION) */}
              <div className="form-group">
                <div className="selected-location-box glass">
                  <div className="location-box-header">
                    <div className="loc-label-group">
                      <MapPin size={16} className="text-vermilion" />
                      <span>MUNICIPAL LOCATION & COORDINATES (GREATER MUMBAI ONLY)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseGPS}
                        className="repick-globe-btn"
                        title="Capture device GPS location"
                        disabled={isLocatingGPS}
                      >
                        {isLocatingGPS ? (
                          <Loader2 size={13} className="animate-spin text-vermilion" />
                        ) : (
                          <Navigation size={13} className="text-vermilion" />
                        )}
                        <span>{isLocatingGPS ? "Locating..." : "Use GPS"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenGlobe}
                        className="repick-globe-btn"
                        title="Pick location on 3D Globe"
                      >
                        <Globe size={13} />
                        <span>3D Globe</span>
                      </button>
                    </div>
                  </div>

                  {activeLocation ? (
                    <div className="location-verified-info">
                      <strong>{activeLocation.address}</strong>
                      <div className="coord-chips">
                        <span>LAT: {activeLocation.lat.toFixed(5)}° N</span>
                        <span>LNG: {activeLocation.lng.toFixed(5)}° E</span>
                        {boundaryStatus?.isInsideMumbai ? (
                          <span className="verified-chip">
                            <Check size={11} /> MCGM WARD {boundaryStatus.wardName || "VERIFIED"}
                          </span>
                        ) : (
                          <span className="chip-outside-mumbai" style={{ backgroundColor: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <AlertTriangle size={11} /> OUTSIDE GREATER MUMBAI
                          </span>
                        )}
                      </div>

                      {/* Outside Mumbai warning banner */}
                      {boundaryStatus && !boundaryStatus.isInsideMumbai && (
                        <div
                          className="outside-mumbai-alert"
                          style={{
                            marginTop: "8px",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            backgroundColor: "#FEF2F2",
                            border: "1px solid #FECACA",
                            color: "#991B1B",
                            fontSize: "12px",
                            lineHeight: "1.4",
                          }}
                        >
                          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                            <AlertTriangle size={14} className="text-rose-600" />
                            <span>JURISDICTION ERROR</span>
                          </div>
                          <p style={{ marginTop: "4px", color: "#B91C1C" }}>
                            {boundaryStatus.message}
                          </p>
                          <div style={{ marginTop: "6px", fontSize: "11px", color: "#7F1D1D" }}>
                            Select one of the verified Mumbai pilot locations below:
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="no-location-prompt">
                      <p>
                        No coordinates selected. Use device GPS, pick from the 3D globe, or select a verified Mumbai pilot location.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={handleUseGPS}
                          disabled={isLocatingGPS}
                          className="button button--secondary"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                        >
                          <Navigation size={13} />
                          <span>{isLocatingGPS ? "Acquiring GPS..." : "Acquire GPS Coordinates"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={onOpenGlobe}
                          className="button button--secondary"
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                        >
                          <Globe size={13} />
                          <span>Open 3D Globe</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pilot Quick-Select Presets for testing & evaluation */}
                  <div
                    className="pilot-presets-row"
                    style={{
                      marginTop: "10px",
                      paddingTop: "8px",
                      borderTop: "1px dashed rgba(0,0,0,0.1)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "#666", fontWeight: 600 }}>Mumbai Pilot Presets:</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectPilotPreset({
                          name: "Marine Drive",
                          lat: 18.9438,
                          lng: 72.8232,
                          address: "Marine Drive Promenade, Ward A, Mumbai",
                        })
                      }
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        border: "1px solid #CBD5E1",
                        background: "#F8FAFC",
                        cursor: "pointer",
                      }}
                    >
                      📍 Marine Drive (Ward A)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectPilotPreset({
                          name: "Shivaji Park",
                          lat: 19.0269,
                          lng: 72.8378,
                          address: "Shivaji Park, Dadar West, Ward G/N, Mumbai",
                        })
                      }
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        border: "1px solid #CBD5E1",
                        background: "#F8FAFC",
                        cursor: "pointer",
                      }}
                    >
                      📍 Dadar West (Ward G/N)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectPilotPreset({
                          name: "Bandstand Promenade",
                          lat: 19.0544,
                          lng: 72.8267,
                          address: "Bandstand Promenade, Bandra West, Ward H/W, Mumbai",
                        })
                      }
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        border: "1px solid #CBD5E1",
                        background: "#F8FAFC",
                        cursor: "pointer",
                      }}
                    >
                      📍 Bandra West (Ward H/W)
                    </button>
                  </div>
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
                  disabled={isSubmitting || !activeLocation || !boundaryStatus?.isInsideMumbai}
                  title={
                    !activeLocation
                      ? "Select a location to submit"
                      : !boundaryStatus?.isInsideMumbai
                        ? "Location is outside Greater Mumbai"
                        : "Submit report for municipal verification"
                  }
                >
                  {isSubmitting ? (
                    <span>Calculating Risk & Transmitting...</span>
                  ) : (
                    <>
                      <span>
                        {!activeLocation
                          ? "Select Location to Submit"
                          : !boundaryStatus?.isInsideMumbai
                            ? "Outside Mumbai (Submission Disabled)"
                            : "Submit Verified Report"}
                      </span>
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
