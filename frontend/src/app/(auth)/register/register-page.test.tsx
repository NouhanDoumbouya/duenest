// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { pushMock, registerMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  registerMock: vi.fn(() => Promise.resolve({})),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", () => ({ register: registerMock }));
vi.mock("@/lib/private-beta", () => ({
  getPrivateBetaStatus: () => Promise.resolve({ private_beta_enabled: false }),
}));
vi.mock("@/lib/attribution", () => ({
  captureUtmToSession: vi.fn(),
  readStoredAttribution: () => ({}),
}));
vi.mock("@/components/auth/google-button", () => ({
  GoogleButton: () => <div data-testid="google-button" />,
}));

import RegisterPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RegisterPage", () => {
  it("renders the sign-up form and the Google button", async () => {
    render(<RegisterPage />);
    expect(await screen.findByText("Create your account")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("google-button")).toBeTruthy());
  });
});
