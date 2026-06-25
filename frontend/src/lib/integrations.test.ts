import { describe, expect, it } from "vitest";

import { accountStatusLabel, providerStatusLabel } from "./integrations";

describe("providerStatusLabel", () => {
  it("maps provider statuses to friendly copy", () => {
    expect(providerStatusLabel("connected")).toBe("Connected");
    expect(providerStatusLabel("not_connected")).toBe("Not connected");
    expect(providerStatusLabel("not_configured")).toBe("Not configured");
    expect(providerStatusLabel("unavailable")).toBe("Coming soon");
  });

  it("falls back to Unknown for unexpected values", () => {
    expect(providerStatusLabel("weird")).toBe("Unknown");
  });
});

describe("accountStatusLabel", () => {
  it("maps account statuses to friendly copy", () => {
    expect(accountStatusLabel("connected")).toBe("Connected");
    expect(accountStatusLabel("expired")).toBe("Expired");
    expect(accountStatusLabel("revoked")).toBe("Revoked");
    expect(accountStatusLabel("error")).toBe("Needs attention");
    expect(accountStatusLabel("disconnected")).toBe("Disconnected");
  });
});
