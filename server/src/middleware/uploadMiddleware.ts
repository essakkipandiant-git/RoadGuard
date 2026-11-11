import multer from "multer"
import { Request, Response, NextFunction } from "express"
import { BadRequestError } from "../utils/errors"

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
]

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Inspects binary buffer magic bytes to ensure file is genuinely a JPEG, PNG, or WebP image.
 */
export function validateImageMagicBytes(buffer: Buffer): {
  isValid: boolean
  detectedFormat?: "jpeg" | "png" | "webp"
} {
  if (!buffer || buffer.length < 12) {
    return { isValid: false }
  }

  // JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { isValid: true, detectedFormat: "jpeg" }
  }

  // PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, detectedFormat: "png" }
  }

  // WebP: RIFF at bytes 0-3 and WEBP at bytes 8-11
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
  const isWebp =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  if (isRiff && isWebp) {
    return { isValid: true, detectedFormat: "webp" }
  }

  return { isValid: false }
}

const storage = multer.memoryStorage()

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      new BadRequestError(
        `Invalid file type '${file.mimetype}'. Only JPEG, PNG, and WebP images are allowed.`,
      ),
    )
  }
}

const multerInstance = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter,
})

/**
 * Middleware handling single image upload on either 'photo', 'image', or 'file' form fields.
 */
export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  const uploadHandler = multerInstance.fields([
    { name: "image", maxCount: 1 },
    { name: "photo", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ])

  uploadHandler(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new BadRequestError(
              `Uploaded image exceeds maximum permitted size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
            ),
          )
        }
        return next(new BadRequestError(`Image upload error: ${err.message}`))
      }
      return next(err)
    }

    // Normalize attached file to req.file
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    if (files) {
      const uploadedFile =
        (files["image"] && files["image"][0]) ||
        (files["photo"] && files["photo"][0]) ||
        (files["file"] && files["file"][0])
      if (uploadedFile) {
        req.file = uploadedFile
      }
    }

    if (req.file && req.file.buffer) {
      if (req.file.buffer.length === 0) {
        return next(new BadRequestError("Uploaded file is empty."))
      }

      const magicCheck = validateImageMagicBytes(req.file.buffer)
      if (!magicCheck.isValid) {
        return next(
          new BadRequestError(
            "Invalid or corrupted image content. File must be an authentic JPEG, PNG, or WebP image.",
          ),
        )
      }
    }

    next()
  })
}

