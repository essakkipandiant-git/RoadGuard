import fs from "fs"
import path from "path"
import crypto from "crypto"
import sharp from "sharp"
import { logger } from "../utils/logger"
import { env } from "../config/env"

// Safely import onnxruntime-node
let ort: typeof import("onnxruntime-node") | null = null
try {
  ort = require("onnxruntime-node")
} catch (err: any) {
  logger.warn("onnxruntime-node could not be loaded; AI detection service will run in fallback mode", {
    error: err?.message,
  })
}

export type AIDetectionStatus =
  | "detected"
  | "low_confidence"
  | "no_damage_found"
  | "unrelated_image"
  | "blurry_image"
  | "underexposed"
  | "ai_unavailable"

/**
 * Centrally configurable minimum defect detection confidence required for automated submission.
 */
export const MIN_DEFECT_CONFIDENCE_THRESHOLD = Number(
  process.env.ROADGUARD_MIN_DEFECT_CONFIDENCE || 0.60
)

export interface DetectionBoxResult {
  id: string
  category: "cavity" | "crack" | "depression"
  confidence: number // 0 to 1
  x: number // 0-100 percentage
  y: number // 0-100 percentage
  width: number // 0-100 percentage
  height: number // 0-100 percentage
  label: string
}

export interface ImageQualityMetrics {
  meanLuminance: number
  maxLuminance: number
  minLuminance: number
  laplacianVariance: number
}

export interface SceneClassificationResult {
  topClass: string
  topClassId: number
  topProb: number
  isAnimalOrOrganism: boolean
  isUnrelatedManufactured: boolean
  isRoadOrStreet: boolean
  unrelatedScore: number
  unrelatedLabel: string
}

export interface InspectionVerificationPayload {
  imageHash: string
  status: AIDetectionStatus
  highestConfidence: number
  detectedClasses: string[]
  detectionsCount: number
  timestamp: number
  expiresAt: number
}

export interface AIDetectionResponse {
  status: AIDetectionStatus
  modelName: string
  modelVersion: string
  detectedClasses: string[]
  detections: DetectionBoxResult[]
  highestConfidence: number
  severity: "critical" | "high" | "moderate" | "low"
  depthEstimateMm: null // Explicitly null: Monocular 2D images cannot determine physical depth
  depthNote: string
  annotatedImageBase64?: string
  topPredictedClass?: string
  unrelatedClass?: string
  inferenceDurationMs: number
  message: string
  imageHash: string
  verificationToken?: string
  isSubmissionAllowed: boolean
  minimumConfidenceRequired: number
}

/**
 * Resolves a model path across multiple possible project root configurations.
 */
function resolveModelFile(fileName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), "models", fileName),
    path.resolve(process.cwd(), "server/models", fileName),
    path.resolve(process.cwd(), "dist/models", fileName),
    path.resolve(process.cwd(), "server/dist/models", fileName),
    path.resolve(__dirname, "../../models", fileName),
    path.resolve(__dirname, "../../../models", fileName),
    path.resolve(__dirname, "../models", fileName),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

// Patterns for non-road scene classes (apparel, domestic, furniture, personal goods)
const UNRELATED_CLASS_PATTERN =
  /suit|dress|coat|jacket|jean|jersey|tie|gown|shoe|boot|sneaker|bikini|swimsuit|sunglass|hat|cap|bonnet|vest|sock|shirt|cardigan|sweatshirt|pajama|kimono|abaya|stole|wool|scarf|wig|brassiere|apparel|clothing|groom|bride|chair|sofa|couch|table|bed|desk|wardrobe|refrigerator|microwave|television|monitor|laptop|keyboard|pillow|plate|cup|bowl|fork|spoon|pizza|burger|ice cream|sandwich|coffee|tea|cocktail|beer|wine|lipstick|perfume|handbag|backpack|wallet|umbrella|cellular telephone|necklace|watch/i

const ROAD_OR_OUTDOOR_PATTERN =
  /street|road|asphalt|curb|manhole|pavement|highway|traffic light|crosswalk|speed bump|barrier|bridge|streetcar|cab|taxi|freight car|passenger car|minibus/i

