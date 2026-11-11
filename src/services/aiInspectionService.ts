/**
 * RoadGuard AI — Genuine Computer Vision Inspection Service
 * 
 * Communicates with the Railway / Express AI inference pipeline running
 * YOLOv8n-Pothole-ONNX and MobileNetV4 scene classification.
 * 
 * Completely eliminates fake canvas darkness heuristics, hardcoded percentages,
 * and fabricated millimeter depth measurements.
 */

import {
  AIDetectionResult,
  DamageCategory,
  DetectionBox,
  SeverityLevel,
} from "../types/roadguard"
import { apiClient } from "./apiClient"

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]

export interface FileValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Validates road photograph format and file size.
 */
export function validateImageFile(file: File): FileValidationResult {
  if (!file) {
    return { isValid: false, error: "No image file provided." }
  }

  const normalizedType = file.type.toLowerCase()
  const hasValidType = SUPPORTED_MIME_TYPES.includes(normalizedType)
  const hasValidExt = /\.(jpe?g|png|webp)$/i.test(file.name)

  if (!hasValidType && !hasValidExt) {
    return {
      isValid: false,
      error: `Unsupported file format (${file.type || "unknown"}). Please upload a JPG, JPEG, PNG, or WEBP image.`,
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      isValid: false,
      error: `File size (${sizeMb}MB) exceeds the maximum allowed limit of 10MB.`,
    }
  }

  return { isValid: true }
}

/**
 * Loads image from File into an HTMLImageElement (used for client rendering).
 */
