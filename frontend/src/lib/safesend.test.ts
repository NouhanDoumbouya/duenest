import { describe, expect, it } from "vitest";

import {
  buildSafeSendRecommendation,
  buildShareMessage,
  buildShareReadinessChecks,
  buildSharePackageOptions,
  detectSensitiveShareItems,
  formatDueNestCode,
  getShareStatusLabel,
  getShareStatusTone,
  normalizeDueNestCode,
  packageLeadMethod,
  packageMethods,
  resolveExpiry,
} from "./safesend";

describe("share package", () => {
  it("default option is QR + link and is recommended", () => {
    const options = buildSharePackageOptions();
    expect(options[0].id).toBe("qr_link");
    expect(options[0].recommended).toBe(true);
  });

  it("packageMethods reflects which deliveries are surfaced", () => {
    expect(packageMethods("qr_link")).toEqual({ qr: true, link: true, code: false });
    expect(packageMethods("code")).toEqual({ qr: false, link: false, code: true });
    expect(packageMethods("all")).toEqual({ qr: true, link: true, code: true });
  });

  it("lead method prefers QR, then link, then code", () => {
    expect(packageLeadMethod("all")).toBe("qr");
    expect(packageLeadMethod("link_code")).toBe("link");
    expect(packageLeadMethod("code")).toBe("code");
  });
});

describe("CertaNest code", () => {
  it("normalizes lowercase, spaces, and dashes to canonical form", () => {
    expect(normalizeDueNestCode("dn 4kq7 pxmr")).toBe("DN-4KQ7-PXMR");
    expect(normalizeDueNestCode("DN-4KQ7-PXMR")).toBe("DN-4KQ7-PXMR");
    expect(normalizeDueNestCode("4kq7pxmr")).toBe("DN-4KQ7-PXMR");
  });

  it("rejects codes with the wrong length or symbols", () => {
    expect(normalizeDueNestCode("DN-123")).toBe("");
    expect(normalizeDueNestCode("")).toBe("");
    // O and I are excluded from the unambiguous alphabet.
    expect(normalizeDueNestCode("DN-OOOO-IIII")).toBe("");
  });

  it("formats partial input progressively without rejecting it", () => {
    expect(formatDueNestCode("4kq")).toBe("DN-4KQ");
    expect(formatDueNestCode("4kq7px")).toBe("DN-4KQ7-PX");
    expect(formatDueNestCode("")).toBe("");
  });
});

describe("sensitivity detection", () => {
  it("flags passport/visa/bank-like names, ignores plain ones", () => {
    const flagged = detectSensitiveShareItems([
      { name: "passport.pdf" },
      { name: "holiday.jpg" },
      { name: "bank statement.pdf" },
    ]);
    expect(flagged.map((f) => f.name)).toEqual([
      "passport.pdf",
      "bank statement.pdf",
    ]);
  });
});

describe("SafeSend recommendation", () => {
  it("recommends balanced view-only for a sensitive share", () => {
    const rec = buildSafeSendRecommendation({
      sensitive: true,
      purpose: "",
      forDueNestUser: false,
      itemCount: 1,
    });
    expect(rec.presetId).toBe("balanced");
    expect(rec.preset.permission).toBe("view_only");
    expect(rec.package).toBe("qr_link");
  });

  it("recommends flexible download for job/scholarship purposes", () => {
    const rec = buildSafeSendRecommendation({
      sensitive: false,
      purpose: "job",
      forDueNestUser: false,
      itemCount: 2,
    });
    expect(rec.presetId).toBe("flexible");
    expect(rec.preset.permission).toBe("download_allowed");
  });

  it("treats visa purpose as sensitive even with a plain filename", () => {
    const rec = buildSafeSendRecommendation({
      sensitive: false,
      purpose: "visa",
      forDueNestUser: false,
      itemCount: 1,
    });
    expect(rec.preset.permission).toBe("view_only");
  });

  it("surfaces all methods for a CertaNest user", () => {
    const rec = buildSafeSendRecommendation({
      sensitive: false,
      purpose: "family",
      forDueNestUser: true,
      itemCount: 1,
    });
    expect(rec.package).toBe("all");
  });
});

describe("readiness checks", () => {
  it("warns on expired, missing-expiry, and incomplete bundles", () => {
    const checks = buildShareReadinessChecks({
      itemCount: 3,
      hasExpiry: true,
      downloadDisabled: true,
      watermark: true,
      sensitiveCount: 0,
      longExpiry: false,
      oneTime: false,
      accessCode: false,
      expiredCount: 1,
      missingExpiryCount: 2,
      incompleteBundleCount: 1,
    });
    const warnings = checks.filter((c) => c.tone === "warn").map((c) => c.label);
    expect(warnings.some((l) => l.includes("expired"))).toBe(true);
    expect(warnings.some((l) => l.includes("missing some files"))).toBe(true);
    expect(warnings.some((l) => l.includes("no expiry date"))).toBe(true);
  });

  it("flags an empty selection", () => {
    const checks = buildShareReadinessChecks({
      itemCount: 0,
      hasExpiry: true,
      downloadDisabled: false,
      watermark: false,
      sensitiveCount: 0,
      longExpiry: false,
      oneTime: false,
      accessCode: false,
    });
    expect(checks[0].tone).toBe("warn");
  });
});

describe("share message", () => {
  it("includes link and code but never raw paths", () => {
    const msg = buildShareMessage({
      template: "friendly",
      link: "https://certanest.com/quick-share/abc",
      code: "DN-4KQ7-PXMR",
      permissionLabel: "View only",
      expiryLabel: "24 hours",
    });
    expect(msg).toContain("https://certanest.com/quick-share/abc");
    expect(msg).toContain("DN-4KQ7-PXMR");
    expect(msg).toContain("Shared securely through CertaNest");
    expect(msg).not.toContain("/media/");
  });

  it("minimal template is link-first and terse", () => {
    const msg = buildShareMessage({
      template: "minimal",
      link: "https://certanest.com/x",
      permissionLabel: "View only",
      expiryLabel: "1 hour",
    });
    expect(msg).toBe("Secure CertaNest share: https://certanest.com/x");
  });
});

describe("status + expiry helpers", () => {
  it("maps status flags to label and tone", () => {
    expect(getShareStatusLabel({ is_active: true, is_expired: false, is_revoked: false })).toBe("Active");
    expect(getShareStatusTone({ is_active: false, is_expired: false, is_revoked: true })).toBe("danger");
    expect(getShareStatusLabel({ is_active: false, is_expired: true, is_revoked: false })).toBe("Expired");
  });

  it("resolves a preset expiry into a future ISO timestamp", () => {
    const iso = resolveExpiry("24h");
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });
});
