import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import path from "path"
import fs from "fs"
import sharp from "sharp"
import { app } from "../src/app"
import { AiDetectionService } from "../src/services/aiDetectionService"

function getTestAssetPath(rel: string): string {
  const candidates = [
    path.resolve(rel),
    path.resolve("..", rel),
    path.resolve(__dirname, "../../", rel),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`Test asset not found: ${rel} (checked: ${candidates.join(", ")})`)
}

describe("AI Detection Pipeline & Genuine Computer Vision Tests", () => {
  beforeAll(async () => {
    await AiDetectionService.initialize()
  })

  it("Scenario 1: Genuine Pothole Image detects asphalt cavities with real YOLOv8 confidence and null depth", async () => {
    const potholePath = getTestAssetPath("public/images/detection_asphalt.jpg")
    const buffer = fs.readFileSync(potholePath)
    const result = await AiDetectionService.inspectRoadPhotograph(buffer)

    expect(result.status).toBe("detected")
    expect(result.modelName).toBe("YOLOv8n-Pothole-ONNX")
    expect(result.modelVersion).toBe("v8.0.21-rdd")
    expect(result.detections.length).toBeGreaterThan(0)
    expect(result.highestConfidence).toBeGreaterThan(0.5)
    // Physical depth MUST be null on 2D monocular images
    expect(result.depthEstimateMm).toBeNull()
    expect(result.depthNote).toContain("Physical depth cannot be determined from 2D imagery")
    expect(result.annotatedImageBase64).toBeDefined()
    expect(result.annotatedImageBase64).toContain("data:image/jpeg;base64,")

    const firstBox = result.detections[0]
    expect(firstBox.category).toBe("cavity")
    expect(firstBox.x).toBeGreaterThanOrEqual(0)
    expect(firstBox.x).toBeLessThanOrEqual(100)
    expect(firstBox.width).toBeGreaterThan(0)
  })

  it("Scenario 2: Clean Repaired Road Surface returns no_damage_found without fabricated telemetry", async () => {
    const cleanRoadPath = getTestAssetPath("public/images/repaired_road.jpg")
    const buffer = fs.readFileSync(cleanRoadPath)
    const result = await AiDetectionService.inspectRoadPhotograph(buffer)

    expect(result.status).toBe("no_damage_found")
    expect(result.detections.length).toBe(0)
    expect(result.highestConfidence).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("Road damage could not be confidently identified")
  })

  it("Scenario 3: Underexposed / Pitch Black Photograph is rejected with underexposed guidance", async () => {
    const darkBuffer = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .jpeg()
      .toBuffer()

    const result = await AiDetectionService.inspectRoadPhotograph(darkBuffer)

    expect(result.status).toBe("underexposed")
    expect(result.detections.length).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("photograph is underexposed or too dark")
  })

  it("Scenario 4: Blurry / Flat Photograph is rejected with blur guidance", async () => {
    const flatBuffer = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 180, g: 180, b: 180 } },
    })
      .jpeg()
      .toBuffer()

    const result = await AiDetectionService.inspectRoadPhotograph(flatBuffer)

    expect(result.status).toBe("blurry_image")
    expect(result.detections.length).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("photograph appears blurry or lacks sufficient focus")
  })

  it("Scenario 5: Unrelated Fashion Photograph is rejected via scene classification", async () => {
    const fashionPath = getTestAssetPath("scratch/fashion_sample.jpg")
    const buffer = fs.readFileSync(fashionPath)
    const result = await AiDetectionService.inspectRoadPhotograph(buffer)

    expect(result.status).toBe("unrelated_image")
    expect(result.detections.length).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("does not appear to show road damage")
    expect(result.unrelatedClass).toBeDefined()
  })

  it("Scenario 6: Animal Photograph (Dog) is rejected via scene classification", async () => {
    const dogPath = getTestAssetPath("scratch/dog_sample.jpg")
    const buffer = fs.readFileSync(dogPath)
    const result = await AiDetectionService.inspectRoadPhotograph(buffer)

    expect(result.status).toBe("unrelated_image")
    expect(result.detections.length).toBe(0)
    expect(result.depthEstimateMm).toBeNull()
    expect(result.message).toContain("does not appear to show road damage")
  })

  it("Scenario 7: Corrupted or non-image buffer fails magic byte check", async () => {
    const corruptBuffer = Buffer.from("THIS IS NOT A VALID JPEG OR PNG FILE HEADER BYTES")
    const res = await request(app)
      .post("/api/v1/ai/inspect")
      .attach("photo", corruptBuffer, "fake.jpg")

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toMatch(/corrupted|unsupported|authentic/i)
  })

  it("Scenario 8: HTTP POST /api/v1/ai/inspect endpoint accepts multipart road photograph upload", async () => {
    const potholePath = getTestAssetPath("public/images/detection_asphalt.jpg")
    const res = await request(app)
      .post("/api/v1/ai/inspect")
      .attach("photo", potholePath)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.status).toBe("detected")
    expect(res.body.data.highestConfidence).toBeGreaterThan(0.5)
    expect(res.body.data.depthEstimateMm).toBeNull()
    expect(res.body.data.detections.length).toBeGreaterThan(0)
  })

  it("Scenario 9: HTTP POST /api/v1/ai/inspect endpoint rejects unrelated fashion photo", async () => {
    const fashionPath = getTestAssetPath("scratch/fashion_sample.jpg")
    const res = await request(app)
      .post("/api/v1/ai/inspect")
      .attach("photo", fashionPath)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("unrelated_image")
    expect(res.body.data.message).toContain("does not appear to show road damage")
    expect(res.body.data.detections).toEqual([])
  })

  it("Scenario 10: Server-side annotated image overlay generates crisp JPEG buffer", async () => {
    const potholePath = getTestAssetPath("public/images/detection_asphalt.jpg")
    const buffer = fs.readFileSync(potholePath)

    const detections = [
      {
        id: "det-1",
        category: "cavity" as const,
        confidence: 0.88,
        x: 20,
        y: 25,
        width: 35,
        height: 30,
        label: "POTHOLE 88%",
      },
    ]

    const annotatedBuf = await AiDetectionService.generateAnnotatedImage(buffer, detections)
    expect(annotatedBuf).toBeInstanceOf(Buffer)
    expect(annotatedBuf.length).toBeGreaterThan(1000)

    const meta = await sharp(annotatedBuf).metadata()
    expect(meta.format).toBe("jpeg")
    expect(meta.width).toBeGreaterThan(0)
  })
})
