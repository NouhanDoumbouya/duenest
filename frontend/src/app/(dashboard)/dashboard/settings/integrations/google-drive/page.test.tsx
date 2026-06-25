// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ConnectedAccount, DriveFile } from "@/types/integrations";

const ACCOUNT: ConnectedAccount = {
  id: 7,
  provider: "google",
  provider_account_id: "sub-1",
  provider_email: "user@example.com",
  display_name: "Test User",
  scopes: [],
  scope_groups: ["drive"],
  status: "connected",
  token_expires_at: null,
  last_refresh_at: null,
  last_checked_at: null,
  last_error_code: "",
  last_error_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  disconnected_at: null,
  is_token_expired: false,
  needs_attention: false,
};

const FILE: DriveFile = {
  provider_file_id: "f1",
  name: "Transcript.pdf",
  mime_type: "application/pdf",
  size: 1024,
  modified_time: "2026-01-01T00:00:00Z",
  type_label: "PDF",
  is_folder: false,
  is_google_workspace_file: false,
  exportable: false,
  export_mime_type: "",
};

const getIntegrationAccounts = vi.fn();
const getDriveDestinations = vi.fn(() =>
  Promise.resolve({ fixed: [], folders: [], packs: [], org_supported: false }),
);
const getDriveFiles = vi.fn(() => Promise.resolve({ files: [FILE], next_page_token: "" }));

vi.mock("@/lib/integrations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations")>(
    "@/lib/integrations",
  );
  return {
    ...actual,
    getIntegrationAccounts: () => getIntegrationAccounts(),
    getDriveDestinations: () => getDriveDestinations(),
    getDriveFiles: () => getDriveFiles(),
    previewDriveImport: vi.fn(),
    importDriveFiles: vi.fn(),
  };
});

import GoogleDriveImportPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GoogleDriveImportPage", () => {
  it("renders the connected browse state with files and privacy copy (no tokens)", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    render(<GoogleDriveImportPage />);

    expect(await screen.findByText("Transcript.pdf")).toBeTruthy();
    expect(screen.getByText("Import from Google Drive")).toBeTruthy();
    expect(
      screen.getByText(/CertaNest will not delete or modify files in Google Drive/),
    ).toBeTruthy();
    expect(screen.getByText(/No automatic sync is enabled/)).toBeTruthy();
    expect(screen.getByLabelText("Destination")).toBeTruthy();
    // No token material is ever rendered.
    expect(screen.queryByText(/access_token|refresh_token|ya29\./)).toBeNull();
  });

  it("renders the not-connected state when there is no Google account", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [] });
    render(<GoogleDriveImportPage />);
    expect(
      await screen.findByText(/Connect a Google account first/),
    ).toBeTruthy();
    expect(screen.getByText("Go to Integrations")).toBeTruthy();
  });
});
