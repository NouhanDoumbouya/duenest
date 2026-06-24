import { describe, expect, it } from "vitest";

import {
  EXPORT_FORMAT_LABELS,
  creditNotice,
  generateReasonMessage,
  isUpgradeReason,
  isUsageReason,
} from "./application-documents";
import type {
  GenerateResult,
  TemplateRegistry,
} from "@/types/application-documents";

const registry: TemplateRegistry = {
  content_styles: [{ key: "formal", label: "Formal" }],
  document_types: [
    {
      key: "cover_letter",
      label: "Cover letter",
      kind: "letter",
      credit_cost: 3,
      ats_relevant: false,
      recommended_template: "classic",
    },
    {
      key: "cv",
      label: "CV",
      kind: "cv",
      credit_cost: 1,
      ats_relevant: true,
      recommended_template: "ats_clean",
    },
  ],
  templates: [],
};

describe("EXPORT_FORMAT_LABELS", () => {
  it("labels each format", () => {
    expect(EXPORT_FORMAT_LABELS.pdf).toBe("PDF");
    expect(EXPORT_FORMAT_LABELS.docx).toBe("DOCX");
  });
});

describe("creditNotice", () => {
  it("pluralizes multiple credits", () => {
    expect(creditNotice("cover_letter", registry)).toBe(
      "Uses 3 AI credits after successful generation.",
    );
  });

  it("uses the singular for one credit", () => {
    expect(creditNotice("cv", registry)).toBe(
      "Uses 1 AI credit after successful generation.",
    );
  });

  it("falls back to zero for unknown types", () => {
    expect(creditNotice("unknown", registry)).toBe(
      "Uses 0 AI credits after successful generation.",
    );
  });
});

describe("generateReasonMessage", () => {
  it("prefers an explicit message", () => {
    const result: GenerateResult = {
      available: false,
      reason: "error",
      message: "Custom message.",
    };
    expect(generateReasonMessage(result)).toBe("Custom message.");
  });

  it("maps known blocked reasons", () => {
    expect(
      generateReasonMessage({ available: false, reason: "ai_feature_not_in_plan" }),
    ).toBe("Document generation is a Pro feature.");
    expect(
      generateReasonMessage({ available: false, reason: "ai_credits_exhausted" }),
    ).toBe("You've used all your AI credits for this period.");
    expect(
      generateReasonMessage({ available: false, reason: "consent_required" }),
    ).toContain("Turn on AI");
  });

  it("falls back for unknown reasons", () => {
    expect(
      generateReasonMessage({ available: false, reason: "error" }),
    ).toBe("We couldn't generate this document. Please try again.");
  });
});

describe("isUpgradeReason / isUsageReason", () => {
  it("flags plan-gated reasons for upgrade", () => {
    expect(
      isUpgradeReason({ available: false, reason: "ai_feature_not_in_plan" }),
    ).toBe(true);
    expect(isUpgradeReason({ available: false, reason: "budget" })).toBe(false);
  });

  it("flags usage/budget reasons", () => {
    expect(
      isUsageReason({ available: false, reason: "ai_credits_exhausted" }),
    ).toBe(true);
    expect(isUsageReason({ available: false, reason: "budget" })).toBe(true);
    expect(
      isUsageReason({ available: false, reason: "ai_feature_not_in_plan" }),
    ).toBe(false);
  });
});
