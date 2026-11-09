import multer from "multer"
import { Request, Response, NextFunction } from "express"
import { BadRequestError } from "../utils/errors"

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
]

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

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

    next()
  })
}

