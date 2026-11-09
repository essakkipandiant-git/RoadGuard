import fs from "fs"
import path from "path"
import crypto from "crypto"
import { cloudinary, isCloudinaryConfigured } from "../config/cloudinary"
import { env } from "../config/env"
import { prisma } from "../config/prisma"
import { ImageType, IssueImage, Role } from "@prisma/client"
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors"
import { AuthUser } from "../types"
import { isStaffRole } from "../middleware/roleMiddleware"

export interface UploadResult {
  imageUrl: string
  publicId: string
  format?: string
  bytes: number
  width?: number
  height?: number
}

export class ImageService {
  /**
   * Uploads an image buffer to Cloudinary if credentials exist,
   * or falls back to local disk storage during development/testing.
   */
  static async uploadImage(
    file: Express.Multer.File,
    options?: { folder?: string; tags?: string[] },
  ): Promise<UploadResult> {
    if (!file || !file.buffer) {
      throw new BadRequestError("No image file provided for upload.")
    }

    // 1. Cloudinary upload if configured
    if (isCloudinaryConfigured) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options?.folder || env.CLOUDINARY_FOLDER,
            tags: options?.tags,
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) {
              return reject(
                new BadRequestError(
                  `Cloudinary upload failed: ${error?.message || "Unknown error"}`,
                ),
              )
            }
            resolve({
              imageUrl: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              bytes: result.bytes,
              width: result.width,
              height: result.height,
            })
          },
        )
        uploadStream.end(file.buffer)
      })
    }

    // 2. Safe Local Storage Fallback (offline dev & pilot testing)
    const uploadDir = path.resolve(env.UPLOAD_DIR)
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const extension = file.mimetype.split("/")[1] || "jpg"
    const uniqueId = crypto.randomUUID()
    const fileName = `img_${Date.now()}_${uniqueId}.${extension}`
    const filePath = path.join(uploadDir, fileName)

    await fs.promises.writeFile(filePath, file.buffer)

    const publicId = `local_${uniqueId}`
    const imageUrl = `/uploads/${fileName}`

    return {
      imageUrl,
      publicId,
      format: extension,
      bytes: file.size,
    }
  }

  /**
   * Deletes an image from storage (Cloudinary or local file).
   */
  static async deleteFromStorage(publicId: string): Promise<void> {
    if (!publicId) return

    if (publicId.startsWith("local_")) {
      const uploadDir = path.resolve(env.UPLOAD_DIR)
      try {
        const files = await fs.promises.readdir(uploadDir)
        const match = files.find((f) => f.includes(publicId.replace("local_", "")))
        if (match) {
          await fs.promises.unlink(path.join(uploadDir, match))
        }
      } catch {}
      return
    }

    if (isCloudinaryConfigured) {
      try {
        await cloudinary.uploader.destroy(publicId)
      } catch {}
    }
  }

  /**
   * Attaches an uploaded image to a specific road issue.
   */
  static async attachImageToIssue(
    issueId: string,
    file: Express.Multer.File,
    imageType: ImageType = ImageType.ORIGINAL_REPORT,
    user: AuthUser,
  ): Promise<IssueImage> {
    const issue = await prisma.roadIssue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueId}' was not found.`)
    }

    // If citizen, verify ownership
    if (user.role === Role.CITIZEN && issue.reportedById !== user.id) {
      throw new ForbiddenError("You cannot attach images to another citizen's report.")
    }

    // Upload image
    const uploadResult = await this.uploadImage(file, {
      folder: `${env.CLOUDINARY_FOLDER}/issues/${issue.reportNumber}`,
      tags: [issue.reportNumber, imageType],
    })

    // Persist IssueImage entity
    const issueImage = await prisma.issueImage.create({
      data: {
        issueId: issue.id,
        imageUrl: uploadResult.imageUrl,
        publicId: uploadResult.publicId,
        imageType,
      },
    })

    return issueImage
  }

  /**
   * Removes an image from a road issue and deletes it from storage.
   */
  static async removeImageFromIssue(
    issueId: string,
    imageId: string,
    user: AuthUser,
  ): Promise<{ message: string }> {
    const image = await prisma.issueImage.findFirst({
      where: {
        id: imageId,
        issueId,
      },
      include: {
        issue: true,
      },
    })

    if (!image) {
      throw new NotFoundError("Image was not found on this road issue.")
    }

    // Verify permissions: Staff or issue owner
    if (user.role === Role.CITIZEN && image.issue.reportedById !== user.id) {
      throw new ForbiddenError("You are not authorized to delete this image.")
    }

    // Delete from Cloudinary or local storage
    if (image.publicId) {
      await this.deleteFromStorage(image.publicId)
    }

    // Remove from database
    await prisma.issueImage.delete({
      where: { id: imageId },
    })

    return { message: "Image successfully deleted." }
  }
}

