// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { replaceMock, loginMock, getOnboardingMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  loginMock: vi.fn(() => Promise.resolve({ access: "a", refresh: "r" })),
  getOnboardingMock: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", () => ({ login: loginMock }));
vi.mock("@/lib/onboarding", () => ({ getOnboardingState: () => getOnboardingMock() }));
// Mock the Google button so this test focuses on the page + email/password form.
vi.mock("@/components/auth/google-button", () => ({
  GoogleButton: () => <div data-testid="google-button" />,
}));

import LoginPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("renders the email/password form and the Google button", () => {
    render(<LoginPage />);
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByTestId("google-button")).toBeTruthy();
  });

  it("still signs in with email/password", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({ username: "alice", password: "pw12345678" }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
  });
});
