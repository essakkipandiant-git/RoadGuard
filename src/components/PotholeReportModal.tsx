import React, { useEffect, useId, useRef, useState } from "react"
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Edit2,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  HardHat,
  HelpCircle,
  ImageIcon,
  Info,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ThumbsUp,
  Trash2,
  Upload,
  Waves,
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
import { apiClient, mapBackendIssueToRoadIssue, ApiUser } from "../services/apiClient"
import { validateMumbaiLocation } from "../services/mumbaiBoundaryClient"
import PossibleDuplicateDialog from "./PossibleDuplicateDialog"
import Interactive2DMap from "./Interactive2DMap"

export type PotholeReportModalProps = {
  isOpen: boolean
  onClose: () => void
  location: SelectedLocation | null
  onOpenGlobe: () => void
  onReportCreated?: (issue: RoadIssue) => void
  onUpdateLocation?: (loc: SelectedLocation) => void
  initialStep?: number
  currentUser?: ApiUser | null
}

export const DAMAGE_CATEGORIES: {
  id: DamageCategory
  label: string
  sublabel: string
  icon: any
  defaultSeverity: SeverityLevel
}[] = [
  {
    id: "cavity",
    label: "Pothole / Asphalt Cavity",
    sublabel: "Deep void, missing surface layer or wheel-impact depression",
    icon: AlertTriangle,
    defaultSeverity: "critical",
  },
  {
    id: "crack",
    label: "Road Cracks",
    sublabel: "Longitudinal, transverse or spiderweb alligator fissures",
    icon: ShieldAlert,
    defaultSeverity: "high",
  },
  {
    id: "edge",
    label: "Surface Deterioration",
    sublabel: "Asphalt ravelling, edge break, peeling or surface scouring",
    icon: Compass,
    defaultSeverity: "moderate",
  },
  {
    id: "waterlogging",
    label: "Waterlogging & Ponding",
    sublabel: "Standing stormwater eroding asphalt sub-base",
    icon: Waves,
    defaultSeverity: "high",
  },
  {
    id: "collapse",
    label: "Road Collapse / Cave-in",
    sublabel: "Major sub-surface void, trench failure or immediate collapse hazard",
    icon: AlertOctagon,
    defaultSeverity: "critical",
  },
  {
    id: "other",
    label: "Other Road Hazards",
    sublabel: "Protruding manhole, debris, shoulder erosion or uneven pavement",
    icon: Layers,
    defaultSeverity: "moderate",
  },
]

export const SEVERITY_LEVELS: {
  id: SeverityLevel
  label: string
  numericLevel: string
  color: string
  bgLight: string
  desc: string
  impact: string
}[] = [
  {
    id: "critical",
    label: "Critical Hazard",
    numericLevel: "Level 1",
    color: "#E65336",
    bgLight: "rgba(230, 83, 54, 0.12)",
    desc: "Immediate chassis, tire blowout or vehicle control hazard. High danger of loss of life.",
    impact: "Emergency 4-Hour Response",
  },
  {
    id: "high",
    label: "High Severity",
    numericLevel: "Level 2",
    color: "#F16649",
    bgLight: "rgba(241, 102, 73, 0.12)",
    desc: "Deep void (>50mm) causing sharp impacts. Forces sudden vehicular swerving.",
    impact: "Priority 24-Hour Dispatch",
  },
  {
    id: "moderate",
    label: "Medium Wear",
    numericLevel: "Level 3",
    color: "#D97706",
    bgLight: "rgba(217, 119, 6, 0.12)",
    desc: "Noticeable surface indentation or raveling. Uncomfortable ride requiring resurfacing.",
    impact: "Standard 72-Hour Schedule",
  },
  {
    id: "low",
    label: "Low Distress",
    numericLevel: "Level 4",
    color: "#687567",
    bgLight: "rgba(104, 117, 103, 0.12)",
    desc: "Superficial hairline cracks or early asphalt distress. No immediate vehicle damage.",
    impact: "Routine Maintenance Log",
  },
]

const MUMBAI_SEARCH_PRESETS = [
  { name: "Marine Drive, Ward A", lat: 18.9438, lng: 72.8232, address: "Marine Drive Promenade, Ward A, Mumbai" },
  { name: "Bandra Bandstand, Ward H/W", lat: 19.0544, lng: 72.8267, address: "Bandstand Promenade, Bandra West, Ward H/W, Mumbai" },
  { name: "Shivaji Park, Dadar West", lat: 19.0269, lng: 72.8378, address: "Shivaji Park, Dadar West, Ward G/N, Mumbai" },
  { name: "Western Express Hwy, Andheri", lat: 19.1136, lng: 72.8697, address: "WEH Flyover Corridor, Andheri East, Ward K/E, Mumbai" },
  { name: "BKC Financial District", lat: 19.0665, lng: 72.8688, address: "G-Block Avenue, Bandra Kurla Complex, Ward H/E, Mumbai" },
  { name: "Linking Road, Bandra", lat: 19.0601, lng: 72.8341, address: "Linking Road Fashion District, Ward H/W, Mumbai" },
]

