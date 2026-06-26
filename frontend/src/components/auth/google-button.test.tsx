// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import type { GoogleCredentialResponse } from "@/lib/google-identity";

// Hoisted mocks (referenced inside vi.mock factories).
const { replaceMock, googleLoginMock, getOnboardingMock, nav } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  googleLoginMock: vi.fn(() => Promise.resolve({})),
  getOnboardingMock: vi.fn(() => Promise.resolve(null)),
  nav: { params: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => nav.params,
}));
vi.mock("@/lib/auth", () => ({ googleLogin: googleLoginMock }));
vi.mock("@/lib/onboarding", () => ({ getOnboardingState: getOnboardingMock }));
// @/lib/readiness (postAuthDestination) is intentionally NOT mocked — we exercise
// the real safe-redirect logic.

import { GoogleButton } from "./google-button";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
let capturedCallback: ((r: GoogleCredentialResponse) => void) | null = null;
const initialize = vi.fn((cfg: { callback: (r: GoogleCredentialResponse) => void }) => {
  capturedCallback = cfg.callback;
});
const renderButton = vi.fn();

beforeEach(() => {
  capturedCallback = null;
  nav.params = new URLSearchParams();
  // Pre-seed the GIS api so loadGoogleIdentity() resolves without a real script.
  (window as unknown as { google?: unknown }).google = {
    accounts: { id: { initialize, renderButton } },
  };
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", CLIENT_ID);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete (window as unknown as { google?: unknown }).google;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

async function fireCredential(credential?: string) {
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  await act(async () => {
    capturedCallback?.({ credential });
  });
}

describe("GoogleButton", () => {
  it("renders a disabled, unavailable button when the client id is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    render(<GoogleButton />);
    const btn = screen.getByRole("button", { name: /Continue with Google/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(initialize).not.toHaveBeenCalled();
  });

  it("loads GIS and renders Google's button when the client id is present", async () => {
    render(<GoogleButton />);
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    expect(initialize.mock.calls[0][0]).toMatchObject({ client_id: CLIENT_ID });
    expect(renderButton).toHaveBeenCalled();
  });

  it("sends the credential ID token to the backend via googleLogin", async () => {
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    await waitFor(() =>
      expect(googleLoginMock).toHaveBeenCalledWith({
        id_token: "fake-id-token",
        invite_code: undefined,
      }),
    );
  });

  it("passes an invite code through on success when provided", async () => {
    render(<GoogleButton inviteCode="DN-ABCDE-12345" />);
    await fireCredential("fake-id-token");
    await waitFor(() =>
      expect(googleLoginMock).toHaveBeenCalledWith({
        id_token: "fake-id-token",
        invite_code: "DN-ABCDE-12345",
      }),
    );
  });

  it("redirects to the dashboard after a successful login", async () => {
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("honours a safe same-origin ?next= destination", async () => {
    nav.params = new URLSearchParams("next=/dashboard/vault");
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard/vault"));
    // A preserved deep link must skip the onboarding lookup entirely.
    expect(getOnboardingMock).not.toHaveBeenCalled();
  });

  it("ignores an unsafe (off-origin) ?next= destination", async () => {
    nav.params = new URLSearchParams("next=https://evil.example.com");
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).not.toHaveBeenCalledWith("https://evil.example.com");
  });

  it("shows a safe error and does not redirect when the backend rejects", async () => {
    googleLoginMock.mockRejectedValueOnce(new Error("boom"));
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    expect(await screen.findByText(/couldn't complete Google sign-in/i)).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows an error and never calls the backend when no credential is returned", async () => {
    render(<GoogleButton />);
    await fireCredential(undefined);
    expect(
      await screen.findByText(/cancelled or did not complete/i),
    ).toBeTruthy();
    expect(googleLoginMock).not.toHaveBeenCalled();
  });

  it("never persists the Google ID token in local/session storage", async () => {
    render(<GoogleButton />);
    await fireCredential("fake-id-token");
    await waitFor(() => expect(googleLoginMock).toHaveBeenCalled());
    const dump = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    });
    expect(dump).not.toContain("fake-id-token");
  });
});
