// Feature flag client. The backend is the real enforcement boundary; this is
// used only to hide/disable paused features in the UI so users never hit a
// broken page. A disabled feature still 503s server-side.

import { apiFetch } from "./api";

export interface FeatureState {
  enabled: boolean;
  maintenance_message: string;
}

export interface FeatureMap {
  features: Record<string, FeatureState>;
}

export function getFeatureMap(): Promise<FeatureMap> {
  // Public: resolves the current viewer's availability map (no secrets).
  return apiFetch<FeatureMap>("/features/");
}

/** Maps a dashboard nav href to the feature key that gates it (if any). */
export const FEATURE_BY_NAV_HREF: Record<string, string> = {
  "/dashboard/files": "file_inbox",
  "/dashboard/notifications": "notification_center",
  "/dashboard/organizations": "organizations",
  "/dashboard/bundles": "bundles",
  "/dashboard/quick-share": "quick_share",
  "/dashboard/shared-with-me": "shared_with_me",
  "/dashboard/share-rooms": "secure_rooms",
  "/dashboard/emergency": "emergency_access",
  "/dashboard/feedback": "feedback",
};
