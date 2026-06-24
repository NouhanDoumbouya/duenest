import { describe, expect, it } from "vitest";

import {
  EXPORT_FORMAT_LABELS,
  creditNotice,
  generateReasonMessage,
  groupWarningsBySeverity,
  isUpgradeReason,
  isUsageReason,
  templateSupportsFormat,
  unsupportedFormatReason,
} from "./application-documents";
import type {
  DocumentTemplate,
  DocumentWarning,
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
      recommended_style: "formal",
      length_guidance: "One page.",
      best_for: "Job and program applications.",
      description: "A tailored letter for a specific opportunity.",
      export_formats: ["pdf", "docx"],
    },
    {
      key: "cv",
      label: "CV",
      kind: "cv",
      credit_cost: 1,
      ats_relevant: true,
      recommended_template: "ats_clean",
      recommended_style: "formal",
      length_guidance: "One to two pages.",
      best_for: "Online job portals.",
      description: "An ATS-friendly summary of your experience.",
      export_formats: ["pdf", "docx"],
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

describe("groupWarningsBySeverity", () => {
  const warnings: DocumentWarning[] = [
    { type: "generic_language", severity: "low", message: "Low note." },
    { type: "missing_education", severity: "high", message: "High note." },
    { type: "weak_summary", severity: "medium", message: "Medium note." },
    { type: "vague_dates", severity: "high", message: "Another high." },
  ];

  it("orders buckets high → medium → low and omits empty ones", () => {
    const grouped = groupWarningsBySeverity(warnings);
    expect(grouped.map((g) => g.severity)).toEqual(["high", "medium", "low"]);
    expect(grouped[0].items).toHaveLength(2);
  });

  it("returns nothing for empty/undefined input", () => {
    expect(groupWarningsBySeverity([])).toEqual([]);
    expect(groupWarningsBySeverity(undefined)).toEqual([]);
  });
});

describe("templateSupportsFormat / unsupportedFormatReason", () => {
  const template: DocumentTemplate = {
    key: "ats_clean",
    label: "ATS Clean",
    description: "Plain, parser-friendly layout.",
    document_types: ["cv"],
    export_formats: ["pdf"],
    ats_safe: true,
    recommended_for: ["Online portals"],
    kind: "cv",
    pro_only: false,
    best_for: "Online job portals.",
    preview: { tone: "minimal", divider: false },
  };

  it("checks supported formats", () => {
    expect(templateSupportsFormat(template, "pdf")).toBe(true);
    expect(templateSupportsFormat(template, "docx")).toBe(false);
    expect(templateSupportsFormat(null, "pdf")).toBe(false);
  });

  it("explains why a format is unavailable", () => {
    expect(unsupportedFormatReason(template, "docx")).toBe(
      "ATS Clean doesn't produce DOCX.",
    );
    expect(unsupportedFormatReason(null, "pdf")).toBe(
      "Pick a template to export PDF.",
    );
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
