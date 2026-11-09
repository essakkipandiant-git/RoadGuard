import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import PotholeReportModal from "../components/PotholeReportModal"
import { SelectedLocation } from "../components/GlobeLocationPicker"

describe("Phase C: Frontend PotholeReportModal Boundary Feedback Tests", () => {
  const insideMumbaiLocation: SelectedLocation = {
    lat: 18.9438,
    lng: 72.8232,
    address: "Marine Drive Promenade, Ward A, Mumbai",
    city: "Mumbai",
    road: "Marine Drive",
  }

  const outsideMumbaiLocation: SelectedLocation = {
    lat: 19.2183,
    lng: 72.9781,
    address: "Naupada, Thane West",
    city: "Thane",
    road: "Gokhale Road",
  }

  it("Renders MCGM Ward Verified chip when location is within Greater Mumbai", () => {
    const html = renderToString(
      <PotholeReportModal
        isOpen={true}
        onClose={vi.fn()}
        location={insideMumbaiLocation}
        onOpenGlobe={vi.fn()}
      />,
    )

    expect(html).toContain("MCGM WARD")
    expect(html).toContain("Submit Verified Report")
    expect(html).not.toContain("OUTSIDE GREATER MUMBAI")
  })

  it("Disables submission and renders JURISDICTION ERROR when location is outside Greater Mumbai", () => {
    const html = renderToString(
      <PotholeReportModal
        isOpen={true}
        onClose={vi.fn()}
        location={outsideMumbaiLocation}
        onOpenGlobe={vi.fn()}
      />,
    )

    // Displays clear warning and disabled submission text
    expect(html).toContain("OUTSIDE GREATER MUMBAI")
    expect(html).toContain("JURISDICTION ERROR")
    expect(html).toContain("Outside Mumbai (Submission Disabled)")
    expect(html).toContain("disabled")
  })

  it("Renders Mumbai pilot location presets and GPS trigger", () => {
    const html = renderToString(
      <PotholeReportModal
        isOpen={true}
        onClose={vi.fn()}
        location={null}
        onOpenGlobe={vi.fn()}
      />,
    )

    expect(html).toContain("Mumbai Pilot Presets:")
    expect(html).toContain("Marine Drive (Ward A)")
    expect(html).toContain("Dadar West (Ward G/N)")
    expect(html).toContain("Bandra West (Ward H/W)")
    expect(html).toContain("Use GPS")
  })
})
