import { describe, it, expect } from "vitest"
import { validateMumbaiLocation, MUMBAI_CLIENT_BBOX } from "../services/mumbaiBoundaryClient"

describe("Phase C: Frontend Mumbai Boundary Validation Unit Tests", () => {
  it("Validates coordinates inside Greater Mumbai and extracts correct MCGM Ward", () => {
    // Marine Drive, South Mumbai
    const marineDrive = validateMumbaiLocation(18.9438, 72.8232)
    expect(marineDrive.isValid).toBe(true)
    expect(marineDrive.isInsideMumbai).toBe(true)
    expect(marineDrive.wardName).toBeDefined()

    // Dadar West (Ward G/N)
    const dadar = validateMumbaiLocation(19.0269, 72.8378)
    expect(dadar.isValid).toBe(true)
    expect(dadar.isInsideMumbai).toBe(true)
    expect(dadar.wardName).toBe("G/N")

    // Bandra West (Ward H/W)
    const bandra = validateMumbaiLocation(19.0544, 72.8267)
    expect(bandra.isValid).toBe(true)
    expect(bandra.isInsideMumbai).toBe(true)
    expect(bandra.wardName).toBe("H/W")

    // Andheri West (Ward K/W)
    const andheri = validateMumbaiLocation(19.1419, 72.8317)
    expect(andheri.isValid).toBe(true)
    expect(andheri.isInsideMumbai).toBe(true)
    expect(andheri.wardName).toBe("K/W")

    // Borivali West (Ward R/C)
    const borivali = validateMumbaiLocation(19.2307, 72.8567)
    expect(borivali.isValid).toBe(true)
    expect(borivali.isInsideMumbai).toBe(true)
    expect(borivali.wardName).toBe("R/C")

    // Mulund West (Ward T)
    const mulund = validateMumbaiLocation(19.1726, 72.9425)
    expect(mulund.isValid).toBe(true)
    expect(mulund.isInsideMumbai).toBe(true)
    expect(mulund.wardName).toBe("T")
  })

  it("Rejects locations outside Greater Mumbai with helpful explanation", () => {
    // Thane West (Outside MCGM)
    const thane = validateMumbaiLocation(19.2183, 72.9781)
    expect(thane.isValid).toBe(true)
    expect(thane.isInsideMumbai).toBe(false)
    expect(thane.message).toContain("outside Greater Mumbai municipal boundaries")

    // Vashi, Navi Mumbai (Outside MCGM)
    const vashi = validateMumbaiLocation(19.0771, 72.9986)
    expect(vashi.isValid).toBe(true)
    expect(vashi.isInsideMumbai).toBe(false)

    // London Westminster (Outside)
    const london = validateMumbaiLocation(51.5014, -0.1419)
    expect(london.isValid).toBe(true)
    expect(london.isInsideMumbai).toBe(false)
  })

  it("Handles invalid and malformed coordinates gracefully", () => {
    // @ts-expect-error test invalid types
    const nullCheck = validateMumbaiLocation(null, 72.82)
    expect(nullCheck.isValid).toBe(false)
    expect(nullCheck.isInsideMumbai).toBe(false)

    const nanCheck = validateMumbaiLocation(NaN, 72.82)
    expect(nanCheck.isValid).toBe(false)

    const outOfRange = validateMumbaiLocation(95.0, 72.82)
    expect(outOfRange.isValid).toBe(false)
  })

  it("Verifies bounding box limits", () => {
    expect(MUMBAI_CLIENT_BBOX.minLat).toBe(18.89)
    expect(MUMBAI_CLIENT_BBOX.maxLat).toBe(19.32)
    expect(MUMBAI_CLIENT_BBOX.minLng).toBe(72.77)
    expect(MUMBAI_CLIENT_BBOX.maxLng).toBe(73.01)
  })
})

