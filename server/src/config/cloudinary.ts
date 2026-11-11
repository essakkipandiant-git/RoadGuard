import { v2 as cloudinary } from "cloudinary"
import { env } from "./env"
import { logger } from "../utils/logger"

export const isCloudinaryConfigured = Boolean(
  (env.CLOUDINARY_CLOUD_NAME || "xkvdkmry") &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
)

export const cloudName = env.CLOUDINARY_CLOUD_NAME || "xkvdkmry"

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  logger.info(`☁️ Cloudinary integration active for cloud '${cloudName}'`)
} else {
  logger.info("📁 Cloudinary credentials not detected in environment; using local storage adapter")
}

export function getCloudinaryStatus() {
  return {
    isConfigured: isCloudinaryConfigured,
    cloudName: cloudName,
    storageProvider: isCloudinaryConfigured ? "cloudinary" : "local_storage",
    message: isCloudinaryConfigured
      ? `Cloudinary storage is active on cloud '${cloudName}'.`
      : "Cloudinary credentials not detected; local storage adapter active.",
  }
}

export { cloudinary }

