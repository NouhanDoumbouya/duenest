// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ConnectedAccount, GmailMessage } from "@/types/integrations";

const ACCOUNT: ConnectedAccount = {
  id: 7,
  provider: "google",
  provider_account_id: "sub-1",
  provider_email: "user@example.com",
  display_name: "Test User",
  scopes: [],
  scope_groups: ["gmail"],
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

const MESSAGE: GmailMessage = {
  provider_message_id: "m1",
  thread_id: "t1",
  from_display: "Jane Doe",
  from_email: "jane@x.com",
  subject: "Your transcript",
  date: "Mon, 1 Jan 2026",
  attachment_count: 1,
  attachments: [
    {
      provider_message_id: "m1",
      provider_attachment_id: "att1",
      filename: "Transcript.pdf",
      mime_type: "application/pdf",
      size: 2048,
      attachment_index: 0,
      downloadable: true,
      already_imported: false,
    },
  ],
};

const getIntegrationAccounts = vi.fn();
const getGmailDestinations = vi.fn(() =>
  Promise.resolve({ fixed: [], folders: [], packs: [], org_supported: false }),
);
const getGmailMessages = vi.fn(() =>
  Promise.resolve({ messages: [MESSAGE], next_page_token: "" }),
);

vi.mock("@/lib/integrations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations")>(
    "@/lib/integrations",
  );
  return {
    ...actual,
    getIntegrationAccounts: () => getIntegrationAccounts(),
    getGmailDestinations: () => getGmailDestinations(),
    getGmailMessages: () => getGmailMessages(),
    previewGmailImport: vi.fn(),
    importGmailAttachments: vi.fn(),
  };
});

import GmailImportPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GmailImportPage", () => {
  it("renders the connected search state with privacy copy", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    render(<GmailImportPage />);

    expect(await screen.findByLabelText("Search Gmail")).toBeTruthy();
    expect(screen.getByText("Import from Gmail")).toBeTruthy();
    expect(
      screen.getByText(/CertaNest will not read your inbox automatically/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Email bodies are not saved by default/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Destination")).toBeTruthy();
  });

  it("lists messages + attachments after a search (no body/token leak)", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [ACCOUNT] });
    render(<GmailImportPage />);
    await screen.findByLabelText("Search Gmail");

    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));

    expect(await screen.findByText("Your transcript")).toBeTruthy();
    expect(screen.getByText("Transcript.pdf")).toBeTruthy();
    // No snippet/body/token surface.
    expect(screen.queryByText(/access_token|ya29\.|snippet|BASE64_BODY/)).toBeNull();
  });

  it("renders the not-connected state when there is no Google account", async () => {
    getIntegrationAccounts.mockResolvedValueOnce({ accounts: [] });
    render(<GmailImportPage />);
    expect(
      await screen.findByText(/Connect a Google account with Gmail access first/),
    ).toBeTruthy();
    expect(screen.getByText("Go to Integrations")).toBeTruthy();
  });
});