export class AiDetectionService {
  private static yoloSession: any = null
  private static mobilenetSession: any = null
  private static mobilenetConfig: { id2label?: Record<string, string> } | null = null
  private static isInitialized = false
  private static initError: Error | null = null
  private static activeInferences = 0
  private static readonly MAX_CONCURRENT = 2
  private static consumedTokens = new Set<string>()
  private static analysisRegistry = new Map<string, {
    imageHash: string
    status: AIDetectionStatus
    highestConfidence: number
    detectedClasses: string[]
    detections: DetectionBoxResult[]
    severity: "critical" | "high" | "moderate" | "low"
    timestamp: number
    expiresAt: number
    isConsumed: boolean
  }>()

  /**
   * Cryptographically signs an AI inspection verification token using HMAC-SHA256.
   * Binds the inference result to the SHA-256 hash of the analyzed image bytes.
   */
  public static generateVerificationToken(payload: InspectionVerificationPayload): string {
    const dataString = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const secret = env.JWT_SECRET || "roadguard-ai-secret-key-32chars-min!!"
    const signature = crypto
      .createHmac("sha256", secret)
      .update(dataString)
      .digest("base64url")
    return `${dataString}.${signature}`
  }

  /**
   * Cryptographically verifies an AI inspection token.
   * Enforces HMAC signature integrity, expiration, and image hash binding.
   */
  public static verifyInspectionToken(
    token: string,
    expectedImageHash?: string,
  ): { isValid: boolean; payload?: InspectionVerificationPayload; error?: string } {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return { isValid: false, error: "Invalid or missing AI verification token." }
    }

    const [dataString, signature] = token.split(".")
    if (!dataString || !signature) {
      return { isValid: false, error: "Malformed AI verification token format." }
    }