export default function PotholeReportModal({
  isOpen,
  onClose,
  location,
  onOpenGlobe,
  onReportCreated,
  onUpdateLocation,
  initialStep,
  currentUser,
}: PotholeReportModalProps) {
  // 7-step guided journey: 1 to 7 (defaults to step 2 if location already provided)
  const [currentStep, setCurrentStep] = useState<number>(initialStep || (location ? 2 : 1))

  // Location & Boundary State
  const [localLocation, setLocalLocation] = useState<SelectedLocation | null>(null)
  const [isLocatingGPS, setIsLocatingGPS] = useState(false)
  const [gpsNotice, setGpsNotice] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const activeLocation = localLocation || location
  const boundaryStatus = activeLocation
    ? validateMumbaiLocation(activeLocation.lat, activeLocation.lng)
    : null

  // Form Field State
  const [selectedType, setSelectedType] = useState<DamageCategory>("cavity")
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel>("critical")
  const [roadClass, setRoadClass] = useState<RoadClass>("arterial")
  const [notes, setNotes] = useState("")
  const [reporterName, setReporterName] = useState("")
  const [reporterContact, setReporterContact] = useState("")

  // Pre-fill reporter information from logged-in user session
  useEffect(() => {
    if (currentUser && isOpen) {
      if (!reporterName) {
        setReporterName(currentUser.fullName)
      }
      if (!reporterContact) {
        setReporterContact(currentUser.phoneNumber || currentUser.email || "")
      }
    }
  }, [currentUser, isOpen])

  // Photo & AI Inspection State
  const [selectedPhoto, setSelectedPhoto] = useState<string>(
    "/images/detection_asphalt.jpg",
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState("")
  const [detectionResult, setDetectionResult] = useState<AIDetectionResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [viewAnnotated, setViewAnnotated] = useState(true)

  // Duplicate Matching State
  const [duplicateResult, setDuplicateResult] = useState<DuplicateMatchResult | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [isDuplicateDismissed, setIsDuplicateDismissed] = useState(false)

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedReport, setSubmittedReport] = useState<RoadIssue | null>(null)

  // Camera & File Picker Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Cloudinary & Storage State Machine
  type ImageUploadState = "idle" | "validating" | "uploading" | "completed" | "error"
  const [imageUploadStatus, setImageUploadStatus] = useState<ImageUploadState>("idle")
  const [uploadPercent, setUploadPercent] = useState<number>(0)
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | null>(null)
  const [imageMetadata, setImageMetadata] = useState<{
    name: string
    sizeKb: number
    format: string
    storageProvider?: "cloudinary" | "local_storage"
  } | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Save activeElement on open and restore on close (Accessibility requirement)
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      // Focus the dialog container or first focusable element
      setTimeout(() => {
        dialogRef.current?.focus()
      }, 50)
    } else {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen])

  // Run AI Inspection whenever photo changes
  const runInspection = async (fileOrUrl: File | string) => {
    setIsAnalyzing(true)
    setUploadError(null)
    setDetectionResult(null)
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

      const allIssues = RoadIssueService.getAllIssues()
      const match = findPotentialDuplicates(
        { lat: activeLocation.lat, lng: activeLocation.lng },
        selectedType,
        allIssues,
        40,
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

  // Focus trap inside open dialog (Accessibility requirement)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus()
            e.preventDefault()
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus()
            e.preventDefault()
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Location detection via Geolocation
  const handleUseGPS = () => {
    if (!navigator.geolocation) {
      setStepError("Geolocation is not supported by your browser.")
      return
    }
    setIsLocatingGPS(true)
    setGpsNotice("Requesting high-accuracy device coordinates...")
    setStepError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGPS(false)
        setGpsNotice("GPS coordinates successfully acquired.")
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const check = validateMumbaiLocation(lat, lng)

        const gpsLoc: SelectedLocation = {
          lat,
          lng,
          address: check.isInsideMumbai
            ? `GPS Location: Ward ${check.wardName || "MCGM"}, Mumbai`
            : `GPS Location: [${lat.toFixed(5)}, ${lng.toFixed(5)}]`,
          city: "Mumbai",
          road: "Captured GPS Coordinate",
        }
        setLocalLocation(gpsLoc)
        onUpdateLocation?.(gpsLoc)
        setTimeout(() => setGpsNotice(null), 3500)
      },
      (err) => {
        setIsLocatingGPS(false)
        setGpsNotice(null)
        setStepError(
          `GPS acquisition failed (${err.message}). You can select a location on the interactive map below or use Mumbai presets without granting GPS permissions.`,
        )
      },
      { timeout: 12000, enableHighAccuracy: true },
    )
  }

  const handleSelectPresetLocation = (preset: { name: string; lat: number; lng: number; address: string }) => {
    const loc: SelectedLocation = {
      lat: preset.lat,
      lng: preset.lng,
      address: preset.address,
      city: "Mumbai",
      road: preset.name,
    }
    setLocalLocation(loc)
    onUpdateLocation?.(loc)
    setStepError(null)
  }

  // Handle manual 2D Map selection
  const handleMapPinSelected = (loc: SelectedLocation) => {
    setLocalLocation(loc)
    onUpdateLocation?.(loc)
    setStepError(null)
  }

  // Photo & Cloudinary Handlers
  const uploadPhotoToCloud = async (file: File) => {
    try {
      setImageUploadStatus("uploading")
      setUploadPercent(15)

      const timer = setInterval(() => {
        setUploadPercent((prev) => (prev < 85 ? prev + 15 : prev))
      }, 200)

      const res = await apiClient.uploads.uploadImage(file, "pothole-reports")
      clearInterval(timer)
      setUploadPercent(100)

      if (res && (res.imageUrl || res.url)) {
        const finalUrl = res.imageUrl || res.url
        setRemoteImageUrl(finalUrl)
        setImageUploadStatus("completed")
        setImageMetadata((prev) =>
          prev
            ? {
                ...prev,
                storageProvider: res.storageProvider === "cloudinary" ? "cloudinary" : "local_storage",
              }
            : null,
        )
      } else {
        setImageUploadStatus("completed")
      }
    } catch (err: any) {
      console.warn("Cloud image upload fell back to local storage:", err)
      setImageUploadStatus("error")
      setUploadError("Cloud storage sync pending. You may click 'Retry' or proceed with submission.")
    }
  }

  const handlePhotoSelected = async (file: File, source: "camera" | "gallery") => {
    setImageUploadStatus("validating")
    setUploadError(null)
    setDetectionResult(null)

    const validation = validateImageFile(file)
    if (!validation.isValid) {
      setImageUploadStatus("error")
      setUploadError(
        validation.error ||
          "Invalid file format or size. Only JPG, PNG, and WebP up to 10MB are permitted.",
      )
      return
    }

    setPhotoFile(file)
    setImageMetadata({
      name: source === "camera" ? `camera_capture_${Date.now()}.jpg` : file.name,
      sizeKb: Math.round(file.size / 1024),
      format: file.type.split("/")[1]?.toUpperCase() || "JPG",
    })

    const objectUrl = URL.createObjectURL(file)
    setSelectedPhoto(objectUrl)
    runInspection(file)

    // Upload to organized folder in Cloudinary
    await uploadPhotoToCloud(file)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handlePhotoSelected(file, "gallery")
  }

  const handleRemovePhoto = () => {
    setSelectedPhoto("/images/detection_asphalt.jpg")
    setPhotoFile(null)
    setRemoteImageUrl(null)
    setImageMetadata(null)
    setImageUploadStatus("idle")
    setUploadPercent(0)
    setDetectionResult(null)
    runInspection("/images/detection_asphalt.jpg")
  }

  // Duplicate resolution
  const handleSupportExisting = async (
    updateType: string = "STILL_EXISTS",
    customNotes?: string,
  ) => {
    if (!duplicateResult?.existingIssue) return
    setIsSubmitting(true)
    setStepError(null)
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
      setStepError(err.message || "Failed to confirm duplicate report.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinueAsNew = () => {
    setIsDuplicateDismissed(true)
    setShowDuplicateDialog(false)
  }

  // Step Validation & Navigation
  const validateAndProceed = (nextStep: number) => {
    setStepError(null)

    // Step 2 Validation: Must have a location selected
    if (currentStep === 2 && nextStep > 2) {
      if (!activeLocation) {
        setStepError("Please select a geographic location on the map or click 'Use GPS' to continue.")
        return
      }
      if (!boundaryStatus?.isInsideMumbai) {
        setStepError("The selected location is outside Greater Mumbai (MCGM). Please choose a location within municipal bounds.")
        return
      }
    }

    // Step 3 Validation: Photo must pass genuine AI inspection with >= 60% confidence
    if (currentStep === 3 && nextStep > 3) {
      if (!selectedPhoto) {
        setStepError("Please provide road evidence photography.")
        return
      }
      if (isAnalyzing) {
        setStepError("AI computer vision analysis is in progress. Please wait for inference to complete.")
        return
      }
      if (!detectionResult) {
        setStepError("Photograph has not been analyzed by RoadGuard AI. Please wait or upload a photograph.")
        return
      }
      if (detectionResult.status === "low_confidence" || (detectionResult.confidence || 0) < 0.60) {
        const confPercent = Math.round((detectionResult.confidence || 0) * 100)
        setStepError(
          `Road damage was detected, but the confidence score (${confPercent}%) is below the required 60% threshold. Please upload a clearer photograph of the road damage.`
        )
        return
      }
      if (detectionResult.status === "unrelated_image") {
        setStepError(
          "This photograph does not appear to show road damage. Please upload a pothole or damaged road photograph."
        )
        return
      }
      if (detectionResult.status === "no_damage_found") {
        setStepError(
          "No supported road damage detected in this photograph. Please retake the photo ensuring the defect is centered and clearly visible."
        )
        return
      }
      if (detectionResult.status === "blurry_image") {
        setStepError(
          "The uploaded photograph appears blurry or lacks sufficient focus. Please upload a clearer photograph of the road damage."
        )
        return
      }
      if (detectionResult.status === "underexposed") {
        setStepError(
          "The photograph is underexposed or too dark to assess road surface defects. Please capture the road damage in adequate lighting."
        )
        return
      }
      if (detectionResult.status === "ai_unavailable") {
        setStepError(
          "AI inspection service is temporarily unavailable. Please retry verification before submitting."
        )
        return
      }
      if (detectionResult.status !== "detected") {
        setStepError(
          "Photograph failed automated AI inspection. Please upload a clear pothole photograph."
        )
        return
      }
    }

    setCurrentStep(nextStep)
  }

  // Final Form Submission
  const handleSubmitReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!activeLocation) {
      setStepError("Please select a location before submitting.")
      setCurrentStep(2)
      return
    }

    const boundaryCheck = validateMumbaiLocation(activeLocation.lat, activeLocation.lng)
    if (!boundaryCheck.isInsideMumbai) {
      setStepError(boundaryCheck.message)
      setCurrentStep(2)
      return
    }

    // Strict AI Image Submission Gate:
    // Every citizen hazard report must have genuine AI defect detection with >= 0.60 confidence
    if (
      !detectionResult ||
      detectionResult.status !== "detected" ||
      (detectionResult.confidence || 0) < 0.60
    ) {
      setStepError(
        "Report submission blocked: Uploaded photograph must pass genuine AI inspection with at least 60% road damage confidence. Please retake or upload a clear pothole photograph."
      )
      setCurrentStep(3)
      return
    }

    setIsSubmitting(true)
    setStepError(null)

    try {
      const depthMm = detectionResult?.depthEstimateMm ?? null

      const damageFactor = calculateDamageSeverityFactor({
        category: selectedType,
        depthMm,
        surfaceLossRatio: detectionResult?.surfaceLossRatio || 0.16,
      })

      const calculatedRisk = calculateRiskAssessment({
        factors: {
          damageSeverity: damageFactor,
          roadUsage:
            roadClass === "arterial" ? 90 : roadClass === "collector" ? 70 : 40,
          sensitiveProximity: 60,
          supportingReports: 20,
          unresolvedDuration: 10,
        },
        category: selectedType,
        depthMm,
        roadClass,
        supportingCount: 1,
        nearestSensitiveType: "crossing",
        distanceMeters: 120,
      })

      const effectiveDetection: AIDetectionResult = detectionResult || {
        engine: "demo_fallback",
        category: selectedType,
        confidence: 0,
        boxes: [],
        surfaceLossRatio: 0,
        depthEstimateMm: null,
        severity: selectedSeverity,
        originalImageUrl: selectedPhoto,
        annotatedImageUrl: selectedPhoto,
        rawInferenceTimeMs: 0,
      }

      const newIssue = await RoadIssueService.createIssueLive({
        title: `${DAMAGE_CATEGORIES.find((t) => t.id === selectedType)?.label || "Road Damage"}`,
        category: selectedType,
        severity: selectedSeverity,
        status: "reported",
        coordinates: { lat: activeLocation.lat, lng: activeLocation.lng },
        address: activeLocation.address,
        roadName: activeLocation.road || activeLocation.address.split(",")[0],
        city: activeLocation.city || "Mumbai",
        originalPhotoUrl: remoteImageUrl || selectedPhoto,
        annotatedPhotoUrl: effectiveDetection.annotatedImageUrl || remoteImageUrl || selectedPhoto,
        detection: effectiveDetection,
        risk: calculatedRisk,
        reportedBy: reporterName || "Citizen Reporter",
        reporterName: reporterName || "Citizen Reporter",
        notes: [notes, reporterContact ? `Contact: ${reporterContact}` : ""].filter(Boolean).join(" · "),
        photoFile,
        forceDuplicate: isDuplicateDismissed,
      })

      setSubmittedReport(newIssue)
      onReportCreated?.(newIssue)
    } catch (err: any) {
      setStepError(err.message || "Failed to transmit report to municipal cloud.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetAndClose = () => {
    setSubmittedReport(null)
    setNotes("")
    setReporterName("")
    setReporterContact("")
    setCurrentStep(1)
    setIsDuplicateDismissed(false)
    onClose()
  }

  if (!isOpen) return null

  // Step definition for UI progress bar
  const STEPS_NAV = [
    { num: 1, title: "Start" },
    { num: 2, title: "Location" },
    { num: 3, title: "Photo" },
    { num: 4, title: "Damage" },
    { num: 5, title: "Severity" },
    { num: 6, title: "Road" },
    { num: 7, title: "Review" },
  ]

  return (
    <>
      <div className="report-modal-overlay">
        <div className="report-modal-backdrop" onClick={onClose} />

        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          tabIndex={-1}
          className="report-modal-card glass"
          style={{ width: "min(780px, 98vw)", maxHeight: "92vh", outline: "none" }}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 130, damping: 20 }}
        >
          {/* Close button with high-visibility accessible hit area */}
          <button
            onClick={onClose}
            className="modal-close-btn"
            aria-label="Close reporting dialog"
          >
            <X size={18} />
          </button>

          {/* SUCCESS / CONFIRMATION STATE */}
          {submittedReport ? (
            <div className="report-success-state py-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 border border-emerald-300 shadow-sm">
                <CheckCircle2 size={36} />
              </div>
              <span className="eyebrow justify-center mb-1">
                <span /> MUNICIPAL TELEMETRY LOGGED
              </span>
              <h2 className="text-2xl font-black text-[#242522] tracking-tight mb-2">
                REPORT SUBMITTED SUCCESSFULLY
              </h2>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#242522] text-[#F5F1E8] font-mono text-xs font-bold mb-4">
                <span>OFFICIAL TRACKING ID:</span>
                <strong className="text-orange-400">#{submittedReport.trackingCode}</strong>
              </div>

              <p className="text-xs text-[#687567] max-w-lg mx-auto mb-6">
                Your report is officially registered with the Greater Mumbai (MCGM) municipal road triage system.
                The edge CV severity and spatial risk priority have been recorded for inspector allocation and crew dispatch.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-white/70 border border-[#242522]/10 text-left mb-6 font-mono text-xs">
                <div>
                  <small className="text-[#8B9185] block uppercase font-bold text-[10px]">Location</small>
                  <strong className="text-[#242522] line-clamp-1">{submittedReport.address}</strong>
                </div>
                <div>
                  <small className="text-[#8B9185] block uppercase font-bold text-[10px]">Coordinates</small>
                  <span className="text-[#242522]">
                    {submittedReport.coordinates.lat.toFixed(4)}°N, {submittedReport.coordinates.lng.toFixed(4)}°E
                  </span>
                </div>
                <div>
                  <small className="text-[#8B9185] block uppercase font-bold text-[10px]">AI Risk Score</small>
                  <strong className="text-[#E65336]">
                    {submittedReport.risk.score}/100 ({submittedReport.risk.level.toUpperCase()})
                  </strong>
                </div>
                <div>
                  <small className="text-[#8B9185] block uppercase font-bold text-[10px]">Status</small>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold inline-block">
                    {submittedReport.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="button button--primary"
                >
                  <span>Done & Return to Overview</span>
                </button>
              </div>
            </div>
          ) : (
            /* GUIDED MULTI-STEP FLOW */
            <div>
              {/* Top Header */}
              <div className="mb-3 sm:mb-4 pr-10">
                <p className="eyebrow mb-1">
                  <span /> GREATER MUMBAI CIVIC REPORTING
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                  <h2 id="report-modal-title" className="text-lg sm:text-2xl font-black text-[#242522] tracking-tight">
                    REPORT ROAD HAZARD
                  </h2>
                  <span className="self-start sm:self-auto text-[11px] sm:text-xs font-mono font-bold text-[#E65336] bg-orange-50 px-2.5 py-0.5 sm:py-1 rounded-full border border-orange-200">
                    Step {currentStep} of 7: {STEPS_NAV[currentStep - 1]?.title}
                  </span>
                </div>
              </div>

              {/* Step Progress Indicators */}
              <nav aria-label="Reporting progress" className="mb-4 sm:mb-6">
                <ol className="flex items-center justify-between gap-1 border-b border-[#242522]/10 pb-2.5 sm:pb-3">
                  {STEPS_NAV.map((s) => {
                    const isCompleted = currentStep > s.num
                    const isCurrent = currentStep === s.num
                    return (
                      <li key={s.num} className="flex-1 text-center min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (s.num < currentStep) setCurrentStep(s.num)
                            else if (s.num > currentStep) validateAndProceed(s.num)
                          }}
                          className={`w-full flex flex-col items-center gap-0.5 sm:gap-1 group transition-all cursor-pointer ${
                            isCurrent
                              ? "text-[#E65336]"
                              : isCompleted
                                ? "text-emerald-700"
                                : "text-[#8B9185]"
                          }`}
                          aria-current={isCurrent ? "step" : undefined}
                        >
                          <div
                            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-mono font-bold border transition-all ${
                              isCurrent
                                ? "bg-[#E65336] text-white border-[#E65336] shadow-sm ring-1 sm:ring-2 ring-orange-200"
                                : isCompleted
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-[#ECE6D8] text-[#687567] border-[#D8D2C5]"
                            }`}
                          >
                            {isCompleted ? <Check size={11} strokeWidth={3} /> : s.num}
                          </div>
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:block truncate max-w-full">
                            {s.title}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </nav>

              {/* Error Banner */}
              {stepError && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2.5"
                >
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  <span>{stepError}</span>
                </div>
              )}

              {/* STEP 1: START REPORTING */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/70 border border-[#242522]/10 text-xs space-y-2">
                    <h3 className="text-sm font-bold text-[#242522] flex items-center gap-2">
                      <Sparkles size={16} className="text-[#E65336]" />
                      How the RoadGuard Reporting Workflow Operates
                    </h3>
                    <p className="text-[#687567] leading-relaxed">
                      RoadGuard uses edge computer vision and spatial municipal triage to verify road defects
                      in Greater Mumbai. Your report is evaluated against nearby reports to prevent duplication,
                      assigned an AI severity score, and routed directly to municipal maintenance crews.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleUseGPS()
                        validateAndProceed(2)
                      }}
                      className="p-4 rounded-xl border border-[#242522]/15 bg-white/80 hover:bg-orange-50 hover:border-[#E65336] text-left transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#E65336] flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Navigation size={18} />
                        </div>
                        <div>
                          <strong className="text-xs font-bold text-[#242522] block">Use GPS</strong>
                          <span className="text-[11px] text-[#687567]">Fastest · High-accuracy device coordinates</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#8B9185] italic">
                        Requires browser location permission. Automatically pins the current road.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => validateAndProceed(2)}
                      className="p-4 rounded-xl border border-[#242522]/15 bg-white/80 hover:bg-orange-50 hover:border-[#E65336] text-left transition-all cursor-pointer group flex flex-col justify-between"
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-[#ECE6D8] text-[#242522] flex items-center justify-center group-hover:scale-105 transition-transform">
                          <MapPin size={18} />
                        </div>
                        <div>
                          <strong className="text-xs font-bold text-[#242522] block">Select on Map or Search Address</strong>
                          <span className="text-[11px] text-[#687567]">Manual · Search street name or click pin</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#8B9185] italic">
                        No permissions required. Select any corridor across Greater Mumbai.
                      </span>
                    </button>
                  </div>

                  {/* Step 1 Quick Mumbai Presets */}
                  <div className="pt-2 border-t border-[#242522]/10 space-y-1">
                    <span className="text-[11px] text-[#687567] font-mono font-bold block">
                      Mumbai Pilot Presets:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectPresetLocation({
                            name: "Marine Drive",
                            lat: 18.9438,
                            lng: 72.8232,
                            address: "Marine Drive Promenade, Ward A, Mumbai",
                          })
                          validateAndProceed(2)
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Marine Drive (Ward A)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectPresetLocation({
                            name: "Shivaji Park",
                            lat: 19.0269,
                            lng: 72.8378,
                            address: "Shivaji Park, Dadar West, Ward G/N, Mumbai",
                          })
                          validateAndProceed(2)
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Dadar West (Ward G/N)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectPresetLocation({
                            name: "Bandstand Promenade",
                            lat: 19.0544,
                            lng: 72.8267,
                            address: "Bandstand Promenade, Bandra West, Ward H/W, Mumbai",
                          })
                          validateAndProceed(2)
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Bandra West (Ward H/W)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#242522]/10">
                    <span className="text-[11px] text-[#687567] text-center sm:text-left">
                      Takes ~60 seconds to file an official municipal report.
                    </span>
                    <button
                      type="button"
                      onClick={() => validateAndProceed(2)}
                      className="button button--primary w-full sm:w-auto justify-center min-h-[42px]"
                    >
                      <span>Continue to Location</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: SELECT LOCATION */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  {/* Address Search Bar + GPS Button */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B9185]" />
                      <input
                        type="text"
                        placeholder="Search street, ward or landmark (e.g. Bandra, Marine Drive, Dadar)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white rounded-lg border border-[#242522]/15 text-xs text-[#242522] focus:outline-none focus:ring-2 focus:ring-[#E65336]"
                        aria-label="Search address in Mumbai"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseGPS}
                        disabled={isLocatingGPS}
                        className="button button--secondary whitespace-nowrap text-xs flex items-center justify-center gap-1.5 min-h-[38px]"
                        title="Acquire device GPS coordinates"
                      >
                        {isLocatingGPS ? (
                          <Loader2 size={13} className="animate-spin text-[#E65336]" />
                        ) : (
                          <Navigation size={13} className="text-[#E65336]" />
                        )}
                        <span>{isLocatingGPS ? "Locating..." : "Use GPS"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenGlobe}
                        className="button button--secondary whitespace-nowrap text-xs flex items-center justify-center gap-1.5 min-h-[38px]"
                        title="Open 3D Globe picker"
                      >
                        <Globe size={13} />
                        <span>3D Globe</span>
                      </button>
                    </div>
                  </div>

                  {gpsNotice && (
                    <div className="p-2 rounded-lg bg-sky-50 text-sky-800 text-xs flex items-center gap-2 border border-sky-200">
                      <Info size={14} />
                      <span>{gpsNotice}</span>
                    </div>
                  )}

                  {/* Interactive 2D Map with Click-to-Pin */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
                      <span className="text-[#687567] flex items-center gap-1">
                        <MapPin size={12} className="text-[#E65336]" />
                        CLICK ON MAP TO PIN HAZARD LOCATION
                      </span>
                      <span className="text-[10px] text-[#8B9185]">
                        Use arrows / drag to pan, + / - to zoom
                      </span>
                    </div>
                    <Interactive2DMap
                      height={240}
                      selectedLocation={activeLocation}
                      onSelectLocation={handleMapPinSelected}
                    />
                  </div>

                  {/* Selected Location Card & Boundary Check */}
                  <div className="p-3 rounded-xl bg-white/80 border border-[#242522]/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <strong className="text-[#242522]">
                        {activeLocation ? activeLocation.address : "No location selected yet"}
                      </strong>
                      {activeLocation && (
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                          <span>{activeLocation.lat.toFixed(5)}°N</span>
                          <span>{activeLocation.lng.toFixed(5)}°E</span>
                        </div>
                      )}
                    </div>

                    {boundaryStatus && (
                      <div className="flex items-center gap-2 pt-1 border-t border-[#242522]/5">
                        {boundaryStatus.isInsideMumbai ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 border border-emerald-200">
                            <Check size={11} strokeWidth={3} />
                            MCGM WARD {boundaryStatus.wardName || "VERIFIED"}
                          </span>
                        ) : (
                          <div className="outside-mumbai-alert p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono space-y-1 w-full" role="alert">
                            <div className="flex items-center gap-1.5 font-bold text-rose-900">
                              <AlertTriangle size={14} className="text-rose-600" />
                              <span>JURISDICTION ERROR · OUTSIDE GREATER MUMBAI</span>
                            </div>
                            <p className="text-[11px] text-rose-700 font-sans">{boundaryStatus.message}</p>
                            <span className="text-[11px] font-bold text-rose-900 block">
                              Outside Mumbai (Submission Disabled)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Mumbai Pilot Presets */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-[#687567] font-mono font-bold">
                      Mumbai Pilot Presets:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectPresetLocation({
                            name: "Marine Drive",
                            lat: 18.9438,
                            lng: 72.8232,
                            address: "Marine Drive Promenade, Ward A, Mumbai",
                          })
                        }
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Marine Drive (Ward A)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectPresetLocation({
                            name: "Shivaji Park",
                            lat: 19.0269,
                            lng: 72.8378,
                            address: "Shivaji Park, Dadar West, Ward G/N, Mumbai",
                          })
                        }
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Dadar West (Ward G/N)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectPresetLocation({
                            name: "Bandstand Promenade",
                            lat: 19.0544,
                            lng: 72.8267,
                            address: "Bandstand Promenade, Bandra West, Ward H/W, Mumbai",
                          })
                        }
                        className="px-2 py-1 rounded-md text-[11px] font-mono bg-white hover:bg-orange-50 border border-[#242522]/15 hover:border-[#E65336] text-[#242522] transition-colors cursor-pointer"
                      >
                        📍 Bandra West (Ward H/W)
                      </button>
                    </div>
                  </div>

                  {/* Step Navigation Controls */}
                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => validateAndProceed(3)}
                      className="button button--primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                      disabled={!activeLocation || !boundaryStatus?.isInsideMumbai}
                    >
                      <span>Continue to Photo</span>
                      <span className="sr-only">Submit Verified Report</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: UPLOAD PHOTOGRAPH & AI ROAD INSPECTOR */}
              {currentStep === 3 && (
                <div className="space-y-4">
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
                          <Loader2 size={32} className="animate-spin text-[#E65336]" />
                          <span className="analyzing-text">
                            {analysisProgress || "Running Edge Computer Vision..."}
                          </span>
                        </div>
                      )}

                      <div className="ai-engine-chip">
                        <span
                          className={`live-dot ${
                            detectionResult?.status === "detected"
                              ? "bg-emerald-500"
                              : detectionResult?.status === "low_confidence"
                              ? "bg-amber-500"
                              : detectionResult?.status === "no_damage_found"
                              ? "bg-blue-500"
                              : detectionResult?.status === "unrelated_image"
                              ? "bg-rose-500"
                              : detectionResult?.status === "blurry_image" ||
                                detectionResult?.status === "underexposed"
                              ? "bg-amber-500"
                              : "bg-stone-400"
                          }`}
                        />
                        <span>
                          {detectionResult?.status === "detected"
                            ? "AI DETECTED (≥60%)"
                            : detectionResult?.status === "low_confidence"
                            ? `LOW CONFIDENCE (${Math.round((detectionResult.confidence || 0) * 100)}%)`
                            : detectionResult?.status === "no_damage_found"
                            ? "NO ROAD DAMAGE DETECTED"
                            : detectionResult?.status === "unrelated_image"
                            ? "UNRELATED IMAGE"
                            : detectionResult?.status === "blurry_image" ||
                              detectionResult?.status === "underexposed"
                            ? "POOR IMAGE QUALITY"
                            : "AI INSPECTION UNAVAILABLE"}
                        </span>
                      </div>
                    </div>

                    {/* Upload Controls & AI Metrics */}
                    <div className="ai-controls-col space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#242522]">
                          DAMAGE PHOTOGRAPH
                        </label>
                        {detectionResult && (
                          <button
                            type="button"
                            onClick={() => setViewAnnotated(!viewAnnotated)}
                            className="toggle-annotation-btn text-[11px]"
                          >
                            <Eye size={12} />
                            <span>{viewAnnotated ? "Show Original" : "Show AI Mask"}</span>
                          </button>
                        )}
                      </div>

                      <div className="upload-controls-container space-y-2.5">
                        {/* Hidden Native File and Camera Inputs */}
                        <input
                          type="file"
                          ref={cameraInputRef}
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handlePhotoSelected(file, "camera")
                          }}
                          aria-label="Capture road defect photo using camera"
                        />
                        <input
                          type="file"
                          ref={galleryInputRef}
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handlePhotoSelected(file, "gallery")
                          }}
                          aria-label="Upload road defect photo from file manager"
                        />

                        {/* Dual Action Buttons */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="button button--primary text-xs w-full justify-center min-h-[42px] gap-2 font-mono font-bold cursor-pointer"
                          >
                            <Camera size={15} />
                            <span>Take Photo</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="px-4 py-2.5 rounded-xl border border-[#D8D2C5] bg-white hover:bg-[#FAF8F5] text-[#242522] text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors min-h-[42px] shadow-2xs cursor-pointer"
                          >
                            <FolderOpen size={15} className="text-[#E65336]" />
                            <span>Choose from Gallery</span>
                          </button>
                        </div>

                        {/* Active Image Metadata & Upload Progress Card */}
                        {photoFile && imageMetadata && (
                          <div className="p-3 bg-white rounded-xl border border-[#D8D2C5] shadow-2xs space-y-2">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <div className="flex items-center gap-2 truncate min-w-0">
                                <ImageIcon size={14} className="text-[#E65336] shrink-0" />
                                <span className="font-bold text-[#242522] truncate">{imageMetadata.name}</span>
                                <span className="text-[#687567] shrink-0 text-[11px]">
                                  ({imageMetadata.sizeKb} KB · {imageMetadata.format})
                                </span>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {imageUploadStatus === "validating" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
                                    Validating...
                                  </span>
                                )}
                                {imageUploadStatus === "uploading" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 flex items-center gap-1">
                                    <RefreshCw size={10} className="animate-spin" />
                                    <span>Uploading to Cloudinary ({uploadPercent}%)</span>
                                  </span>
                                )}
                                {imageUploadStatus === "completed" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1">
                                    <CheckCircle2 size={10} />
                                    <span>
                                      {imageMetadata?.storageProvider === "cloudinary"
                                        ? "Uploaded to Cloudinary"
                                        : "Saved on device"}
                                    </span>
                                  </span>
                                )}
                                {imageUploadStatus === "error" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 border border-rose-500/20 flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    <span>Upload failed</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Progress bar */}
                            {imageUploadStatus === "uploading" && (
                              <div className="w-full bg-[#FAF8F5] rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-[#E65336] h-1.5 transition-all duration-300"
                                  style={{ width: `${uploadPercent}%` }}
                                />
                              </div>
                            )}

                            {/* Retake / Replace / Remove Actions */}
                            <div className="flex items-center justify-between pt-1 text-[11px] font-mono border-t border-[#D8D2C5]/50">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => cameraInputRef.current?.click()}
                                  className="text-[#687567] hover:text-[#242522] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Camera size={11} />
                                  <span>Retake</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => galleryInputRef.current?.click()}
                                  className="text-[#687567] hover:text-[#242522] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <FolderOpen size={11} />
                                  <span>Replace</span>
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={handleRemovePhoto}
                                className="text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer font-bold transition-colors"
                              >
                                <Trash2 size={11} />
                                <span>Remove Photo</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {uploadError && (
                          <div className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle size={14} className="shrink-0 text-amber-600" />
                              <span>{uploadError}</span>
                            </div>
                            {photoFile && imageUploadStatus === "error" && (
                              <button
                                type="button"
                                onClick={() => uploadPhotoToCloud(photoFile)}
                                className="px-2 py-1 text-[10px] font-bold font-mono text-amber-900 bg-amber-200/60 rounded hover:bg-amber-200 transition-colors shrink-0 cursor-pointer"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sample Photos for Testing */}
                      <div className="sample-selector-row">
                        <small className="text-[#8B9185] font-mono">QUICK SAMPLES:</small>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPhoto("/images/detection_asphalt.jpg")
                            runInspection("/images/detection_asphalt.jpg")
                          }}
                          className={`sample-pill ${
                            selectedPhoto === "/images/detection_asphalt.jpg" ? "active" : ""
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
                            selectedPhoto === "/images/hero_road.jpg" ? "active" : ""
                          }`}
                        >
                          Spiderweb Cracks
                        </button>
                      </div>

                      {/* AI Readout */}
                      {detectionResult && (
                        <div className="space-y-1.5">
                          {detectionResult.status === "unrelated_image" ? (
                            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs space-y-1">
                              <div className="flex items-center gap-2 text-rose-800 font-bold">
                                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                                <span>UNRELATED IMAGE REJECTED</span>
                              </div>
                              <p className="text-rose-700 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "This photograph does not appear to show road damage. Please upload a pothole or damaged road photograph."}
                              </p>
                              {detectionResult.topPredictedClass && (
                                <div className="text-[10px] font-mono text-rose-600 pt-0.5">
                                  Detected non-road subject:{" "}
                                  <span className="font-bold underline">
                                    {detectionResult.topPredictedClass}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : detectionResult.status === "low_confidence" ? (
                            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-amber-800 font-bold">
                                  <AlertCircle size={15} className="shrink-0 text-amber-600" />
                                  <span>
                                    LOW CONFIDENCE ({(detectionResult.confidence * 100).toFixed(0)}%) · MINIMUM 60% REQUIRED
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRetakePhoto}
                                  className="px-2 py-0.5 text-[10px] font-bold font-mono text-amber-900 bg-amber-200/80 rounded hover:bg-amber-300 transition-colors shrink-0 cursor-pointer"
                                >
                                  Retake Photo
                                </button>
                              </div>
                              <p className="text-amber-800 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "Road damage was detected, but the confidence score is below the 60% threshold required for automated submission."}
                              </p>
                              <div className="text-[10px] text-amber-700 bg-amber-100/60 p-2 rounded-lg border border-amber-200/60">
                                <strong>Tip:</strong> Move closer to the defect, ensure good natural lighting, and keep the damaged area centered without extreme shadows or reflections.
                              </div>
                            </div>
                          ) : detectionResult.status === "blurry_image" ? (
                            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-amber-800 font-bold">
                                  <AlertCircle size={15} className="shrink-0 text-amber-600" />
                                  <span>BLURRY PHOTOGRAPH DETECTED</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRetakePhoto}
                                  className="px-2 py-0.5 text-[10px] font-bold font-mono text-amber-900 bg-amber-200/80 rounded hover:bg-amber-300 transition-colors shrink-0 cursor-pointer"
                                >
                                  Retake Photo
                                </button>
                              </div>
                              <p className="text-amber-700 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "The uploaded photograph appears blurry or lacks sufficient focus. Please upload a clearer photograph of the road damage."}
                              </p>
                            </div>
                          ) : detectionResult.status === "underexposed" ? (
                            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-amber-800 font-bold">
                                  <AlertCircle size={15} className="shrink-0 text-amber-600" />
                                  <span>UNDEREXPOSED / DARK PHOTOGRAPH</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRetakePhoto}
                                  className="px-2 py-0.5 text-[10px] font-bold font-mono text-amber-900 bg-amber-200/80 rounded hover:bg-amber-300 transition-colors shrink-0 cursor-pointer"
                                >
                                  Retake Photo
                                </button>
                              </div>
                              <p className="text-amber-700 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "The photograph is underexposed or too dark to assess road surface defects. Please capture the road damage in adequate lighting."}
                              </p>
                            </div>
                          ) : detectionResult.status === "no_damage_found" ? (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-blue-900 font-bold">
                                  <Info size={15} className="shrink-0 text-blue-600" />
                                  <span>NO ROAD DAMAGE DETECTED</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleRetakePhoto}
                                  className="px-2 py-0.5 text-[10px] font-bold font-mono text-blue-900 bg-blue-200/80 rounded hover:bg-blue-300 transition-colors shrink-0 cursor-pointer"
                                >
                                  Retake / Replace
                                </button>
                              </div>
                              <p className="text-blue-800 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "The automated computer vision model could not confidently detect road damage in this image. Please retake the photo ensuring the defect is centered and clearly visible."}
                              </p>
                              <div className="text-[10px] text-blue-700 bg-blue-100/60 p-2 rounded-lg border border-blue-200/60 leading-normal">
                                <strong>Municipal Policy Note:</strong> Direct citizen automated report submission requires $\ge 60\%$ AI confidence to prevent queue congestion. If damage is present but undetectable due to conditions (e.g. standing water, glare), please take a closer angled photo or report directly to the Ward Helpdesk for manual field crew dispatch.
                              </div>
                            </div>
                          ) : detectionResult.status === "ai_unavailable" ? (
                            <div className="p-3 bg-stone-100 border border-stone-300 rounded-xl text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-stone-800 font-bold">
                                  <Info size={15} className="shrink-0 text-stone-600" />
                                  <span>AI INSPECTION SERVICE OFFLINE</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => runInspection(selectedPhoto)}
                                  className="px-2 py-1 text-[10px] font-bold font-mono text-stone-900 bg-stone-200 rounded hover:bg-stone-300 transition-colors shrink-0 cursor-pointer"
                                >
                                  Retry
                                </button>
                              </div>
                              <p className="text-stone-600 text-[11px] leading-relaxed">
                                {detectionResult.message ||
                                  "AI inspection service is temporarily unavailable. Please retry verification before submitting."}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="ai-telemetry-metrics glass grid grid-cols-2 gap-2 text-xs">
                                <div className="metric-box">
                                  <small>VERIFIED DEFECT</small>
                                  <strong>{detectionResult.category.toUpperCase()}</strong>
                                </div>
                                <div className="metric-box">
                                  <small>GENUINE AI CONFIDENCE</small>
                                  <strong className="text-[#E65336]">
                                    {(detectionResult.confidence * 100).toFixed(1)}%
                                  </strong>
                                </div>
                                <div className="metric-box">
                                  <small>PHYSICAL DEPTH</small>
                                  <strong className="text-xs text-[#242522]">
                                    {detectionResult.depthEstimateMm != null
                                      ? `${detectionResult.depthEstimateMm}mm`
                                      : "Unmeasured (2D Imagery)"}
                                  </strong>
                                </div>
                                <div className="metric-box">
                                  <small>CAVITIES LOCALIZED</small>
                                  <strong>{detectionResult.boxes.length}</strong>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-[#242522]/60 px-1">
                                <Info size={11} className="text-[#E65336] shrink-0" />
                                <span>
                                  YOLOv8n Genuine Computer Vision Inference. Depth must be verified on-site by municipal field crew.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Location</span>
                    </button>
                    <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
                      <button
                        type="button"
                        disabled={
                          isAnalyzing ||
                          !detectionResult ||
                          detectionResult.status !== "detected" ||
                          (detectionResult.confidence || 0) < 0.60
                        }
                        onClick={() => validateAndProceed(4)}
                        className="button button--primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <span>Continue to Damage Category</span>
                        <ArrowRight size={14} />
                      </button>
                      {(!detectionResult ||
                        detectionResult.status !== "detected" ||
                        (detectionResult.confidence || 0) < 0.60) && (
                        <span className="text-[10px] text-[#687567] font-mono">
                          Requires road damage detection with ≥ 60% AI confidence to proceed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: CLASSIFY ROAD DAMAGE */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <fieldset className="border-0 p-0 m-0">
                    <legend className="text-xs font-mono font-bold text-[#687567] mb-2 block">
                      SELECT ROAD DEFECT CATEGORY (AI ASSIGNED · CITIZEN CONFIRMABLE)
                    </legend>

                    <div
                      role="radiogroup"
                      aria-label="Damage Category"
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"
                    >
                      {DAMAGE_CATEGORIES.map((cat) => {
                        const Icon = cat.icon
                        const isSelected = selectedType === cat.id
                        return (
                          <div
                            key={cat.id}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onClick={() => setSelectedType(cat.id)}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                setSelectedType(cat.id)
                                e.preventDefault()
                              }
                            }}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E65336] flex flex-col justify-between ${
                              isSelected
                                ? "bg-orange-50/80 border-[#E65336] shadow-sm ring-1 ring-orange-200"
                                : "bg-white/80 border-[#242522]/15 hover:border-[#242522]/30"
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  isSelected
                                    ? "bg-[#E65336] text-white"
                                    : "bg-[#ECE6D8] text-[#242522]"
                                }`}
                              >
                                <Icon size={17} />
                              </div>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-[#E65336] text-white flex items-center justify-center text-[10px]">
                                  <Check size={12} strokeWidth={3} />
                                </span>
                              )}
                            </div>
                            <div>
                              <strong className="text-xs font-bold text-[#242522] block mb-0.5">
                                {cat.label}
                              </strong>
                              <p className="text-[11px] text-[#687567] leading-tight">
                                {cat.sublabel}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </fieldset>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => validateAndProceed(5)}
                      className="button button--primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <span>Continue to Severity</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: ASSESS SEVERITY */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <fieldset className="border-0 p-0 m-0">
                    <legend className="text-xs font-mono font-bold text-[#687567] mb-2 block">
                      SEVERITY ASSESSMENT (IMPACT ON TRAFFIC SAFETY & VEHICLES)
                    </legend>

                    <div
                      role="radiogroup"
                      aria-label="Severity Level"
                      className="space-y-2.5"
                    >
                      {SEVERITY_LEVELS.map((sev) => {
                        const isSelected = selectedSeverity === sev.id
                        return (
                          <div
                            key={sev.id}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onClick={() => setSelectedSeverity(sev.id)}
                            onKeyDown={(e) => {
                              if (e.key === " " || e.key === "Enter") {
                                setSelectedSeverity(sev.id)
                                e.preventDefault()
                              }
                            }}
                            className={`p-3 sm:p-3.5 rounded-xl border cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E65336] flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 ${
                              isSelected
                                ? "bg-white border-[#242522] shadow-sm ring-2 ring-orange-200"
                                : "bg-white/70 border-[#242522]/15 hover:border-[#242522]/30"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-full shrink-0"
                                style={{ backgroundColor: sev.color }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <strong className="text-xs font-bold text-[#242522]">
                                    {sev.label}
                                  </strong>
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#ECE6D8] text-[#242522] font-bold shrink-0">
                                    {sev.numericLevel}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#687567] leading-tight">
                                  {sev.desc}
                                </p>
                              </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0 sm:pl-3 self-start sm:self-auto">
                              <span
                                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded inline-block"
                                style={{ backgroundColor: sev.bgLight, color: sev.color }}
                              >
                                {sev.impact}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </fieldset>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Category</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => validateAndProceed(6)}
                      className="button button--primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <span>Continue to Road Details</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: ROAD INFORMATION */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  {/* Road Usage Corridor Selection */}
                  <fieldset className="border-0 p-0 m-0">
                    <legend className="text-xs font-mono font-bold text-[#687567] mb-2 block">
                      ROAD USAGE CORRIDOR (INFLUENCES MUNICIPAL PRIORITY SCORE)
                    </legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: "arterial", label: "Heavy Arterial / Highway", sub: "Highest volume, bus transit corridor" },
                        { id: "collector", label: "District Collector", sub: "Connecting residential to main commercial hubs" },
                        { id: "pedestrian_cycle", label: "Pedestrian / Bike Corridor", sub: "School zone, market walk, cyclist lane" },
                        { id: "local", label: "Local Residential Street", sub: "Interior neighborhood street" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setRoadClass(item.id as RoadClass)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            roadClass === item.id
                              ? "bg-orange-50/80 border-[#E65336] shadow-sm font-bold"
                              : "bg-white/80 border-[#242522]/15 text-[#687567]"
                          }`}
                        >
                          <strong className="text-xs text-[#242522] block">{item.label}</strong>
                          <span className="text-[10px] text-[#8B9185]">{item.sub}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {/* Additional Description */}
                  <div className="space-y-1">
                    <label htmlFor="road-notes" className="text-xs font-mono font-bold text-[#687567] block">
                      ADDITIONAL DESCRIPTION & OBSERVATIONS (OPTIONAL)
                    </label>
                    <textarea
                      id="road-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="E.g. In curb lane 40m past signal; dangerous tire impact at night; water pooling..."
                      className="w-full p-2.5 bg-white rounded-lg border border-[#242522]/15 text-xs text-[#242522] focus:outline-none focus:ring-2 focus:ring-[#E65336]"
                      rows={2}
                    />
                  </div>

                  {/* Citizen Reporter Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="reporter-name" className="text-xs font-mono font-bold text-[#687567] block">
                        YOUR NAME / AFFILIATION (OPTIONAL)
                      </label>
                      <input
                        id="reporter-name"
                        type="text"
                        placeholder="Elena Vance / Local Resident"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className="w-full p-2.5 bg-white rounded-lg border border-[#242522]/15 text-xs text-[#242522] focus:outline-none focus:ring-2 focus:ring-[#E65336] min-h-[42px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="reporter-contact" className="text-xs font-mono font-bold text-[#687567] block">
                        PHONE / EMAIL (FOR REPAIR STATUS SMS)
                      </label>
                      <input
                        id="reporter-contact"
                        type="text"
                        inputMode="email"
                        placeholder="9820012345 or email@domain.com"
                        value={reporterContact}
                        onChange={(e) => setReporterContact(e.target.value)}
                        className="w-full p-2.5 bg-white rounded-lg border border-[#242522]/15 text-xs text-[#242522] focus:outline-none focus:ring-2 focus:ring-[#E65336] min-h-[42px]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(5)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Severity</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => validateAndProceed(7)}
                      className="button button--primary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px]"
                    >
                      <span>Review Report Summary</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: REVIEW AND SUBMIT */}
              {currentStep === 7 && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-[#242522] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-[#E65336]" />
                      <span>Please review all details before submitting to municipal dispatch.</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-[#E65336] uppercase">
                      Final Step
                    </span>
                  </div>

                  {/* Summary Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Location Summary */}
                    <div className="p-3.5 rounded-xl bg-white/80 border border-[#242522]/10 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-[#8B9185] flex items-center gap-1">
                          <MapPin size={12} className="text-[#E65336]" />
                          LOCATION & WARD
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(2)}
                          className="text-[#E65336] text-[11px] font-mono hover:underline flex items-center gap-0.5"
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                      </div>
                      <strong className="text-xs text-[#242522] block">
                        {activeLocation?.address || "Location missing"}
                      </strong>
                      <div className="text-[11px] font-mono text-[#687567]">
                        LAT: {activeLocation?.lat.toFixed(5)}°N · LNG: {activeLocation?.lng.toFixed(5)}°E
                      </div>
                      {boundaryStatus?.wardName && (
                        <span className="inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          MCGM Ward {boundaryStatus.wardName}
                        </span>
                      )}
                    </div>

                    {/* Defect Classification Summary */}
                    <div className="p-3.5 rounded-xl bg-white/80 border border-[#242522]/10 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-[#8B9185] flex items-center gap-1">
                          <AlertTriangle size={12} className="text-[#E65336]" />
                          DAMAGE & SEVERITY
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(4)}
                          className="text-[#E65336] text-[11px] font-mono hover:underline flex items-center gap-0.5"
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                      </div>
                      <strong className="text-xs text-[#242522] block">
                        {DAMAGE_CATEGORIES.find((c) => c.id === selectedType)?.label}
                      </strong>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              SEVERITY_LEVELS.find((s) => s.id === selectedSeverity)?.color,
                          }}
                        />
                        <span className="text-xs font-bold text-[#242522]">
                          {SEVERITY_LEVELS.find((s) => s.id === selectedSeverity)?.label}
                        </span>
                      </div>
                    </div>

                    {/* Photo & CV Telemetry */}
                    <div className="p-3.5 rounded-xl bg-white/80 border border-[#242522]/10 flex items-center gap-3">
                      <img
                        src={selectedPhoto}
                        alt="Thumbnail"
                        className="w-16 h-16 rounded-lg object-cover border border-[#242522]/15"
                      />
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-[#8B9185]">
                            AI CV INSPECTION
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(3)}
                            className="text-[#E65336] text-[11px] font-mono hover:underline flex items-center gap-0.5"
                          >
                            <Edit2 size={10} /> Edit
                          </button>
                        </div>
                        <strong className="text-xs text-[#242522] block">
                          Depth: {detectionResult?.depthEstimateMm != null ? `${detectionResult.depthEstimateMm}mm` : "Unmeasured (Field gauge required)"}
                        </strong>
                        <span className="text-[11px] text-[#687567] block">
                          {detectionResult?.status === "detected"
                            ? `YOLOv8 AI confidence: ${(detectionResult.confidence * 100).toFixed(1)}%`
                            : "Manual Citizen Report (Unverified by AI)"}
                        </span>
                      </div>
                    </div>

                    {/* Road Context & Notes */}
                    <div className="p-3.5 rounded-xl bg-white/80 border border-[#242522]/10 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-[#8B9185]">
                          ROAD & REPORTER
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(6)}
                          className="text-[#E65336] text-[11px] font-mono hover:underline flex items-center gap-0.5"
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                      </div>
                      <strong className="text-xs text-[#242522] block capitalize">
                        {roadClass} Corridor
                      </strong>
                      <p className="text-[11px] text-[#687567] line-clamp-2">
                        {notes || "No additional notes provided."}
                      </p>
                    </div>
                  </div>

                  {/* Submission Warning or Duplicate Prompt */}
                  {duplicateResult && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                        <span>
                          Notice: A nearby defect #{duplicateResult.existingIssue?.trackingCode} is already recorded {duplicateResult.distanceMeters}m away.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDuplicateDialog(true)}
                        className="px-2.5 py-1 rounded bg-amber-200 hover:bg-amber-300 font-bold text-[11px] transition-colors"
                      >
                        Review Match
                      </button>
                    </div>
                  )}

                  {/* Step Navigation Controls */}
                  <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#242522]/10">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(6)}
                      className="button button--secondary text-xs flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[42px]"
                      disabled={isSubmitting}
                    >
                      <ArrowLeft size={14} />
                      <span>Back to Road Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitReport()}
                      disabled={isSubmitting || !activeLocation || !boundaryStatus?.isInsideMumbai}
                      className="button button--primary text-xs flex items-center justify-center gap-1.5 px-6 w-full sm:w-auto min-h-[42px]"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-white" />
                          <span>Transmitting to Municipal Triage...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Verified Report</span>
                          <ArrowDownRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
