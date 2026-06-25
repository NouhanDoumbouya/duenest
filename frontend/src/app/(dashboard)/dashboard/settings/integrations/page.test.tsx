// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type {
  ConnectedAccount,
  IntegrationProvider,
  IntegrationScopeGroup,
} from "@/types/integrations";

const SCOPE_GROUPS: IntegrationScopeGroup[] = [
  { key: "drive", label: "Google Drive import", description: "", privacy_sensitive: false, status: "coming_soon" },
  { key: "calendar", label: "Google Calendar import", description: "", privacy_sensitive: false, status: "coming_soon" },
  { key: "gmail", label: "Gmail attachment import", description: "", privacy_sensitive: true, status: "coming_soon" },
];

const ACCOUNT: ConnectedAccount = {
  id: 7,
  provider: "google",
  provider_account_id: "google-sub-123",
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

const googleConnected: IntegrationProvider = {
  key: "google",
  name: "Google",
  description: "Connect a Google account.",
  available: true,
  configured: true,
  status: "connected",
  scope_groups: SCOPE_GROUPS,
  accounts: [ACCOUNT],
};

const googleNotConfigured: IntegrationProvider = {
  ...googleConnected,
  configured: false,
  status: "not_configured",
  accounts: [],
};

const getIntegrationProviders = vi.fn();

vi.mock("@/lib/integrations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations")>(
    "@/lib/integrations",
  );
  return {
    ...actual,
    getIntegrationProviders: () => getIntegrationProviders(),
    startGoogleIntegration: vi.fn(),
    disconnectIntegration: vi.fn(() => Promise.resolve(ACCOUNT)),
    checkIntegrationHealth: vi.fn(() => Promise.resolve(ACCOUNT)),
  };
});

import IntegrationsSettingsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IntegrationsSettingsPage", () => {
  it("renders the provider, connected account, and privacy copy (no tokens)", async () => {
    getIntegrationProviders.mockResolvedValueOnce({ providers: [googleConnected] });
    render(<IntegrationsSettingsPage />);

    expect(await screen.findByText("Google")).toBeTruthy();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.getByText("Gmail attachment import")).toBeTruthy();
    expect(
      screen.getByText(/CertaNest will only access what you choose to connect/),
    ).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Disconnect/ })).toBeTruthy();
    // No token material is ever rendered.
    expect(screen.queryByText(/access_token|refresh_token|ya29\./)).toBeNull();
  });

  it("renders a not-configured state", async () => {
    getIntegrationProviders.mockResolvedValueOnce({ providers: [googleNotConfigured] });
    render(<IntegrationsSettingsPage />);
    expect(
      await screen.findByText(/isn.t configured on the server yet/),
    ).toBeTruthy();
  });

  it("renders an error state safely when loading fails", async () => {
    getIntegrationProviders.mockRejectedValueOnce(new Error("boom"));
    render(<IntegrationsSettingsPage />);
    expect(await screen.findByText(/Couldn.t load integrations/)).toBeTruthy();
  });
});
