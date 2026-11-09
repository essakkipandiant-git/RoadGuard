import { Request, Response, NextFunction } from "express"
import { ImageService } from "../services/imageService"
import { BadRequestError } from "../utils/errors"
import { ImageType } from "@prisma/client"

export class UploadController {
  /**
   * POST /api/v1/uploads/image
   * Standalone image upload (returns secure URL and publicId).
   */
  static async uploadImage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.file) {
        throw new BadRequestError("Please select an image file to upload.")
      }

      const result = await ImageService.uploadImage(req.file)
      res.status(201).json({
        success: true,
        data: result,
        message: "Image uploaded successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/issues/:id/images
   * Uploads and attaches an image directly to a road issue report.
   */
  static async attachIssueImage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.file) {
        throw new BadRequestError("Please select an image file to upload.")
      }

      const issueId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const imageType = (req.body.imageType as ImageType) || ImageType.ORIGINAL_REPORT

      const image = await ImageService.attachImageToIssue(
        issueId,
        req.file,
        imageType,
        req.user!,
      )

      res.status(201).json({
        success: true,
        data: {
          image,
        },
        message: "Image attached to road issue report successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * DELETE /api/v1/issues/:id/images/:imageId
   * Removes an image from a road issue and deletes it from storage.
   */
  static async removeIssueImage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const issueId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId

      const result = await ImageService.removeImageFromIssue(
        issueId,
        imageId,
        req.user!,
      )

      res.status(200).json({
        success: true,
        message: result.message,
      })
    } catch (error) {
      next(error)
    }
  }
}

