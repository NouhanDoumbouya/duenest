// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { DocumentsTable } from "./documents-table";
import type { DocumentRecord } from "@/types/documents";

afterEach(cleanup);

// The table reads only a handful of fields; cast a minimal fixture.
function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 1,
    title: "Passport",
    category_name: "Identity",
    document_type: "Travel",
    expiry_date: "2030-01-01",
    computed_status: "active",
    status_label: "Active",
    ...overrides,
  } as unknown as DocumentRecord;
}

describe("DocumentsTable", () => {
  it("renders a mobile card list AND the desktop table (so phones never need horizontal scroll)", () => {
    const { container } = render(
      <DocumentsTable docs={[makeDoc()]} onRequestDelete={vi.fn()} />,
    );
    // Mobile: a stacked card list that is hidden from `sm` up.
    const mobileList = container.querySelector("ul.sm\\:hidden");
    expect(mobileList).not.toBeNull();
    expect(within(mobileList as HTMLElement).getByText("Passport")).toBeTruthy();

    // Desktop: the real table, hidden below `sm`.
    expect(container.querySelector("table")).not.toBeNull();
    // The title therefore appears once per view.
    expect(screen.getAllByText("Passport")).toHaveLength(2);
  });

  it("exposes accessible select + delete controls in the mobile card", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <DocumentsTable
        docs={[makeDoc()]}
        selectable
        selectedIds={new Set()}
        onToggleSelect={onToggle}
        onRequestDelete={vi.fn()}
      />,
    );
    const mobileList = container.querySelector("ul.sm\\:hidden") as HTMLElement;
    expect(
      within(mobileList).getByRole("checkbox", { name: "Select" }),
    ).toBeTruthy();
    expect(
      within(mobileList).getByRole("button", { name: "Move to trash" }),
    ).toBeTruthy();
  });
});
