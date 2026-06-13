// Renewal history API helpers (nested under a document).

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  CreateRenewalEventRequest,
  RenewalEvent,
  UpdateRenewalEventRequest,
} from "@/types/renewal-events";

export function getRenewalEvents(
  documentId: number,
): Promise<Paginated<RenewalEvent>> {
  return apiFetch<Paginated<RenewalEvent>>(
    `/documents/${documentId}/renewal-events/`,
    { auth: true },
  );
}

export function createRenewalEvent(
  documentId: number,
  payload: CreateRenewalEventRequest,
): Promise<RenewalEvent> {
  return apiFetch<RenewalEvent>(`/documents/${documentId}/renewal-events/`, {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateRenewalEvent(
  documentId: number,
  eventId: number,
  payload: UpdateRenewalEventRequest,
): Promise<RenewalEvent> {
  return apiFetch<RenewalEvent>(
    `/documents/${documentId}/renewal-events/${eventId}/`,
    { method: "PATCH", body: payload, auth: true },
  );
}

export function deleteRenewalEvent(
  documentId: number,
  eventId: number,
): Promise<void> {
  return apiFetch<void>(
    `/documents/${documentId}/renewal-events/${eventId}/`,
    { method: "DELETE", auth: true },
  );
}