export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Failed to decode image data."))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error("Failed to read file from disk."))
    reader.readAsDataURL(file)
  })
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image from URL: ${url}`))
    img.src = url
  })
}

/**
 * Client-side visual bounding box renderer for verified detections.
 * Renders ONLY the exact bounding boxes returned by genuine model inference.
 */
export function generateAnnotatedImageDataUrl(
  img: HTMLImageElement,
  boxes: DetectionBox[],
): string {
  if (!boxes || boxes.length === 0) {
    return img.src
  }

  const width = img.naturalWidth || img.width || 800
  const height = img.naturalHeight || img.height || 600

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return img.src

  // Draw original base image
  ctx.drawImage(img, 0, 0, width, height)

  // Draw annotations for each verified detection box
  boxes.forEach((box) => {
    const bx = (box.x / 100) * width
    const by = (box.y / 100) * height
    const bw = (box.width / 100) * width
    const bh = (box.height / 100) * height

    const primaryColor = "#E65336" // Precision Vermilion
    const cornerLen = Math.min(24, Math.min(bw, bh) * 0.3)

    // Box fill tint
    ctx.fillStyle = "rgba(230, 83, 54, 0.12)"
    ctx.fillRect(bx, by, bw, bh)

    // Bounding Box stroke
    ctx.strokeStyle = primaryColor
    ctx.lineWidth = 2.5
    ctx.strokeRect(bx, by, bw, bh)

    // Corner brackets
    ctx.lineWidth = 4
    ctx.strokeStyle = "#F5F1E8" // Crisp cream corners

    // Top-left
    ctx.beginPath()
    ctx.moveTo(bx, by + cornerLen)
    ctx.lineTo(bx, by)
    ctx.lineTo(bx + cornerLen, by)
    ctx.stroke()

    // Top-right
    ctx.beginPath()
    ctx.moveTo(bx + bw - cornerLen, by)
    ctx.lineTo(bx + bw, by)
    ctx.lineTo(bx + bw, by + cornerLen)
    ctx.stroke()

    // Bottom-left
    ctx.beginPath()
    ctx.moveTo(bx, by + bh - cornerLen)
    ctx.lineTo(bx, by + bh)
    ctx.lineTo(bx + cornerLen, by + bh)
    ctx.stroke()

    // Bottom-right
    ctx.beginPath()
    ctx.moveTo(bx + bw - cornerLen, by + bh)
    ctx.lineTo(bx + bw, by + bh)
    ctx.lineTo(bx + bw, by + bh - cornerLen)
    ctx.stroke()

    // Header Badge Pill
    const badgeText = `${box.label || "POTHOLE"}`
    ctx.font = "bold 13px 'DM Mono', monospace, sans-serif"
    const textWidth = ctx.measureText(badgeText).width
    const badgeH = 22
    const badgeW = textWidth + 18
    const badgeY = Math.max(0, by - badgeH - 4)

    ctx.fillStyle = "#242522"
    ctx.fillRect(bx, badgeY, badgeW, badgeH)

    ctx.strokeStyle = primaryColor
    ctx.lineWidth = 1
    ctx.strokeRect(bx, badgeY, badgeW, badgeH)

    // Indicator dot
    ctx.fillStyle = primaryColor
    ctx.beginPath()
    ctx.arc(bx + 8, badgeY + badgeH / 2, 3.5, 0, Math.PI * 2)
    ctx.fill()

    // Text label
    ctx.fillStyle = "#F5F1E8"
    ctx.fillText(badgeText, bx + 16, badgeY + 15)
  })

  return canvas.toDataURL("image/jpeg", 0.92)
}

/**
 * Main AI Road Inspection Orchestrator:
 * Executes real server-side YOLOv8 inference and MobileNet scene validation.
 * 
 * Accurately reports:
 * - Genuine detections with model confidence (e.g. 59.1%)
 * - Unrelated images (fashion, pets, food, indoor) -> rejected with guidance
 * - Poor quality images (blurry, underexposed) -> rejected with guidance
 * - Clean road surfaces -> no damage detected, allowing manual citizen reporting
 * - Server offline -> transparently reports AI unavailable without fabricating telemetry
 */
export async function inspectRoadImage(
  fileOrUrl: File | string,
  onProgress?: (stage: string) => void,
): Promise<AIDetectionResult> {
  const startTime = performance.now()
  onProgress?.("Validating photograph format & image bytes...")

  let originalUrl: string

  if (typeof fileOrUrl === "string") {
    originalUrl = fileOrUrl
  } else {
    const validation = validateImageFile(fileOrUrl)
    if (!validation.isValid) {
      throw new Error(validation.error)
    }
    originalUrl = URL.createObjectURL(fileOrUrl)
  }

  onProgress?.("Sending image to RoadGuard AI Computer Vision engine...")

  try {
    const serverResult = await apiClient.ai.inspectImage(fileOrUrl)
    const inferenceTime = Math.round(performance.now() - startTime)

    onProgress?.("Processing computer vision telemetry...")

    const boxes: DetectionBox[] = (serverResult.detections || []).map((d) => ({
      id: d.id,
      category: d.category as DamageCategory,
      confidence: d.confidence,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      label: d.label,
    }))

    // Calculate approximate surface loss ratio from genuine detected bounding boxes
    let surfaceLossRatio = 0
    if (boxes.length > 0) {
      const totalBoxArea = boxes.reduce((acc, b) => acc + (b.width * b.height) / 10000, 0)
      surfaceLossRatio = Math.min(0.85, Number(totalBoxArea.toFixed(3)))
    }

    const annotatedImageUrl = serverResult.annotatedImageBase64 || originalUrl

    return {
      engine: "yolov8_onnx",
      status: serverResult.status,
      category: (serverResult.detectedClasses?.[0] as DamageCategory) || "cavity",
      confidence: serverResult.highestConfidence || 0,
      confidenceScore: serverResult.highestConfidence || 0,
      boxes,
      surfaceLossRatio,
      depthEstimateMm: null, // Monocular 2D images cannot determine physical depth
      depthNote:
        serverResult.depthNote ||
        "Physical depth cannot be determined from 2D imagery. Requires on-site depth gauge measurement by municipal field crew.",
      severity: serverResult.severity || "moderate",
      severityLevel: serverResult.severity || "moderate",
      originalImageUrl: originalUrl,
      annotatedImageUrl,
      rawInferenceTimeMs: inferenceTime,
      modelName: serverResult.modelName,
      modelVersion: serverResult.modelVersion,
      topPredictedClass: serverResult.topPredictedClass,
      unrelatedClass: serverResult.unrelatedClass,
      message: serverResult.message,
      verificationToken: serverResult.verificationToken,
      imageHash: serverResult.imageHash,
      isSubmissionAllowed:
        serverResult.isSubmissionAllowed ??
        (serverResult.status === "detected" && (serverResult.highestConfidence || 0) >= 0.60),
      minimumConfidenceRequired: serverResult.minimumConfidenceRequired || 0.60,
    }
  } catch (err: any) {
    // If backend AI endpoint is unreachable, report honestly as ai_unavailable
    const inferenceTime = Math.round(performance.now() - startTime)
    onProgress?.("AI service offline; reporting status honestly...")

    return {
      engine: "demo_fallback",
      status: "ai_unavailable",
      category: "cavity",
      confidence: 0,
      confidenceScore: 0,
      boxes: [],
      surfaceLossRatio: 0,
      depthEstimateMm: null,
      depthNote: "Physical depth requires on-site measurement.",
      severity: "low",
      severityLevel: "low",
      originalImageUrl: originalUrl,
      annotatedImageUrl: originalUrl,
      rawInferenceTimeMs: inferenceTime,
      modelName: "RoadGuard-OfflineFallback",
      modelVersion: "v3.0",
      message:
        "AI inspection service is temporarily offline. Automatic verification cannot proceed without genuine model inference.",
      isSubmissionAllowed: false,
      minimumConfidenceRequired: 0.60,
    }
  }
}