    const secret = env.JWT_SECRET || "roadguard-ai-secret-key-32chars-min!!"
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(dataString)
      .digest("base64url")

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expectedSignature)
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { isValid: false, error: "AI verification signature mismatch. Client token tampering detected." }
    }

    let payload: InspectionVerificationPayload
    try {
      payload = JSON.parse(Buffer.from(dataString, "base64url").toString("utf8"))
    } catch {
      return { isValid: false, error: "Corrupted AI verification token payload." }
    }

    if (Date.now() > payload.expiresAt) {
      return { isValid: false, error: "AI verification token has expired. Please re-inspect the road photograph." }
    }

    if (expectedImageHash && payload.imageHash !== expectedImageHash) {
      return { isValid: false, error: "AI verification token does not match the submitted photograph (token reuse blocked)." }
    }

    if (this.consumedTokens.has(token)) {
      return { isValid: false, error: "AI verification token has already been consumed for another report." }
    }

    return { isValid: true, payload }
  }

  /**
   * Authoritative gate check: Verifies that a report submission meets all genuine AI requirements.
   * Enforces:
   * 1. Token cryptographic authenticity & non-expired state
   * 2. Single-use consumption
   * 3. Detected status
   * 4. Highest confidence >= MIN_DEFECT_CONFIDENCE_THRESHOLD (0.60)
   */
  public static verifyInspectionForSubmission(params: {
    token?: string | null
    imageHash?: string | null
    photoUrl?: string | null
  }): { isApproved: boolean; reason?: string; highestConfidence?: number; detectedClasses?: string[] } {
    // 1. If cryptographically signed token is provided:
    if (params.token) {
      const verified = this.verifyInspectionToken(params.token, params.imageHash || undefined)
      if (!verified.isValid || !verified.payload) {
        return { isApproved: false, reason: verified.error }
      }

      if (verified.payload.status !== "detected") {
        return {
          isApproved: false,
          reason: `Photograph failed automated inspection (status: ${verified.payload.status}).`,
        }
      }

      if (verified.payload.highestConfidence < MIN_DEFECT_CONFIDENCE_THRESHOLD) {
        return {
          isApproved: false,
          reason: `Defect confidence (${(verified.payload.highestConfidence * 100).toFixed(1)}%) is below the required ${(MIN_DEFECT_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% threshold.`,
        }
      }

      // Mark token as consumed
      this.consumedTokens.add(params.token)
      return {
        isApproved: true,
        highestConfidence: verified.payload.highestConfidence,
        detectedClasses: verified.payload.detectedClasses,
      }
    }

    // 2. If imageHash is provided, query internal server analysis registry:
    if (params.imageHash) {
      const record = this.analysisRegistry.get(params.imageHash)
      if (!record) {
        return {
          isApproved: false,
          reason: "No server-side AI inspection record found for this photograph.",
        }
      }

      if (Date.now() > record.expiresAt) {
        return { isApproved: false, reason: "Inspection record has expired." }
      }

      if (record.isConsumed) {
        return {
          isApproved: false,
          reason: "This inspection record was already consumed for another report.",
        }
      }

      if (record.status !== "detected") {
        return {
          isApproved: false,
          reason: `Photograph failed automated inspection (status: ${record.status}).`,
        }
      }

      if (record.highestConfidence < MIN_DEFECT_CONFIDENCE_THRESHOLD) {
        return {
          isApproved: false,
          reason: `Defect confidence (${(record.highestConfidence * 100).toFixed(1)}%) is below the required ${(MIN_DEFECT_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% threshold.`,
        }
      }

      record.isConsumed = true
      return {
        isApproved: true,
        highestConfidence: record.highestConfidence,
        detectedClasses: record.detectedClasses,
      }
    }

    return {
      isApproved: false,
      reason: "Missing AI verification token or image analysis record. Genuine road photograph inspection required.",
    }
  }

  /**
   * Resets internal analysis registry and consumed tokens (used for test isolation).
   */
  public static resetAnalysisRegistryForTests(): void {
    this.consumedTokens.clear()
    this.analysisRegistry.clear()
  }

  public static getSubsystemStatus() {
    const mem = process.memoryUsage()
    return {
      status: this.isInitialized ? "operational" : this.initError ? "error" : "uninitialized",
      isInitialized: this.isInitialized,
      yolo: {
        loaded: !!this.yoloSession,
        name: "YOLOv8n-Pothole-ONNX",
        version: "v8.0.21-rdd",
      },
      sceneValidator: {
        loaded: !!this.mobilenetSession,
        name: "MobileNetV4-SceneValidator",
        version: "v4.0-fp32",
      },
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      },
      activeInferences: this.activeInferences,
      initError: this.initError ? this.initError.message : null,
    }
  }

  /**
   * Initializes both ONNX inference engines lazily.
   */
  public static async initialize(): Promise<boolean> {
    if (this.isInitialized) return true
    if (!ort) return false

    try {
      const yoloPath = resolveModelFile("yolov8n_pothole.onnx")
      const mobilenetPath =
        resolveModelFile("mobilenetv4_fp32.onnx") || resolveModelFile("mobilenetv4_scene.onnx")
      const configPath = resolveModelFile("mobilenetv4_config.json")

      if (!yoloPath) {
        logger.warn("YOLOv8 pothole model not found on disk. Checked search paths.")
        return false
      }

      if (!this.yoloSession) {
        this.yoloSession = await ort.InferenceSession.create(yoloPath, {
          executionProviders: ["cpu"],
          graphOptimizationLevel: "all",
        })
        logger.info("Loaded YOLOv8 pothole model successfully", { path: yoloPath })
      }

      if (mobilenetPath && configPath && !this.mobilenetSession) {
        this.mobilenetSession = await ort.InferenceSession.create(mobilenetPath, {
          executionProviders: ["cpu"],
          graphOptimizationLevel: "all",
        })
        this.mobilenetConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
        logger.info("Loaded MobileNet scene validation model successfully", { path: mobilenetPath })
      }

      this.isInitialized = true
      return true
    } catch (err: any) {
      this.initError = err
      logger.error("Failed to initialize AI detection models", { error: err?.message })
      return false
    }
  }

  /**
   * Computes exposure and sharpness metrics via luminance analysis and Laplacian variance.
   */
  public static async computeQualityMetrics(imageBuffer: Buffer): Promise<ImageQualityMetrics> {
    const { data, info } = await sharp(imageBuffer)
      .resize(300, 300, { fit: "inside" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { width, height } = info
    let sum = 0
    let max = 0
    let min = 255

    for (let i = 0; i < data.length; i++) {
      const val = data[i]
      sum += val
      if (val > max) max = val
      if (val < min) min = val
    }
    const meanLuminance = sum / data.length

    // Laplacian kernel: [ [0, 1, 0], [1, -4, 1], [0, 1, 0] ]
    let laplacianSum = 0
    let laplacianSqSum = 0
    let count = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const center = data[idx]
        const top = data[(y - 1) * width + x]
        const bottom = data[(y + 1) * width + x]
        const left = data[y * width + (x - 1)]
        const right = data[y * width + (x + 1)]

        const lap = top + bottom + left + right - 4 * center
        laplacianSum += lap
        laplacianSqSum += lap * lap
        count++
      }
    }

    const lapMean = count > 0 ? laplacianSum / count : 0
    const lapVariance = count > 0 ? laplacianSqSum / count - lapMean * lapMean : 0

    return {
      meanLuminance,
      maxLuminance: max,
      minLuminance: min,
      laplacianVariance: Math.max(0, lapVariance),
    }
  }

  /**
   * Classifies scene to identify non-road imagery (animals, portraits, fashion, food, indoor items).
   */
  public static async classifyScene(
    imageBuffer: Buffer,
  ): Promise<SceneClassificationResult | null> {
    if (!this.mobilenetSession || !this.mobilenetConfig || !ort) return null

    try {
      const { data } = await sharp(imageBuffer)
        .resize(224, 224, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const float32Data = new Float32Array(3 * 224 * 224)
      const channelSize = 224 * 224
      const mean = [0.485, 0.456, 0.406]
      const std = [0.229, 0.224, 0.225]

      for (let i = 0; i < channelSize; i++) {
        float32Data[i] = (data[i * 3] / 255.0 - mean[0]) / std[0]
        float32Data[channelSize + i] = (data[i * 3 + 1] / 255.0 - mean[1]) / std[1]
        float32Data[channelSize * 2 + i] = (data[i * 3 + 2] / 255.0 - mean[2]) / std[2]
      }

      const inputName = this.mobilenetSession.inputNames[0]
      const tensor = new ort.Tensor("float32", float32Data, [1, 3, 224, 224])
      const results = await this.mobilenetSession.run({ [inputName]: tensor })
      const logits = results[this.mobilenetSession.outputNames[0]].data as Float32Array

      // Softmax
      let maxLogit = -Infinity
      for (let i = 0; i < logits.length; i++) {
        if (logits[i] > maxLogit) maxLogit = logits[i]
      }
      let sumExp = 0
      for (let i = 0; i < logits.length; i++) {
        sumExp += Math.exp(logits[i] - maxLogit)
      }

      const predictions: Array<{ id: number; label: string; prob: number }> = []
      const id2label = this.mobilenetConfig.id2label || {}
      for (let i = 0; i < logits.length; i++) {
        const prob = Math.exp(logits[i] - maxLogit) / sumExp
        predictions.push({ id: i, label: id2label[i] || `class_${i}`, prob })
      }
      predictions.sort((a, b) => b.prob - a.prob)

      const top5 = predictions.slice(0, 5)
      const topPred = top5[0]

      // ImageNet classes 0 to 397 are living organisms (animals, birds, fish, insects, plants)
      const isAnimalOrOrganism = topPred.id <= 397
      const isUnrelatedManufactured = UNRELATED_CLASS_PATTERN.test(topPred.label)
      const isRoadOrStreet = ROAD_OR_OUTDOOR_PATTERN.test(topPred.label)

      let unrelatedScore = 0
      let topUnrelatedLabel = ""

      for (const pred of top5) {
        if (pred.id <= 397 || UNRELATED_CLASS_PATTERN.test(pred.label)) {
          unrelatedScore += pred.prob
          if (!topUnrelatedLabel) topUnrelatedLabel = pred.label
        }
      }

      return {
        topClass: topPred.label,
        topClassId: topPred.id,
        topProb: topPred.prob,
        isAnimalOrOrganism,
        isUnrelatedManufactured,
        isRoadOrStreet,
        unrelatedScore,
        unrelatedLabel: topUnrelatedLabel || topPred.label,
      }
    } catch (err: any) {
      logger.warn("Scene classification encountered non-fatal error", { error: err?.message })
      return null
    }
  }

  /**
   * Runs genuine YOLOv8 road damage detection with non-maximum suppression (NMS).
   */
  public static async detectPotholes(imageBuffer: Buffer): Promise<DetectionBoxResult[]> {
    if (!this.yoloSession || !ort) return []

    const origMeta = await sharp(imageBuffer).metadata()
    const origW = origMeta.width || 640
    const origH = origMeta.height || 640

    // Compute letterbox scaling & centering parameters (Ultralytics standard)
    const scale = Math.min(640 / origW, 640 / origH)
    const scaledW = origW * scale
    const scaledH = origH * scale
    const padX = (640 - scaledW) / 2
    const padY = (640 - scaledH) / 2

    // Dual-pass inference:
    // Pass 1: Standard aspect-ratio-preserving letterbox with 114 gray padding
    // Pass 2: High-frequency edge restored letterbox to recover asphalt fracture gradients from JPEG compression
    const [rawStandard, rawRestored] = await Promise.all([
      sharp(imageBuffer)
        .resize(640, 640, {
          fit: "contain",
          background: { r: 114, g: 114, b: 114 },
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
      sharp(imageBuffer)
        .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
        .resize(640, 640, {
          fit: "contain",
          background: { r: 114, g: 114, b: 114 },
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ])

    const candidateDetections: Array<{
      score: number
      cx: number
      cy: number
      w: number
      h: number
    }> = []

    const confThreshold = MIN_DEFECT_CONFIDENCE_THRESHOLD

    for (const raw of [rawStandard, rawRestored]) {
      const float32Data = new Float32Array(3 * 640 * 640)
      const channelSize = 640 * 640

      for (let i = 0; i < channelSize; i++) {
        float32Data[i] = raw.data[i * 3] / 255.0
        float32Data[channelSize + i] = raw.data[i * 3 + 1] / 255.0
        float32Data[channelSize * 2 + i] = raw.data[i * 3 + 2] / 255.0
      }

      const tensor = new ort.Tensor("float32", float32Data, [1, 3, 640, 640])
      const results = await this.yoloSession.run({ images: tensor })
      const outData = results["output0"].data as Float32Array
      const numAnchors = results["output0"].dims[2]

      for (let a = 0; a < numAnchors; a++) {
        const score = outData[4 * numAnchors + a]
        if (score >= confThreshold) {
          candidateDetections.push({
            score: Number(score.toFixed(4)),
            cx: outData[0 * numAnchors + a],
            cy: outData[1 * numAnchors + a],
            w: outData[2 * numAnchors + a],
            h: outData[3 * numAnchors + a],
          })
        }
      }
    }

    // Sort descending by model confidence
    candidateDetections.sort((a, b) => b.score - a.score)

    // Non-Maximum Suppression (IoU 0.45) in normalized image frame
    const finalBoxes: DetectionBoxResult[] = []

    function calculateIoU(
      b1: (typeof candidateDetections)[0],
      b2: (typeof candidateDetections)[0],
    ): number {
      const xx1 = Math.max(b1.cx - b1.w / 2, b2.cx - b2.w / 2)
      const yy1 = Math.max(b1.cy - b1.h / 2, b2.cy - b2.h / 2)
      const xx2 = Math.min(b1.cx + b1.w / 2, b2.cx + b2.w / 2)
      const yy2 = Math.min(b1.cy + b1.h / 2, b2.cy + b2.h / 2)
      const interW = Math.max(0, xx2 - xx1)
      const interH = Math.max(0, yy2 - yy1)
      const inter = interW * interH
      const a1 = b1.w * b1.h
      const a2 = b2.w * b2.h
      return inter / (a1 + a2 - inter)
    }

    for (const det of candidateDetections) {
      let keep = true
      for (const fb of finalBoxes) {
        // Map fb percentage coords back to 640 frame for accurate IoU
        const fbScaledW = (fb.width / 100) * origW * scale
        const fbScaledH = (fb.height / 100) * origH * scale
        const fbCx = (fb.x / 100) * origW * scale + padX + fbScaledW / 2
        const fbCy = (fb.y / 100) * origH * scale + padY + fbScaledH / 2
        const fbBox = {
          cx: fbCx,
          cy: fbCy,
          w: fbScaledW,
          h: fbScaledH,
          score: fb.confidence,
        }

        if (calculateIoU(det, fbBox) > 0.45) {
          keep = false
          break
        }
      }

      if (keep) {
        // Unpad and scale back to original image coordinate percentages
        const unpadX1 = det.cx - det.w / 2 - padX
        const unpadY1 = det.cy - det.h / 2 - padY
        const origX1 = unpadX1 / scale
        const origY1 = unpadY1 / scale
        const origBoxW = det.w / scale
        const origBoxH = det.h / scale

        const pctX = Number(Math.max(0, Math.min(100, (origX1 / origW) * 100)).toFixed(1))
        const pctY = Number(Math.max(0, Math.min(100, (origY1 / origH) * 100)).toFixed(1))
        const pctW = Number(Math.max(0, Math.min(100 - pctX, (origBoxW / origW) * 100)).toFixed(1))
        const pctH = Number(Math.max(0, Math.min(100 - pctY, (origBoxH / origH) * 100)).toFixed(1))

        finalBoxes.push({
          id: `det-${finalBoxes.length + 1}`,
          category: "cavity",
          confidence: det.score,
          x: pctX,
          y: pctY,
          width: pctW,
          height: pctH,
          label: `POTHOLE ${(det.score * 100).toFixed(0)}%`,
        })
      }

      if (finalBoxes.length >= 6) break
    }

    return finalBoxes
  }

  /**
   * Generates a genuine server-side annotated image buffer with SVG bounding boxes and confidence pills.
   */
  public static async generateAnnotatedImage(
    imageBuffer: Buffer,
    detections: DetectionBoxResult[],
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata()
    const width = metadata.width || 800
    const height = metadata.height || 600

    let svgBoxes = ""
    for (const box of detections) {
      const bx = (box.x / 100) * width
      const by = (box.y / 100) * height
      const bw = (box.width / 100) * width
      const bh = (box.height / 100) * height

      const badgeText = `${box.label}`
      const badgeW = Math.max(120, badgeText.length * 9 + 20)
      const badgeH = 24
      const badgeY = Math.max(0, by - badgeH - 4)

      svgBoxes += `
        <!-- Bounding Box -->
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgba(230, 83, 54, 0.12)" stroke="#E65336" stroke-width="3" rx="4" />
        
        <!-- Corner Reticles -->
        <line x1="${bx}" y1="${by}" x2="${bx + 16}" y2="${by}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx}" y1="${by}" x2="${bx}" y2="${by + 16}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx + bw}" y1="${by}" x2="${bx + bw - 16}" y2="${by}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx + bw}" y1="${by}" x2="${bx + bw}" y2="${by + 16}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx}" y1="${by + bh}" x2="${bx + 16}" y2="${by + bh}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx}" y1="${by + bh}" x2="${bx}" y2="${by + bh - 16}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx + bw}" y1="${by + bh}" x2="${bx + bw - 16}" y2="${by + bh}" stroke="#F5F1E8" stroke-width="4" />
        <line x1="${bx + bw}" y1="${by + bh}" x2="${bx + bw}" y2="${by + bh - 16}" stroke="#F5F1E8" stroke-width="4" />

        <!-- Label Badge -->
        <rect x="${bx}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="#242522" stroke="#E65336" stroke-width="1.5" rx="3" />
        <circle cx="${bx + 10}" cy="${badgeY + badgeH / 2}" r="3.5" fill="#E65336" />
        <text x="${bx + 20}" y="${badgeY + 16}" fill="#F5F1E8" font-family="monospace, sans-serif" font-size="12" font-weight="bold">${badgeText}</text>
      `
    }

    const svgOverlay = Buffer.from(`
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${svgBoxes}
      </svg>
    `)

    return sharp(imageBuffer)
      .composite([{ input: svgOverlay, blend: "over" }])
      .jpeg({ quality: 90 })
      .toBuffer()
  }

  /**
   * Master Inspection Orchestrator:
   * Performs real computer vision analysis, quality validation, and scene relevance checking.
   */
  public static async inspectRoadPhotograph(imageBuffer: Buffer): Promise<AIDetectionResponse> {
    const startTime = Date.now()
    const imageHash = crypto.createHash("sha256").update(imageBuffer).digest("hex")
    this.activeInferences++

    try {
      const initialized = await this.initialize()
      if (!initialized) {
        const token = this.generateVerificationToken({
          imageHash,
          status: "ai_unavailable",
          highestConfidence: 0,
          detectedClasses: [],
          detectionsCount: 0,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
        })
        return {
          status: "ai_unavailable",
          modelName: "RoadGuard-FallbackEngine",
          modelVersion: "v3.0",
          detectedClasses: [],
          detections: [],
          highestConfidence: 0,
          severity: "low",
          depthEstimateMm: null,
          depthNote: "Physical depth requires manual measurement.",
          inferenceDurationMs: Date.now() - startTime,
          message:
            "AI inspection service is temporarily unavailable. Please retry verification before submitting.",
          imageHash,
          verificationToken: token,
          isSubmissionAllowed: false,
          minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
        }
      }

      // Step 1: Exposure and sharpness quality checks
      const quality = await this.computeQualityMetrics(imageBuffer)

      if (quality.meanLuminance < 16 && quality.maxLuminance < 40) {
        const token = this.generateVerificationToken({
          imageHash,
          status: "underexposed",
          highestConfidence: 0,
          detectedClasses: [],
          detectionsCount: 0,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
        })
        return {
          status: "underexposed",
          modelName: "RoadGuard-ImageQualityValidator",
          modelVersion: "v3.0",
          detectedClasses: [],
          detections: [],
          highestConfidence: 0,
          severity: "low",
          depthEstimateMm: null,
          depthNote: "Physical depth cannot be assessed on underexposed photography.",
          inferenceDurationMs: Date.now() - startTime,
          message:
            "The photograph is underexposed or too dark to assess road surface defects. Please capture the road damage in adequate lighting.",
          imageHash,
          verificationToken: token,
          isSubmissionAllowed: false,
          minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
        }
      }

      if (quality.laplacianVariance < 18) {
        const token = this.generateVerificationToken({
          imageHash,
          status: "blurry_image",
          highestConfidence: 0,
          detectedClasses: [],
          detectionsCount: 0,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
        })
        return {
          status: "blurry_image",
          modelName: "RoadGuard-ImageQualityValidator",
          modelVersion: "v3.0",
          detectedClasses: [],
          detections: [],
          highestConfidence: 0,
          severity: "low",
          depthEstimateMm: null,
          depthNote: "Physical depth cannot be assessed on blurry photography.",
          inferenceDurationMs: Date.now() - startTime,
          message:
            "The uploaded photograph appears blurry or lacks sufficient focus. Please upload a clearer photograph of the road damage.",
          imageHash,
          verificationToken: token,
          isSubmissionAllowed: false,
          minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
        }
      }

      // Step 2: Scene relevance classification
      const scene = await this.classifyScene(imageBuffer)

      // Step 3: Run YOLOv8 defect detection
      const detections = await this.detectPotholes(imageBuffer)
      const duration = Date.now() - startTime

      // If scene classification indicates an unrelated object (fashion, dog, food)
      // AND YOLO found no high-confidence potholes:
      if (
        scene &&
        detections.length === 0 &&
        (scene.isAnimalOrOrganism ||
          scene.isUnrelatedManufactured ||
          scene.unrelatedScore > 0.16)
      ) {
        const token = this.generateVerificationToken({
          imageHash,
          status: "unrelated_image",
          highestConfidence: 0,
          detectedClasses: [],
          detectionsCount: 0,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
        })
        return {
          status: "unrelated_image",
          modelName: "MobileNetV4-SceneValidator",
          modelVersion: "v4.0-fp32",
          topPredictedClass: scene.topClass,
          unrelatedClass: scene.unrelatedLabel || scene.topClass,
          detectedClasses: [],
          detections: [],
          highestConfidence: 0,
          severity: "low",
          depthEstimateMm: null,
          depthNote: "Non-road photograph contains no asphalt defects.",
          inferenceDurationMs: duration,
          message:
            "This photograph does not appear to show road damage. Please upload a pothole or damaged road photograph.",
          imageHash,
          verificationToken: token,
          isSubmissionAllowed: false,
          minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
        }
      }

      // Step 4: Evaluate genuine detections
      if (detections.length > 0) {
        const topConfidence = Math.max(...detections.map((d) => d.confidence))
        const isApprovedConfidence = topConfidence >= MIN_DEFECT_CONFIDENCE_THRESHOLD
        const status: AIDetectionStatus = isApprovedConfidence ? "detected" : "low_confidence"

        const severity =
          topConfidence >= 0.7 ? "critical" : topConfidence >= 0.55 ? "high" : "moderate"

        // Generate genuine annotated image buffer
        let annotatedImageBase64: string | undefined
        try {
          const annotatedBuf = await this.generateAnnotatedImage(imageBuffer, detections)
          annotatedImageBase64 = `data:image/jpeg;base64,${annotatedBuf.toString("base64")}`
        } catch (annotErr: any) {
          logger.warn("Could not composite annotated image overlay", { error: annotErr?.message })
        }

        const message = isApprovedConfidence
          ? `Successfully identified ${detections.length} road cavity region${
              detections.length > 1 ? "s" : ""
            } with ${(topConfidence * 100).toFixed(0)}% genuine model confidence.`
          : `Road damage was detected, but the confidence score (${(topConfidence * 100).toFixed(
              0,
            )}%) is below the required ${(MIN_DEFECT_CONFIDENCE_THRESHOLD * 100).toFixed(
              0,
            )}% threshold. Please upload a clearer photograph.`

        const verificationToken = this.generateVerificationToken({
          imageHash,
          status,
          highestConfidence: topConfidence,
          detectedClasses: ["cavity"],
          detectionsCount: detections.length,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
        })

        this.analysisRegistry.set(imageHash, {
          imageHash,
          status,
          highestConfidence: topConfidence,
          detectedClasses: ["cavity"],
          detections,
          severity,
          timestamp: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000,
          isConsumed: false,
        })

        return {
          status,
          modelName: "YOLOv8n-Pothole-ONNX",
          modelVersion: "v8.0.21-rdd",
          detectedClasses: ["cavity"],
          detections,
          highestConfidence: topConfidence,
          severity,
          depthEstimateMm: null,
          depthNote:
            "Physical depth cannot be determined from 2D imagery. Requires on-site depth gauge measurement by municipal field crew.",
          annotatedImageBase64,
          inferenceDurationMs: duration,
          message,
          imageHash,
          verificationToken,
          isSubmissionAllowed: isApprovedConfidence,
          minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
        }
      }

      // Step 5: Road surface detected, but no confident pothole defects found
      const cleanRoadToken = this.generateVerificationToken({
        imageHash,
        status: "no_damage_found",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      this.analysisRegistry.set(imageHash, {
        imageHash,
        status: "no_damage_found",
        highestConfidence: 0,
        detectedClasses: [],
        detections: [],
        severity: "low",
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
        isConsumed: false,
      })

      return {
        status: "no_damage_found",
        modelName: "YOLOv8n-Pothole-ONNX",
        modelVersion: "v8.0.21-rdd",
        detectedClasses: [],
        detections: [],
        highestConfidence: 0,
        severity: "low",
        depthEstimateMm: null,
        depthNote: "No road damage detected for physical depth measurement.",
        inferenceDurationMs: duration,
        message:
          "Road damage could not be confidently identified in this photograph. Please retake the photo ensuring the defect is centered and clearly visible.",
        imageHash,
        verificationToken: cleanRoadToken,
        isSubmissionAllowed: false,
        minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
      }
    } catch (err: any) {
      logger.error("Error during AI road image inspection", { error: err?.message, stack: err?.stack })
      const errorToken = this.generateVerificationToken({
        imageHash,
        status: "ai_unavailable",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })
      return {
        status: "ai_unavailable",
        modelName: "RoadGuard-FallbackEngine",
        modelVersion: "v3.0",
        detectedClasses: [],
        detections: [],
        highestConfidence: 0,
        severity: "low",
        depthEstimateMm: null,
        depthNote: "Physical depth requires manual measurement.",
        inferenceDurationMs: Date.now() - startTime,
        message:
          "AI inspection service is temporarily unavailable. Please retry verification before submitting.",
        imageHash,
        verificationToken: errorToken,
        isSubmissionAllowed: false,
        minimumConfidenceRequired: MIN_DEFECT_CONFIDENCE_THRESHOLD,
      }
    } finally {
      this.activeInferences = Math.max(0, this.activeInferences - 1)
    }
  }
}

