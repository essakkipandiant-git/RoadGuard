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
  storageProvider: "cloudinary" | "local_storage"
  folder: string
  imageHash?: string
}

export type UploadCategory = "pothole-reports" | "repair-evidence" | "inspection-evidence"

export interface UploadOptions {
  folderCategory?: UploadCategory | string
  folder?: string
  tags?: string[]
  publicId?: string
}

export class ImageService {
  /**
   * Uploads an image buffer to Cloudinary if credentials exist,
   * organized into dedicated folders (roadguard/pothole-reports, repair-evidence, inspection-evidence).
   * Falls back gracefully to local disk storage if Cloudinary is not configured.
   */
  static async uploadImage(
    file: Express.Multer.File,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    if (!file || !file.buffer) {
      throw new BadRequestError("No image file provided for upload.")
    }

    const folderCategory = (options?.folderCategory || "pothole-reports") as string
    const targetFolder = options?.folder || `roadguard/${folderCategory}`
    const uniqueSuffix = crypto.randomUUID().slice(0, 10)
    const assetId = options?.publicId || `rg_${folderCategory.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}_${uniqueSuffix}`
    const imageHash = crypto.createHash("sha256").update(file.buffer).digest("hex")

    // 1. Cloudinary upload if configured
    if (isCloudinaryConfigured) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: targetFolder,
            public_id: assetId,
            tags: Array.from(new Set(["roadguard", folderCategory, ...(options?.tags || [])])),
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
              storageProvider: "cloudinary",
              folder: targetFolder,
              imageHash,
            })
          },
        )
        uploadStream.end(file.buffer)
      })
    }

    // 2. Safe Local Storage Fallback (offline dev & pilot testing)
    const uploadDir = path.resolve(env.UPLOAD_DIR, folderCategory)
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const extension = file.mimetype.split("/")[1] || "jpg"
    const fileName = `${assetId}.${extension}`
    const filePath = path.join(uploadDir, fileName)

    await fs.promises.writeFile(filePath, file.buffer)

    const publicId = `local_${assetId}`
    const imageUrl = `/uploads/${folderCategory}/${fileName}`

    return {
      imageUrl,
      publicId,
      format: extension,
      bytes: file.size,
      storageProvider: "local_storage",
      folder: targetFolder,
      imageHash,
    }
  }

  /**
   * Deletes an image from storage (Cloudinary or local file).
   */
  static async deleteFromStorage(publicId: string): Promise<void> {
    if (!publicId) return

    if (publicId.startsWith("local_")) {
      const uploadDir = path.resolve(env.UPLOAD_DIR)
      const cleanId = publicId.replace("local_", "")
      try {
        const findAndUnlink = (dir: string) => {
          if (!fs.existsSync(dir)) return
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              findAndUnlink(fullPath)
            } else if (entry.name.includes(cleanId)) {
              fs.unlinkSync(fullPath)
            }
          }
        }
        findAndUnlink(uploadDir)
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

    let folderCategory: UploadCategory = "pothole-reports"
    if (imageType === ImageType.REPAIR_AFTER) {
      folderCategory = "repair-evidence"
    } else if (imageType === ImageType.INSPECTION_EVIDENCE) {
      folderCategory = "inspection-evidence"
    }

    // Upload image into organized Cloudinary folder
    const uploadResult = await this.uploadImage(file, {
      folderCategory,
      folder: `roadguard/${folderCategory}`,
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

