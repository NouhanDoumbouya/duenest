import { describe, expect, it } from "vitest";

import { suggestedActionHref } from "./life-radar-api";
import type { LifeRadarSuggestedAction } from "@/types/life-radar";

function action(partial: Partial<LifeRadarSuggestedAction>): LifeRadarSuggestedAction {
  return { key: "k", label: "l", description: "d", action: "view_document", ...partial };
}

describe("suggestedActionHref", () => {
  it("maps onboarding actions to their pages", () => {
    expect(suggestedActionHref(action({ action: "upload_document" }))).toBe(
      "/dashboard/documents/new",
    );
    expect(suggestedActionHref(action({ action: "create_pack" }))).toBe(
      "/dashboard/bundles/new",
    );
    expect(suggestedActionHref(action({ action: "setup_emergency" }))).toBe(
      "/dashboard/emergency",
    );
  });

  it("targets the specific document or bundle when an id is present", () => {
    expect(
      suggestedActionHref(action({ action: "view_document", document_id: 7 })),
    ).toBe("/dashboard/documents/7");
    expect(
      suggestedActionHref(action({ action: "continue_pack", bundle_id: 3 })),
    ).toBe("/dashboard/bundles/3");
  });

  it("routes the plan-aware upgrade nudge to billing", () => {
    expect(suggestedActionHref(action({ action: "upgrade_plan" }))).toBe(
      "/dashboard/settings/billing?upgrade=pro",
    );
  });

  it("falls back safely for an unknown action", () => {
    expect(suggestedActionHref(action({ action: "mystery" }))).toBe("/dashboard");
  });
});
