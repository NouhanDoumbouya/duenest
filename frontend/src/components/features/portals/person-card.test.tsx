// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PersonCard } from "./person-card";
import type { PortalPerson } from "@/types/portals";

afterEach(cleanup);

function makePerson(overrides: Partial<PortalPerson> = {}): PortalPerson {
  return {
    id: 10,
    full_name: "Amina Diallo",
    email: "amina@example.com",
    phone: "",
    person_type: "client",
    status: "active",
    notes: "",
    active_cases: 2,
    custom_fields: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PersonCard", () => {
  it("shows the person's name, status, type, and active case count", () => {
    render(<PersonCard orgId={1} person={makePerson()} canManage />);
    expect(screen.getByText("Amina Diallo")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Client")).toBeTruthy();
    expect(screen.getByText("2 active cases")).toBeTruthy();
  });

  it("keeps details collapsed until asked (progressive disclosure)", () => {
    render(<PersonCard orgId={1} person={makePerson()} canManage />);
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
