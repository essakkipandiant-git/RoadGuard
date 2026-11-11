import { Request, Response, NextFunction } from "express"
import { AiDetectionService } from "../services/aiDetectionService"
import { BadRequestError } from "../utils/errors"
import { validateImageMagicBytes } from "../middleware/uploadMiddleware"

export class AiController {
  /**
   * POST /api/v1/ai/inspect
   * Runs genuine computer vision analysis on uploaded road photographs.
   */
  public static async inspectImage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      let imageBuffer: Buffer | null = null

      if (req.file?.buffer) {
        imageBuffer = req.file.buffer
      } else if (req.body?.image && typeof req.body.image === "string") {
        const raw = req.body.image
        if (raw.startsWith("data:")) {
          const base64Data = raw.split(",")[1]
          imageBuffer = Buffer.from(base64Data, "base64")
        } else {
          throw new BadRequestError("Invalid image format. Provide a file upload or base64 data URL.")
        }
      }

      if (!imageBuffer) {
        throw new BadRequestError("Please upload or provide a photograph to inspect.")
      }

      // Magic byte format validation
      const formatCheck = validateImageMagicBytes(imageBuffer)
      if (!formatCheck.isValid) {
        throw new BadRequestError("Corrupted or unsupported image file. Only genuine JPEG, PNG, and WebP images are permitted.")
      }

      const result = await AiDetectionService.inspectRoadPhotograph(imageBuffer)

      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      })
    } catch (error) {
      next(error)
    }
  }
}
