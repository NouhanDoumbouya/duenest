// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RouteError } from "./route-error";

afterEach(cleanup);

describe("RouteError", () => {
  it("renders a calm message and a safe reference when given one", () => {
    render(<RouteError reference="abc123" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
  });

  it("omits the reference line when none is provided", () => {
    render(<RouteError />);
    expect(screen.queryByText(/contact support with reference/i)).toBeNull();
  });

  it("calls onRetry when the retry button is pressed", () => {
    const onRetry = vi.fn();
    render(<RouteError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
