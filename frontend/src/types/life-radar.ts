/**
 * Life Radar V1 — deterministic readiness payload from
 * `GET /api/v1/documents/life-radar/`. Computed server-side with no AI.
 */

export type LifeRadarSeverity = "expired" | "urgent" | "soon" | "later" | "overdue";

export interface LifeRadarSuggestedAction {
  key: string;
  label: string;
  description: string;
  /** upload_document | create_reminder | create_pack | setup_emergency
   *  | view_document | continue_pack | upgrade_plan */
  action: string;
  document_id?: number;
  bundle_id?: number;
}

export interface LifeRadarEmergencyAccess {
  configured: boolean;
  status: "ready" | "incomplete" | "disabled" | "none";
  pack_count: number;
  active_pack_count: number;
  item_count: number;
  trusted_contact_count: number;
}

export interface LifeRadarSummary {
  expiring_soon: number;
  upcoming_deadlines: number;
  overdue_reminders: number;
  missing_documents: number;
  incomplete_packs: number;
  emergency_ready: boolean;
}

export interface LifeRadar {
  score: number;
  label: string;
  is_empty: boolean;
  generated_at: string;
  summary: LifeRadarSummary;
  sections: {
    urgent: Array<Record<string, unknown>>;
    expiring_documents: Array<Record<string, unknown>>;
    upcoming_deadlines: Array<Record<string, unknown>>;
    incomplete_packs: Array<Record<string, unknown>>;
    missing_documents: Array<Record<string, unknown>>;
    emergency_access: LifeRadarEmergencyAccess;
    suggested_actions: LifeRadarSuggestedAction[];
  };
}
