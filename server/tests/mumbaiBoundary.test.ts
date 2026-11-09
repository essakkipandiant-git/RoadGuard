import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { MumbaiBoundaryService, MUMBAI_BBOX } from "../src/services/mumbaiBoundaryService"
import { DamageCategory, DamageSeverity } from "@prisma/client"

describe("Phase C: Mumbai Geospatial Boundary Validation Engine Tests", () => {
  let citizenToken: string
  let testIssueIds: string[] = []

  beforeAll(async () => {
    // 1. Synchronize boundary to database
    await MumbaiBoundaryService.syncBoundaryToDatabase()

    // 2. Authenticate test citizen
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
  })

  afterAll(async () => {
    if (testIssueIds.length > 0) {
      await prisma.roadIssue.deleteMany({
        where: { id: { in: testIssueIds } },
      }).catch(() => {})
    }
  })

  // -------------------------------------------------------------
  // 1. Authoritative Point-in-Polygon Tests
  // -------------------------------------------------------------
  describe("1. Authoritative Point-in-Polygon Validation", () => {
    it("TC-C01: Validates confirmed locations inside Greater Mumbai (Island City & Suburbs)", () => {
      // Marine Drive (South Mumbai / Island City)
      const marineDrive = MumbaiBoundaryService.validateCoordinates(18.9438, 72.8232)
      expect(marineDrive.isValidCoordinate).toBe(true)
      expect(marineDrive.isInsideMumbai).toBe(true)
      expect(marineDrive.wardName).toBeDefined()

      // Shivaji Park, Dadar West (Central Island City)
      const dadar = MumbaiBoundaryService.validateCoordinates(19.0269, 72.8378)
      expect(dadar.isValidCoordinate).toBe(true)
      expect(dadar.isInsideMumbai).toBe(true)
      expect(dadar.wardName).toBe("G/N")

      // Bandstand, Bandra West (Western Suburbs)
      const bandra = MumbaiBoundaryService.validateCoordinates(19.0544, 72.8267)
      expect(bandra.isValidCoordinate).toBe(true)
      expect(bandra.isInsideMumbai).toBe(true)
      expect(bandra.wardName).toBe("H/W")

      // Lokhandwala, Andheri West (Western Suburbs)
      const andheri = MumbaiBoundaryService.validateCoordinates(19.1419, 72.8317)
      expect(andheri.isValidCoordinate).toBe(true)
      expect(andheri.isInsideMumbai).toBe(true)
      expect(andheri.wardName).toBe("K/W")

      // Gorai / Borivali West (Northern Suburbs)
      const borivali = MumbaiBoundaryService.validateCoordinates(19.2307, 72.8567)
      expect(borivali.isValidCoordinate).toBe(true)
      expect(borivali.isInsideMumbai).toBe(true)
      expect(borivali.wardName).toBe("R/C")

      // Chembur (Eastern Suburbs)
      const chembur = MumbaiBoundaryService.validateCoordinates(19.0522, 72.9005)
      expect(chembur.isValidCoordinate).toBe(true)
      expect(chembur.isInsideMumbai).toBe(true)
      expect(chembur.wardName).toBe("M/W")

      // Mulund West (Northeastern Suburbs)
      const mulund = MumbaiBoundaryService.validateCoordinates(19.1726, 72.9425)
      expect(mulund.isValidCoordinate).toBe(true)
      expect(mulund.isInsideMumbai).toBe(true)
      expect(mulund.wardName).toBe("T")
    })

    it("TC-C02: Strictly rejects locations outside Greater Mumbai jurisdiction (Neighboring Municipalities)", () => {
      // Thane West (Thane Municipal Corporation - TMC)
      const thane = MumbaiBoundaryService.validateCoordinates(19.2183, 72.9781)
      expect(thane.isValidCoordinate).toBe(true)
      expect(thane.isInsideMumbai).toBe(false)
      expect(thane.errorCode).toBe("OUTSIDE_JURISDICTION")
      expect(thane.message).toContain("Greater Mumbai")

      // Vashi, Navi Mumbai (Navi Mumbai Municipal Corporation - NMMC)
      const naviMumbai = MumbaiBoundaryService.validateCoordinates(19.0771, 72.9986)
      expect(naviMumbai.isValidCoordinate).toBe(true)
      expect(naviMumbai.isInsideMumbai).toBe(false)
      expect(naviMumbai.errorCode).toBe("OUTSIDE_JURISDICTION")

      // Mira Road (Mira-Bhayandar Municipal Corporation - MBMC)
      const miraRoad = MumbaiBoundaryService.validateCoordinates(19.2952, 72.8544)
      expect(miraRoad.isValidCoordinate).toBe(true)
      expect(miraRoad.isInsideMumbai).toBe(false)

      // Kalyan (Kalyan-Dombivli Municipal Corporation - KDMC)
      const kalyan = MumbaiBoundaryService.validateCoordinates(19.2403, 73.1305)
      expect(kalyan.isValidCoordinate).toBe(true)
      expect(kalyan.isInsideMumbai).toBe(false)

      // London Westminster (UK)
      const london = MumbaiBoundaryService.validateCoordinates(51.5014, -0.1419)
      expect(london.isValidCoordinate).toBe(true)
      expect(london.isInsideMumbai).toBe(false)

      // Arabian Sea offshore (outside coastline)
      const arabianSea = MumbaiBoundaryService.validateCoordinates(18.90, 72.70)
      expect(arabianSea.isValidCoordinate).toBe(true)
      expect(arabianSea.isInsideMumbai).toBe(false)
    })

    it("TC-C03: Correctly validates boundary edge coordinates", () => {
      // Coordinate exactly on the verified Ward A border polygon
      const borderPoint = MumbaiBoundaryService.validateCoordinates(18.94880846402114, 72.840253948166)
      expect(borderPoint.isValidCoordinate).toBe(true)
      expect(borderPoint.isInsideMumbai).toBe(true)
    })
  })

  // -------------------------------------------------------------
  // 2. Malformed & Invalid Coordinate Handling
  // -------------------------------------------------------------
  describe("2. Malformed & Invalid Coordinate Handling", () => {
    it("TC-C04: Differentiates malformed/invalid coordinates from out-of-jurisdiction coordinates", () => {
      // Non-numeric types
      const nullCheck = MumbaiBoundaryService.validateCoordinates(null, 72.8232)
      expect(nullCheck.isValidCoordinate).toBe(false)
      expect(nullCheck.errorCode).toBe("INVALID_COORDINATES")

      const nanCheck = MumbaiBoundaryService.validateCoordinates(NaN, 72.8232)
      expect(nanCheck.isValidCoordinate).toBe(false)
      expect(nanCheck.errorCode).toBe("INVALID_COORDINATES")

      // Out of geographic range [-90, 90]
      const outOfRangeLat = MumbaiBoundaryService.validateCoordinates(95.0, 72.8232)
      expect(outOfRangeLat.isValidCoordinate).toBe(false)
      expect(outOfRangeLat.errorCode).toBe("INVALID_COORDINATES")

      // Out of geographic range [-180, 180]
      const outOfRangeLng = MumbaiBoundaryService.validateCoordinates(18.9438, 200.0)
      expect(outOfRangeLng.isValidCoordinate).toBe(false)
      expect(outOfRangeLng.errorCode).toBe("INVALID_COORDINATES")
    })
  })

  // -------------------------------------------------------------
  // 3. Database Storage & Persistence
  // -------------------------------------------------------------
  describe("3. GeographicBoundary Model & Persistence", () => {
    it("TC-C05: Persists the validated MCGM boundary in GeographicBoundary table without duplication", async () => {
      const boundaryRecord = await prisma.geographicBoundary.findUnique({
        where: { code: "MCGM-MUMBAI-OFFICIAL" },
      })

      expect(boundaryRecord).not.toBeNull()
      expect(boundaryRecord?.name).toContain("Greater Mumbai")
      expect(boundaryRecord?.city).toBe("Mumbai")
      expect(boundaryRecord?.minLat).toBe(MUMBAI_BBOX.minLat)
      expect(boundaryRecord?.maxLat).toBe(MUMBAI_BBOX.maxLat)

      // Repeated sync must update existing record without duplicating
      const secondSync = await MumbaiBoundaryService.syncBoundaryToDatabase()
      expect(secondSync.id).toBe(boundaryRecord?.id)

      const totalCount = await prisma.geographicBoundary.count({
        where: { code: "MCGM-MUMBAI-OFFICIAL" },
      })
      expect(totalCount).toBe(1)
    })
  })

  // -------------------------------------------------------------
  // 4. REST API Endpoints
  // -------------------------------------------------------------
  describe("4. Geo REST API Endpoints", () => {
    it("TC-C06: GET /api/v1/geo/mumbai-boundary returns official FeatureCollection with 24 wards", async () => {
      const res = await request(app).get("/api/v1/geo/mumbai-boundary")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.jurisdiction).toContain("Greater Mumbai")
      expect(res.body.data.totalWards).toBe(24)
      expect(res.body.data.features.length).toBe(24)
    })

    it("TC-C07: POST /api/v1/geo/validate-location validates coordinates inside vs outside Mumbai", async () => {
      // Inside Mumbai
      const insideRes = await request(app)
        .post("/api/v1/geo/validate-location")
        .send({ latitude: 19.0544, longitude: 72.8267 }) // Bandra West
      expect(insideRes.status).toBe(200)
      expect(insideRes.body.data.isInsideMumbai).toBe(true)
      expect(insideRes.body.data.wardName).toBe("H/W")

      // Outside Mumbai (Thane)
      const outsideRes = await request(app)
        .post("/api/v1/geo/validate-location")
        .send({ latitude: 19.2183, longitude: 72.9781 }) // Thane West
      expect(outsideRes.status).toBe(200)
      expect(outsideRes.body.data.isInsideMumbai).toBe(false)
      expect(outsideRes.body.data.errorCode).toBe("OUTSIDE_JURISDICTION")
    })
  })

  // -------------------------------------------------------------
  // 5. Authoritative Backend Rejection on Issue Reporting
  // -------------------------------------------------------------
  describe("5. Backend Enforcement on Issue Creation (POST /api/v1/issues)", () => {
    it("TC-C08: Permits issue creation for locations inside Greater Mumbai", async () => {
      const uniqueSuffix = Date.now().toString().slice(-5)
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: `Cavity on Bandstand Promenade ${uniqueSuffix}`,
          description: "Structural asphalt subsidence near Bandra Bandstand.",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          latitude: 19.0544, // Bandra West (Inside Mumbai Ward H/W)
          longitude: 72.8267,
          address: "Bandstand Promenade, Bandra West, Mumbai",
          forceDuplicate: true,
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.reportNumber).toMatch(/^RG-/)
      testIssueIds.push(res.body.data.issue.id)
    })

    it("TC-C09: Strictly rejects issue creation for locations outside Greater Mumbai (HTTP 400)", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Pothole in Thane West",
          description: "Located outside Greater Mumbai municipal boundaries.",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          latitude: 19.2183, // Thane West (Outside MCGM)
          longitude: 72.9781,
          address: "Gokhale Road, Naupada, Thane West",
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toContain("Greater Mumbai")
      expect(res.body.error.message).toContain("outside Mumbai municipal limits")
    })

    it("TC-C10: Strictly rejects issue creation for London coordinates (HTTP 400)", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Pothole in Westminster",
          description: "London coordinates should be rejected.",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          latitude: 51.5014, // Westminster London
          longitude: -0.1419,
          address: "Victoria Street, London",
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toContain("Greater Mumbai")
    })
  })
})
