import { Router } from "express"
import { UploadController } from "../controllers/uploadController"
import { requireAuth } from "../middleware/authMiddleware"
import { uploadSingleImage } from "../middleware/uploadMiddleware"
import { uploadLimiter } from "../middleware/rateLimiter"

export const uploadRouter = Router()

// All upload endpoints require an active authenticated session
uploadRouter.use(requireAuth)

/**
 * @route   POST /api/v1/uploads/image
 * @desc    Upload an image file (JPEG, PNG, WebP <10MB) to storage
 * @access  Authenticated
 */
uploadRouter.post(
  "/image",
  uploadLimiter,
  uploadSingleImage,
  UploadController.uploadImage,
)

