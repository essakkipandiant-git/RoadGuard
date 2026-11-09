import { Router } from "express"
import { GeoController } from "../controllers/geoController"

const router = Router()

/**
 * Public routes for geographic boundary query and location validation.
 */
router.get("/mumbai-boundary", GeoController.getMumbaiBoundary)
router.post("/validate-location", GeoController.validateLocation)

export default router

