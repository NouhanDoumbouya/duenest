import { apiFetch } from "./api";
import type { LifeRadar, LifeRadarSuggestedAction } from "@/types/life-radar";

/** Fetch the deterministic Life Radar payload for the current user. */
export function getLifeRadar(): Promise<LifeRadar> {
  return apiFetch<LifeRadar>("/documents/life-radar/");
}

/** Map a Life Radar suggested-action to its in-app destination. */
export function suggestedActionHref(action: LifeRadarSuggestedAction): string {
  switch (action.action) {
    case "upload_document":
      return "/dashboard/documents/new";
    case "create_reminder":
      return "/dashboard/attention";
    case "create_pack":
      return "/dashboard/bundles/new";
    case "setup_emergency":
      return "/dashboard/emergency";
    case "view_document":
      return action.document_id
        ? `/dashboard/documents/${action.document_id}`
        : "/dashboard/documents";
    case "continue_pack":
      return action.bundle_id
        ? `/dashboard/bundles/${action.bundle_id}`
        : "/dashboard/bundles";
    case "upgrade_plan":
      return "/dashboard/settings/billing?upgrade=pro";
    default:
      return "/dashboard";
  }
}
