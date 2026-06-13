// Appointment API helpers (/api/v1/appointments/).

import { apiFetch } from "./api";
import type { Paginated } from "@/types/documents";
import type {
  Appointment,
  AppointmentStatus,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
} from "@/types/appointments";

export function getAppointments(params?: {
  document?: number;
  bundle?: number;
}): Promise<Paginated<Appointment>> {
  const search = new URLSearchParams();
  if (params?.document) search.set("document", String(params.document));
  if (params?.bundle) search.set("bundle", String(params.bundle));
  const query = search.toString();
  return apiFetch<Paginated<Appointment>>(
    `/appointments/${query ? `?${query}` : ""}`,
    { auth: true },
  );
}

export function createAppointment(
  payload: CreateAppointmentRequest,
): Promise<Appointment> {
  return apiFetch<Appointment>("/appointments/", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

export function updateAppointment(
  id: number,
  payload: UpdateAppointmentRequest,
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}/`, {
    method: "PATCH",
    body: payload,
    auth: true,
  });
}

export function deleteAppointment(id: number): Promise<void> {
  return apiFetch<void>(`/appointments/${id}/`, {
    method: "DELETE",
    auth: true,
  });
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  missed: "Missed",
};
