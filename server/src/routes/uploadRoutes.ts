import { Router } from "express"
import { UploadController } from "../controllers/uploadController"
import { requireAuth } from "../middleware/authMiddleware"
import { uploadSingleImage } from "../middleware/uploadMiddleware"
import { uploadLimiter } from "../middleware/rateLimiter"

export const uploadRouter = Router()

/**
 * @route   GET /api/v1/uploads/status
 * @desc    Get image storage status (Cloudinary vs local disk fallback)
 * @access  Public
 */
uploadRouter.get("/status", UploadController.getStorageStatus)

/**
 * @route   POST /api/v1/uploads/image
 * @desc    Upload an image file (JPEG, PNG, WebP <10MB) to storage (Cloudinary / Local)
 * @access  Authenticated
 */
uploadRouter.post(
  "/image",
  requireAuth,
  uploadLimiter,
  uploadSingleImage,
  UploadController.uploadImage,
)



