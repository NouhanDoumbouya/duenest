import { describe, expect, it } from "vitest";

import {
  accountStatusLabel,
  driveImportReasonLabel,
  providerStatusLabel,
} from "./integrations";

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

describe("driveImportReasonLabel", () => {
  it("maps Drive import skip/failure reasons to friendly copy", () => {
    expect(driveImportReasonLabel("unsupported_type")).toBe("Unsupported file type");
    expect(driveImportReasonLabel("too_large")).toBe("File is too large");
    expect(driveImportReasonLabel("limit_reached")).toBe("Plan limit reached");
    expect(driveImportReasonLabel("")).toBe("");
    expect(driveImportReasonLabel("whatever")).toBe("Couldn't import");
  });
});
