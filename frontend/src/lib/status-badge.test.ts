import { describe, expect, it } from "vitest";

import {
  isStatusKey,
  resolveStatus,
  STATUS_MAP,
  STATUS_TONES,
  TONE_CLASS,
  type StatusKey,
} from "./status-badge";

describe("status-badge vocabulary", () => {
  it("maps every known status to a valid tone and a non-empty label", () => {
    for (const key of Object.keys(STATUS_MAP) as StatusKey[]) {
      const { tone, label } = resolveStatus(key);
      expect(STATUS_TONES).toContain(tone);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("provides a class entry for every tone", () => {
    for (const tone of STATUS_TONES) {
      expect(TONE_CLASS[tone]).toBeDefined();
      expect(TONE_CLASS[tone].badge.length).toBeGreaterThan(0);
      expect(TONE_CLASS[tone].dot.length).toBeGreaterThan(0);
    }
  });

  it("resolves canonical labels from the design docs", () => {
    expect(resolveStatus("expiring-soon").label).toBe("Expiring soon");
    expect(resolveStatus("expiring-soon").tone).toBe("warning");
    expect(resolveStatus("revoked").tone).toBe("danger");
    expect(resolveStatus("private").tone).toBe("trust");
    expect(resolveStatus("ready").tone).toBe("success");
  });

  it("narrows arbitrary strings with isStatusKey", () => {
    expect(isStatusKey("ready")).toBe(true);
    expect(isStatusKey("not-a-status")).toBe(false);
  });
});
