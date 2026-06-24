import { describe, expect, it } from "vitest";

import { packActionHref } from "./renewal-workspace";
import type { PackReadinessAction } from "@/types/renewal-workspace";

function action(p: Partial<PackReadinessAction>): PackReadinessAction {
  return { type: "upload_missing_document", label: "l", description: "d", priority: "high", bundle_id: 5, ...p };
}

describe("packActionHref", () => {
  it("routes pack-scoped actions to the bundle", () => {
    expect(packActionHref(action({ type: "upload_missing_document" }))).toBe(
      "/dashboard/bundles/5",
    );
    expect(packActionHref(action({ type: "share_pack" }))).toBe("/dashboard/bundles/5");
    expect(packActionHref(action({ type: "review_requirement" }))).toBe(
      "/dashboard/bundles/5",
    );
  });

  it("routes document-scoped actions to the document when an id is present", () => {
    expect(
      packActionHref(action({ type: "create_reminder", document_id: 9 })),
    ).toBe("/dashboard/documents/9");
    expect(
      packActionHref(action({ type: "replace_expired_document", document_id: 4 })),
    ).toBe("/dashboard/documents/4");
  });

  it("falls back to the bundle when a document action lacks an id", () => {
    expect(packActionHref(action({ type: "create_reminder" }))).toBe(
      "/dashboard/bundles/5",
    );
  });
});
