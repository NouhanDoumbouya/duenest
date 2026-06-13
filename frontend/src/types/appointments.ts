// Appointments linked to a document and/or bundle (/api/v1/appointments/).

export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "missed";

export interface Appointment {
  id: number;
  owner: number;
  document: number | null;
  document_title: string | null;
  bundle: number | null;
  bundle_title: string | null;
  title: string;
  appointment_at: string;
  location: string;
  reference_number: string;
  notes: string;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateAppointmentRequest {
  title: string;
  appointment_at: string;
  document?: number | null;
  bundle?: number | null;
  location?: string;
  reference_number?: string;
  notes?: string;
  status?: AppointmentStatus;
}

export type UpdateAppointmentRequest = Partial<CreateAppointmentRequest>;
