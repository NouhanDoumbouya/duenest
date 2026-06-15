import { describe, expect, it } from "vitest";

import {
  buildPrintableCardData,
  buildUnlockModeDescription,
  computeEmergencyReadiness,
  DEFAULT_CARD_OPTIONS,
  formatEmergencyCode,
  formatUnlockCountdown,
  getPrintFormatDimensions,
  isEmergencyDocumentIncomplete,
  normalizeEmergencyCode,
} from "./emergency-protocol";

type PackShape = Parameters<typeof computeEmergencyReadiness>[0];

function pack(overrides: Partial<PackShape> = {}): PackShape {
  return {
    item_count: 0,
    status: "draft",
    unlock_mode: "delayed",
    location_enabled: false,
    metadata: {},
    last_reviewed_at: null,
    ...overrides,
  } as PackShape;
}

describe("computeEmergencyReadiness", () => {
  it("reports not_started for an empty draft with no contacts", () => {
    const r = computeEmergencyReadiness(pack(), 0);
    expect(r.status).toBe("not_started");
    expect(r.percent).toBe(20); // unlock rule counts as chosen by default
    expect(r.nextStep).toBe("Select emergency documents");
  });

  it("reports ready when all core steps are done", () => {
    const r = computeEmergencyReadiness(
      pack({ item_count: 2, status: "active", metadata: { tested: true } }),
      1,
    );
    expect(r.status).toBe("ready");
    expect(r.percent).toBe(100);
    expect(r.nextStep).toBeNull();
  });

  it("flags needs_review when a ready pack is stale", () => {
    const old = new Date("2020-01-01").toISOString();
    const r = computeEmergencyReadiness(
      pack({
        item_count: 2,
        status: "active",
        metadata: { tested: true },
        last_reviewed_at: old,
      }),
      1,
    );
    expect(r.status).toBe("needs_review");
  });

  it("reports disabled regardless of completion", () => {
    const r = computeEmergencyReadiness(
      pack({ item_count: 2, status: "disabled", metadata: { tested: true } }),
      1,
    );
    expect(r.status).toBe("disabled");
  });

  it("excludes the optional location step from the percentage", () => {
    const withLocation = computeEmergencyReadiness(
      pack({ item_count: 1, location_enabled: true }),
      1,
    );
    const withoutLocation = computeEmergencyReadiness(
      pack({ item_count: 1, location_enabled: false }),
      1,
    );
    expect(withLocation.percent).toBe(withoutLocation.percent);
  });
});

describe("formatUnlockCountdown", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("formats a multi-hour countdown", () => {
    expect(formatUnlockCountdown("2026-06-16T11:05:00Z", now)).toBe("in 23h 5m");
  });
  it("returns 'now' once the time has passed", () => {
    expect(formatUnlockCountdown("2026-06-15T11:00:00Z", now)).toBe("now");
  });
  it("returns empty for no time", () => {
    expect(formatUnlockCountdown(null, now)).toBe("");
  });
});

describe("emergency codes", () => {
  it("normalizes to uppercase alphanumerics", () => {
    expect(normalizeEmergencyCode("dn-4829 13")).toBe("DN482913");
  });
  it("formats with a DN prefix and dash", () => {
    expect(formatEmergencyCode("482913")).toBe("DN-482913");
    expect(formatEmergencyCode("dn482913")).toBe("DN-482913");
  });
});

describe("buildUnlockModeDescription", () => {
  it("marks instant mode as a warning tone", () => {
    expect(buildUnlockModeDescription("instant_code").tone).toBe("warning");
  });
  it("marks delayed mode as calm", () => {
    expect(buildUnlockModeDescription("delayed").tone).toBe("calm");
  });
});

describe("printable card", () => {
  it("returns wallet dimensions by default", () => {
    expect(getPrintFormatDimensions("wallet").widthMm).toBeCloseTo(85.6);
  });
  it("omits sensitive fields with privacy-safe defaults", () => {
    const data = buildPrintableCardData(
      { title: "Pack", unlock_mode: "delayed" },
      DEFAULT_CARD_OPTIONS,
      { code: "482913", name: "Sam", contactPhone: "123" },
    );
    expect(data.code).toBeNull();
    expect(data.name).toBeNull();
    expect(data.contactPhone).toBeNull();
    expect(data.lockedMessage).toContain("locked by default");
  });
  it("includes the code only when explicitly enabled", () => {
    const data = buildPrintableCardData(
      { title: "Pack", unlock_mode: "delayed" },
      { ...DEFAULT_CARD_OPTIONS, includeCode: true },
      { code: "482913" },
    );
    expect(data.code).toBe("DN-482913");
  });
});

describe("isEmergencyDocumentIncomplete", () => {
  it("warns about missing file, expiry, and expired state", () => {
    const r = isEmergencyDocumentIncomplete({
      has_file: false,
      is_expired: true,
      missing_expiry_date: true,
    });
    expect(r.incomplete).toBe(true);
    expect(r.warnings).toHaveLength(3);
  });
  it("is clean for a complete document", () => {
    const r = isEmergencyDocumentIncomplete({
      has_file: true,
      is_expired: false,
      missing_expiry_date: false,
    });
    expect(r.incomplete).toBe(false);
  });
});
