import { describe, expect, it } from "vitest"
import {
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_MIME_TYPES,
  validateImageFile,
} from "../services/aiInspectionService"

describe("AI Road Inspector File Validation", () => {
  it("approves valid image formats (JPEG, PNG, WEBP)", () => {
    const validJpg = new File(["test-content"], "road.jpg", {
      type: "image/jpeg",
    })
    const validPng = new File(["test-content"], "pothole.png", {
      type: "image/png",
    })
    const validWebp = new File(["test-content"], "crack.webp", {
      type: "image/webp",
    })

    expect(validateImageFile(validJpg).isValid).toBe(true)
    expect(validateImageFile(validPng).isValid).toBe(true)
    expect(validateImageFile(validWebp).isValid).toBe(true)
  })

  it("rejects unsupported file formats (.pdf, .txt, .exe)", () => {
    const invalidDoc = new File(["document"], "report.pdf", {
      type: "application/pdf",
    })
    const invalidTxt = new File(["text"], "notes.txt", { type: "text/plain" })

    const resPdf = validateImageFile(invalidDoc)
    expect(resPdf.isValid).toBe(false)
    expect(resPdf.error).toContain("Unsupported file format")

    const resTxt = validateImageFile(invalidTxt)
    expect(resTxt.isValid).toBe(false)
  })

  it("rejects files exceeding size limit (>10MB)", () => {
    // Create mock file with large size
    const largeFile = new File(["dummy"], "huge_image.jpg", {
      type: "image/jpeg",
    })
    Object.defineProperty(largeFile, "size", {
      value: MAX_FILE_SIZE_BYTES + 1024,
    })

    const res = validateImageFile(largeFile)
    expect(res.isValid).toBe(false)
    expect(res.error).toContain("exceeds the maximum allowed limit of 10MB")
  })
})
