export type WaitlistPersona =
  | "international_student"
  | "visa_holder"
  | "scholarship_applicant"
  | "freelancer"
  | "family_documents"
  | "traveler"
  | "student_leader"
  | "other";

export type WaitlistStatus = "pending" | "invited" | "accepted" | "rejected";

export interface PrivateBetaStatus {
  private_beta_enabled: boolean;
}

export interface WaitlistJoinRequest {
  full_name: string;
  email: string;
  persona: WaitlistPersona;
  country?: string;
  message?: string;
  referral_source?: string;
}

export interface WaitlistJoinResponse extends WaitlistJoinRequest {
  id: number;
  status: WaitlistStatus;
  created_at: string;
}

export interface InviteValidationResponse {
  valid: boolean;
  code?: string;
  label?: string;
  persona_target?: WaitlistPersona | "";
  expires_at?: string | null;
  remaining_uses?: number;
  detail?: string;
}

