import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import IssueManagementWorkspace from "../components/IssueManagementWorkspace"
import { RoadIssue } from "../types/roadguard"

const mockIssue: RoadIssue = {
  id: "test-issue-uuid-1",
  trackingCode: "RG-81519",
  title: "Marine Drive Cavity Fracture",
  category: "cavity",
  severity: "critical",
  status: "reported",
  coordinates: {
    lat: 18.9438,
    lng: 72.8232,
  },
  address: "Netaji Subhash Chandra Bose Rd, Marine Drive, Mumbai",
  originalPhotoUrl: "/images/detection_asphalt.jpg",
  annotatedPhotoUrl: "/images/hero_road.jpg",
  detection: {
    boundingBox: { x: 10, y: 10, width: 80, height: 80 },
    confidenceScore: 0.96,
    surfaceLossPercentage: 22,
    depthEstimateMm: 85,
    crackPattern: "alligator",
    severityLevel: "critical",
    category: "cavity",
    visualFeatures: {
      hasWaterPonding: true,
      hasEdgeBreakdown: true,
      hasStructuralDeformation: true,
    },
  } as any,
  risk: {
    score: 92,
    level: "critical",
    factors: {
      damageSeverity: 90,
      roadUsage: 88,
      sensitiveProximity: 95,
      supportingReports: 60,
      unresolvedDuration: 30,
    },
    weights: {
      damageSeverity: 0.35,
      roadUsage: 0.25,
      sensitiveProximity: 0.2,
      supportingReports: 0.1,
      unresolvedDuration: 0.1,
    },
    weightedContributions: {
      damageSeverity: 31.5,
      roadUsage: 22.0,
      sensitiveProximity: 19.0,
      supportingReports: 6.0,
      unresolvedDuration: 3.0,
    },
    explanation: "High vehicle density on arterial corridor with severe asphalt hollow.",
    recommendedAction: "Immediate emergency cold-patch within 4 hours.",
    calculatedAt: "2026-11-09T08:00:00.000Z",
  },
  supportingReports: [],
  supportingCount: 4,
  statusHistory: [],
  repair: {},
  createdAt: "2026-11-09T08:00:00.000Z",
  updatedAt: "2026-11-09T08:00:00.000Z",
  reportedBy: "Dr. Vikram Seth",
  notes: "Asphalt subsidence near Nariman Point junction.",
  wardName: "Ward A - Colaba & Churchgate",
  governmentReferenceId: "MCGM/SWD/2026/89421",
  officialDepartmentName: "Brihanmumbai Municipal Corporation - Roads & Traffic",
  officialContactInfo: "Helpline: 1916 / 022-22694725",
  externalStatus: "Registered in MCGM Grievance Redressal",
}

describe("IssueManagementWorkspace Component Tests", () => {
  it("TC-FW01: Renders complete pothole management workspace when isOpen is true", () => {
    const html = renderToString(
      <IssueManagementWorkspace
        isOpen={true}
        onClose={vi.fn()}
        issue={mockIssue}
        currentUserRole="authority"
        onRoleChange={vi.fn()}
        onIssueUpdated={vi.fn()}
      />,
    )

    // A. Pothole Information
    expect(html).toContain("RG-81519")
    expect(html).toContain("Marine Drive Cavity Fracture")
    expect(html).toContain("85")
    expect(html).toContain("mm")
    expect(html).toContain("Netaji Subhash Chandra Bose Rd, Marine Drive, Mumbai")
    expect(html).toContain("18.94380")
    expect(html).toContain("72.82320")
    expect(html).toContain("Ward A - Colaba &amp; Churchgate")
    expect(html).toContain("critical")
    expect(html).toContain("SEVERITY")

    // Risk Assessment
    expect(html).toContain("92")
    expect(html).toContain("Explainable Multi-Factor Risk Score")

    // B. Progress Timeline Header
    expect(html).toContain("Progress &amp; Governance Timeline")
    expect(html).toContain("Showing actual recorded events. Zero fabricated progress.")

    // C. Executive Command Suite & Actions for SUPER_ADMIN
    expect(html).toContain("Executive Command Suite")
    expect(html).toContain("Override Lifecycle Status Directly")
    expect(html).toContain("Executive Work Order &amp; Crew Dispatch")

    // D. Field Inspector & Department Allocation Dossier
    expect(html).toContain("Field Inspector:")
    expect(html).toContain("Dept Allocation:")

    // E. Official Department Dossier
    expect(html).toContain("Official Department Dossier")
    expect(html).toContain("MCGM/SWD/2026/89421")
    expect(html).toContain("Brihanmumbai Municipal Corporation - Roads &amp; Traffic")
    expect(html).toContain("Helpline: 1916 / 022-22694725")
    expect(html).toContain("Registered in MCGM Grievance Redressal")
  })

  it("TC-FW02: Hides official action buttons when viewed by a CITIZEN role", () => {
    const html = renderToString(
      <IssueManagementWorkspace
        isOpen={true}
        onClose={vi.fn()}
        issue={mockIssue}
        currentUserRole="citizen"
        onRoleChange={vi.fn()}
        onIssueUpdated={vi.fn()}
      />,
    )

    expect(html).toContain("RG-81519")
    // Citizen notice rendered instead of staff action triggers
    expect(html).toContain("Public Citizen Mode")
    expect(html).toContain("Civic Transparency Dossier")
    expect(html).toContain("Confirm Hazard Encountered")
    expect(html).not.toContain("Executive Work Order &amp; Crew Dispatch")
    expect(html).not.toContain("Override Lifecycle Status Directly")
  })

  it("TC-FW03: Returns null when isOpen is false", () => {
    const html = renderToString(
      <IssueManagementWorkspace
        isOpen={false}
        onClose={vi.fn()}
        issue={mockIssue}
        currentUserRole="authority"
        onRoleChange={vi.fn()}
        onIssueUpdated={vi.fn()}
      />,
    )

    expect(html).toBe("")
  })
})
