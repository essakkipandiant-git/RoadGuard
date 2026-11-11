import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  validateImageFile,
  inspectRoadImage,
  MAX_FILE_SIZE_BYTES,
} from "../services/aiInspectionService"
import { apiClient } from "../services/apiClient"

describe("Frontend AI Inspection Service & Validation Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("validateImageFile accepts valid JPEG, PNG, and WebP files under 10MB", () => {
    const validJpeg = new File(["fake-content"], "pothole.jpg", { type: "image/jpeg" })
    expect(validateImageFile(validJpeg).isValid).toBe(true)

    const validPng = new File(["fake-content"], "defect.png", { type: "image/png" })
    expect(validateImageFile(validPng).isValid).toBe(true)

    const validWebp = new File(["fake-content"], "street.webp", { type: "image/webp" })
    expect(validateImageFile(validWebp).isValid).toBe(true)
  })

  it("validateImageFile rejects files exceeding 10MB limit", () => {
    const oversizedBuffer = new Uint8Array(MAX_FILE_SIZE_BYTES + 1024)
    const oversizedFile = new File([oversizedBuffer], "large_damage.jpg", { type: "image/jpeg" })
    const result = validateImageFile(oversizedFile)

    expect(result.isValid).toBe(false)
    expect(result.error).toContain("exceeds the maximum allowed limit of 10MB")
  })

  it("validateImageFile rejects non-image formats like PDF or TXT", () => {
    const pdfFile = new File(["fake-pdf"], "document.pdf", { type: "application/pdf" })
    const result = validateImageFile(pdfFile)

    expect(result.isValid).toBe(false)
    expect(result.error).toContain("Unsupported file format")
  })

  it("inspectRoadImage maps genuine server-side YOLOv8 detections with null depth", async () => {
    vi.spyOn(apiClient.ai, "inspectImage").mockResolvedValueOnce({
      status: "detected",
      modelName: "YOLOv8n-Pothole-ONNX",
      modelVersion: "v8.0.21-rdd",
      detectedClasses: ["cavity"],
      detections: [
        {
          id: "det-1",
          category: "cavity",
          confidence: 0.591,
          x: 25,
          y: 30,
          width: 40,
          height: 35,
          label: "POTHOLE 59%",
        },
      ],
      highestConfidence: 0.591,
      severity: "high",
      depthEstimateMm: null,
      depthNote: "Physical depth cannot be determined from 2D imagery.",
      annotatedImageBase64: "data:image/jpeg;base64,fake-annotated",
      inferenceDurationMs: 65,
      message: "Successfully identified 1 road cavity region.",
    })

    const testFile = new File(["dummy"], "pothole.jpg", { type: "image/jpeg" })
    const result = await inspectRoadImage(testFile)

    expect(result.status).toBe("detected")
    expect(result.engine).toBe("yolov8_onnx")
    expect(result.category).toBe("cavity")
    expect(result.confidence).toBe(0.591)
    expect(result.boxes).toHaveLength(1)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.depthNote).toContain("Physical depth cannot be determined from 2D imagery")
    expect(result.annotatedImageUrl).toBe("data:image/jpeg;base64,fake-annotated")
  })

  it("inspectRoadImage returns unrelated_image status when non-road photo is classified", async () => {
    vi.spyOn(apiClient.ai, "inspectImage").mockResolvedValueOnce({
      status: "unrelated_image",
      modelName: "MobileNetV4-SceneValidator",
      modelVersion: "v4.0-fp32",
      detectedClasses: [],
      detections: [],
      highestConfidence: 0,
      severity: "low",
      depthEstimateMm: null,
      depthNote: "Non-road photograph contains no asphalt defects.",
      topPredictedClass: "trench coat",
      unrelatedClass: "trench coat",
      inferenceDurationMs: 45,
      message: "This image does not appear to show road damage.",
    })

    const testFile = new File(["dummy"], "fashion.jpg", { type: "image/jpeg" })
    const result = await inspectRoadImage(testFile)

    expect(result.status).toBe("unrelated_image")
    expect(result.boxes).toHaveLength(0)
    expect(result.confidence).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.topPredictedClass).toBe("trench coat")
    expect(result.message).toContain("does not appear to show road damage")
  })

  it("inspectRoadImage returns ai_unavailable cleanly when backend is offline without fabricating data", async () => {
    vi.spyOn(apiClient.ai, "inspectImage").mockRejectedValueOnce(
      new Error("Network connection refused to Railway backend"),
    )

    const testFile = new File(["dummy"], "pothole.jpg", { type: "image/jpeg" })
    const result = await inspectRoadImage(testFile)

    expect(result.status).toBe("ai_unavailable")
    expect(result.boxes).toEqual([])
    expect(result.confidence).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("AI inspection service is temporarily offline")
  })
})
