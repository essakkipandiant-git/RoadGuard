import { Router } from "express"
import { AiController } from "../controllers/aiController"
import { uploadSingleImage } from "../middleware/uploadMiddleware"

export const aiRouter = Router()

// Publicly available AI inspection endpoint for citizen reporting wizard
aiRouter.post("/inspect", uploadSingleImage, AiController.inspectImage)

aiRouter.get("/status", async (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      model: "YOLOv8n-Pothole-ONNX",
      validator: "MobileNetV4-SceneValidator",
      status: "operational",
    },
  })
})
