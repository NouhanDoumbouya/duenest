// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import OfflinePage from "./page";

afterEach(cleanup);

describe("OfflinePage", () => {
  it("shows a calm offline message and a privacy reassurance", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("heading", { name: "You are offline" })).toBeTruthy();
    // The promise is explicit: no private documents are kept offline.
    expect(
      screen.getByText(/does not store private documents offline/i),
    ).toBeTruthy();
  });

  it("offers a way forward (jsdom reports online, so a dashboard link)", () => {
    render(<OfflinePage />);
    // navigator.onLine is true under jsdom → the calm "Go to dashboard" path.
    const link = screen.getByRole("link", { name: "Go to dashboard" });
    expect(link.getAttribute("href")).toBe("/dashboard");
  });
});
