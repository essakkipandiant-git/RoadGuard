import { Request, Response, NextFunction } from "express"
import { ImageService } from "../services/imageService"
import { BadRequestError, ForbiddenError } from "../utils/errors"
import { ImageType, Role } from "@prisma/client"
import { getCloudinaryStatus } from "../config/cloudinary"

export class UploadController {
  /**
   * GET /api/v1/uploads/status
   * Reports current storage engine status (Cloudinary vs Local disk fallback).
   */
  static async getStorageStatus(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const status = getCloudinaryStatus()
      res.status(200).json({
        success: true,
        data: status,
        message: status.message,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/uploads/image
   * Standalone image upload (returns secure URL, publicId, and folder info).
   * Supports category routing: pothole-reports, repair-evidence, inspection-evidence.
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

      const category = (req.body?.category || req.query?.category || "pothole-reports") as string
      const folderCategory = ["pothole-reports", "repair-evidence", "inspection-evidence"].includes(category)
        ? category
        : "pothole-reports"

      // Staff-only check for official repair and inspection evidence
      if (
        (folderCategory === "repair-evidence" || folderCategory === "inspection-evidence") &&
        (!req.user || req.user.role === Role.CITIZEN)
      ) {
        throw new ForbiddenError("Only municipal department staff and field inspectors can upload repair/inspection verification evidence.")
      }

      const result = await ImageService.uploadImage(req.file, { folderCategory })
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


