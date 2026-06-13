import { apiFetch } from "./api";
import type {
  InviteValidationResponse,
  PrivateBetaStatus,
  WaitlistJoinRequest,
  WaitlistJoinResponse,
} from "@/types/private-beta";

export function getPrivateBetaStatus(): Promise<PrivateBetaStatus> {
  return apiFetch<PrivateBetaStatus>("/private-beta/status/");
}

export function joinWaitlist(
  payload: WaitlistJoinRequest,
): Promise<WaitlistJoinResponse> {
  return apiFetch<WaitlistJoinResponse>("/waitlist/", {
    method: "POST",
    body: payload,
  });
}

export function validateInviteCode(
  code: string,
): Promise<InviteValidationResponse> {
  return apiFetch<InviteValidationResponse>("/invites/validate/", {
    method: "POST",
    body: { code },
  });
}

