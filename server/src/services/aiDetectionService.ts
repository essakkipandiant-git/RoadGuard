import fs from "fs"
import path from "path"
import sharp from "sharp"
import { logger } from "../utils/logger"

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
  | "no_damage_found"
  | "unrelated_image"
  | "blurry_image"
  | "underexposed"
  | "ai_unavailable"

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
}

/**
 * Resolves a model path across multiple possible project root configurations.
 */
function resolveModelFile(fileName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), "models", fileName),
    path.resolve(process.cwd(), "server/models", fileName),
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

    const { data } = await sharp(imageBuffer)
      .resize(640, 640, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const float32Data = new Float32Array(3 * 640 * 640)
    const channelSize = 640 * 640

    for (let i = 0; i < channelSize; i++) {
      float32Data[i] = data[i * 3] / 255.0
      float32Data[channelSize + i] = data[i * 3 + 1] / 255.0
      float32Data[channelSize * 2 + i] = data[i * 3 + 2] / 255.0
    }

    const tensor = new ort.Tensor("float32", float32Data, [1, 3, 640, 640])
    const results = await this.yoloSession.run({ images: tensor })
    const outData = results["output0"].data as Float32Array
    const numAnchors = results["output0"].dims[2]

    const candidateDetections: Array<{
      score: number
      x1: number
      y1: number
      x2: number
      y2: number
      w: number
      h: number
    }> = []

    // Calibrated genuine pothole confidence threshold
    const confThreshold = 0.52

    for (let a = 0; a < numAnchors; a++) {
      const cx = outData[0 * numAnchors + a]
      const cy = outData[1 * numAnchors + a]
      const w = outData[2 * numAnchors + a]
      const h = outData[3 * numAnchors + a]
      const score = outData[4 * numAnchors + a]

      if (score >= confThreshold) {
        candidateDetections.push({
          score: Number(score.toFixed(4)),
          x1: Math.max(0, cx - w / 2),
          y1: Math.max(0, cy - h / 2),
          x2: Math.min(640, cx + w / 2),
          y2: Math.min(640, cy + h / 2),
          w,
          h,
        })
      }
    }

    // Sort descending by model confidence
    candidateDetections.sort((a, b) => b.score - a.score)

    // Non-Maximum Suppression (IoU 0.45)
    const finalBoxes: DetectionBoxResult[] = []

    function calculateIoU(
      b1: (typeof candidateDetections)[0],
      b2: (typeof candidateDetections)[0],
    ): number {
      const xx1 = Math.max(b1.x1, b2.x1)
      const yy1 = Math.max(b1.y1, b2.y1)
      const xx2 = Math.min(b1.x2, b2.x2)
      const yy2 = Math.min(b1.y2, b2.y2)
      const w = Math.max(0, xx2 - xx1)
      const h = Math.max(0, yy2 - yy1)
      const inter = w * h
      const a1 = (b1.x2 - b1.x1) * (b1.y2 - b1.y1)
      const a2 = (b2.x2 - b2.x1) * (b2.y2 - b2.y1)
      return inter / (a1 + a2 - inter)
    }

    for (const det of candidateDetections) {
      let keep = true
      for (const fb of finalBoxes) {
        // Map back to 640 coordinate frame for accurate IoU
        const fbDet = {
          x1: (fb.x / 100) * 640,
          y1: (fb.y / 100) * 640,
          x2: ((fb.x + fb.width) / 100) * 640,
          y2: ((fb.y + fb.height) / 100) * 640,
          w: (fb.width / 100) * 640,
          h: (fb.height / 100) * 640,
          score: fb.confidence,
        }
        if (calculateIoU(det, fbDet) > 0.45) {
          keep = false
          break
        }
      }

      if (keep) {
        finalBoxes.push({
          id: `det-${finalBoxes.length + 1}`,
          category: "cavity",
          confidence: det.score,
          x: Number(((det.x1 / 640) * 100).toFixed(1)),
          y: Number(((det.y1 / 640) * 100).toFixed(1)),
          width: Number(((det.w / 640) * 100).toFixed(1)),
          height: Number(((det.h / 640) * 100).toFixed(1)),
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

    try {
      const initialized = await this.initialize()
      if (!initialized) {
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
            "AI inspection service is not configured or currently offline. You may proceed with manual road damage classification for municipal review.",
        }
      }

      // Step 1: Exposure and sharpness quality checks
      const quality = await this.computeQualityMetrics(imageBuffer)

      if (quality.meanLuminance < 16 && quality.maxLuminance < 40) {
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
        }
      }

      if (quality.laplacianVariance < 18) {
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
            "This image does not appear to show road damage. Please upload a photograph of a pothole, road crack or damaged road surface.",
        }
      }

      // Step 4: Evaluate genuine detections
      if (detections.length > 0) {
        const topConfidence = Math.max(...detections.map((d) => d.confidence))
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

        return {
          status: "detected",
          modelName: "YOLOv8n-Pothole-ONNX",
          modelVersion: "v8.0.21-rdd",
          detectedClasses: ["cavity"],
          detections,
          highestConfidence: topConfidence,
          severity,
          depthEstimateMm: null, // Monocular 2D images cannot determine physical depth
          depthNote:
            "Physical depth cannot be determined from 2D imagery. Requires on-site depth gauge measurement by municipal field crew.",
          annotatedImageBase64,
          inferenceDurationMs: duration,
          message: `Successfully identified ${detections.length} road cavity region${
            detections.length > 1 ? "s" : ""
          } via genuine model inference.`,
        }
      }

      // Step 5: Road surface detected, but no confident pothole defects found
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
          "Road damage could not be confidently identified by the AI model. Please review the image or continue with manual verification if permitted.",
      }
    } catch (err: any) {
      logger.error("Error during AI road image inspection", { error: err?.message, stack: err?.stack })
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
          "AI inspection service is not configured or currently offline. You may proceed with manual road damage classification for municipal review.",
      }
    }
  }
}
