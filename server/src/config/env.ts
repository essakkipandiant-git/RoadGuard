import dotenv from "dotenv"
import path from "path"
import { z } from "zod"

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") })

const envSchema = z.object({
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val < 65536, {
      message: "PORT must be a valid port number between 1 and 65535",
    }),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .default("file:./roadguard.db"),
  JWT_SECRET: z
    .string()
    .min(32, { message: "JWT_SECRET must be at least 32 characters long" })
    .default("roadguard-development-jwt-super-secret-key-32chars"),
  JWT_EXPIRES_IN: z
    .string()
    .default("7d"),
  FRONTEND_URL: z
    .string()
    .url({ message: "FRONTEND_URL must be a valid URL" })
    .default("http://localhost:8443"),
  CORS_ORIGINS: z.string().optional().default(""),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  CLOUDINARY_FOLDER: z.string().default("roadguard"),
  UPLOAD_DIR: z.string().default("./uploads"),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    console.error("❌ Invalid environment variables:")
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join(".")}: ${issue.message}`)
    })
    process.exit(1)
  }

  return result.data
}

export const env = validateEnv()
