import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  COMMON_ANSWER_CATEGORY_LABELS,
  SKILL_CATEGORY_LABELS,
  completenessLabelTone,
} from "./smart-profile";

describe("category label maps", () => {
  it("labels every skill category", () => {
    expect(SKILL_CATEGORY_LABELS.technical).toBe("Technical");
    expect(SKILL_CATEGORY_LABELS.language).toBe("Language");
    expect(SKILL_CATEGORY_LABELS.soft).toBe("Soft skill");
    expect(SKILL_CATEGORY_LABELS.tool).toBe("Tool");
    expect(SKILL_CATEGORY_LABELS.other).toBe("Other");
  });

  it("labels achievement categories", () => {
    expect(ACHIEVEMENT_CATEGORY_LABELS.academic).toBe("Academic");
    expect(ACHIEVEMENT_CATEGORY_LABELS.certification).toBe("Certification");
    expect(ACHIEVEMENT_CATEGORY_LABELS.award).toBe("Award");
  });

  it("labels common-answer categories", () => {
    expect(COMMON_ANSWER_CATEGORY_LABELS.scholarship).toBe("Scholarship");
    expect(COMMON_ANSWER_CATEGORY_LABELS.visa).toBe("Visa");
    expect(COMMON_ANSWER_CATEGORY_LABELS.general).toBe("General");
  });
});

describe("completenessLabelTone", () => {
  it("maps complete / strong labels to good", () => {
    expect(completenessLabelTone("Complete")).toBe("good");
    expect(completenessLabelTone("Strong profile")).toBe("good");
  });

  it("maps good / solid labels to secure", () => {
    expect(completenessLabelTone("Good progress")).toBe("secure");
    expect(completenessLabelTone("Solid")).toBe("secure");
  });

  it("maps starting / empty labels to warn", () => {
    expect(completenessLabelTone("Just getting started")).toBe("warn");
    expect(completenessLabelTone("Empty")).toBe("warn");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(completenessLabelTone("  COMPLETE  ")).toBe("good");
  });

  it("falls back to default for unknown labels", () => {
    expect(completenessLabelTone("In between")).toBe("default");
  });
});
