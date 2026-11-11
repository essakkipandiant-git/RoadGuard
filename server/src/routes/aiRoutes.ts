import { Router } from "express"
import { AiController } from "../controllers/aiController"
import { uploadSingleImage } from "../middleware/uploadMiddleware"
import { AiDetectionService } from "../services/aiDetectionService"

export const aiRouter = Router()

// Publicly available AI inspection endpoint for citizen reporting wizard
aiRouter.post("/inspect", uploadSingleImage, AiController.inspectImage)

// Subsystem health and model status
aiRouter.get("/status", async (_req, res) => {
  const status = AiDetectionService.getSubsystemStatus()
  res.status(200).json({
    success: true,
    data: status,
    message: `RoadGuard AI inference subsystem is ${status.status}`,
  })
})

aiRouter.get("/health", async (_req, res) => {
  const status = AiDetectionService.getSubsystemStatus()
  res.status(status.status === "operational" ? 200 : 503).json({
    success: status.status === "operational",
    data: status,
  })
})

