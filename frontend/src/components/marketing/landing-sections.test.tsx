// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  Differentiation,
  Integrations,
  Organizations,
  ProductProof,
  ReadinessLoop,
} from "./landing-sections";
import { PRIMARY_CTA, PRIVATE_BETA } from "@/lib/cta";

afterEach(cleanup);

describe("Landing V2 sections", () => {
  it("differentiation frames readiness over storage with a lifecycle", () => {
    render(<Differentiation />);
    expect(screen.getByText(/Not storage\. Readiness\./i)).toBeTruthy();
    for (const step of ["Received", "Organized", "Watched", "Requested", "Shared", "Reused"]) {
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it("readiness loop shows the full 7-step add→reuse loop", () => {
    render(<ReadinessLoop />);
    for (const verb of ["Add", "Organize", "Watch", "Request", "Review", "Share", "Reuse"]) {
      expect(screen.getByRole("heading", { name: verb })).toBeTruthy();
    }
  });

  it("organizations section sells document collection without email chasing", () => {
    render(<Organizations />);
    expect(
      screen.getByText(/Collect documents without chasing email attachments/i),
    ).toBeTruthy();
    expect(screen.getByText(/no account needed/i)).toBeTruthy();
  });

  it("integrations are import-only and honestly labelled (no overclaim)", () => {
    const { container } = render(<Integrations />);
    expect(screen.getByText("Google Drive")).toBeTruthy();
    expect(screen.getByText("Google Calendar")).toBeTruthy();
    expect(screen.getByText("Gmail attachments")).toBeTruthy();
    expect(screen.getByText("Limited beta")).toBeTruthy();
    expect(screen.getAllByText("Import-only").length).toBeGreaterThan(0);
    const text = (container.textContent ?? "").toLowerCase();
    // Honest framing is present (we state what we do NOT do).
    expect(text).toContain("import-only");
    expect(text).toContain("nothing syncs automatically");
    expect(text).toContain("never writes back");
    // And it makes no positive "verified"/"unrestricted" overclaim.
    expect(text).not.toContain("verified by google");
    expect(text).not.toContain("fully verified");
    expect(text).not.toContain("unrestricted");
  });

  it("product proof bento lists real capabilities + a primary CTA", () => {
    render(<ProductProof />);
    expect(screen.getByText(/Request documents from someone/i)).toBeTruthy();
    expect(screen.getByText(/Redact & watermark a copy/i)).toBeTruthy();
    const cta = screen.getByRole("link", { name: new RegExp(PRIMARY_CTA.label, "i") });
    expect(cta.getAttribute("href")).toBe(PRIMARY_CTA.href);
  });

  it("the primary CTA routes correctly for the current beta flag", () => {
    expect(PRIMARY_CTA.href).toBe(PRIVATE_BETA ? "/waitlist" : "/register");
  });

  it("makes no forbidden security/compliance/verification claims", () => {
    const { container } = render(
      <div>
        <Differentiation />
        <Integrations />
        <Organizations />
      </div>,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const claim of [
      "soc 2",
      "soc2",
      "hipaa",
      "gdpr",
      "bank-level",
      "bank level",
      "military-grade",
      "military grade",
      "google verified",
      "guaranteed secure",
    ]) {
      expect(text).not.toContain(claim);
    }
  });
});
