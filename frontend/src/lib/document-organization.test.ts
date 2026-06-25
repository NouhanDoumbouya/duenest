import { describe, expect, it } from "vitest";

import {
  FOLDER_TYPE_LABELS,
  SMART_VIEW_PRESETS,
  STRUCTURE_MODE_LABELS,
  filterToQuery,
  findCaseFolder,
  findFolderInTree,
  flattenFolderTree,
  folderBreadcrumb,
} from "./document-organization";
import type { FolderNode } from "@/types/document-organization";

/** Build a folder node, overriding only what a test cares about. */
function makeNode(overrides: Partial<FolderNode> & { id: number }): FolderNode {
  return {
    name: `Folder ${overrides.id}`,
    parent_id: null,
    description: "",
    color: "slate",
    icon: "folder",
    sort_order: 0,
    folder_type: "normal",
    linked_case_id: null,
    linked_person_id: null,
    is_archived: false,
    document_count: null,
    children: [],
    ...overrides,
  };
}

// A small tree:
//   1 Travel
//     2 Visas
//       3 USA
//   4 Finance
const TREE: FolderNode[] = [
  makeNode({
    id: 1,
    name: "Travel",
    children: [
      makeNode({
        id: 2,
        name: "Visas",
        parent_id: 1,
        children: [makeNode({ id: 3, name: "USA", parent_id: 2 })],
      }),
    ],
  }),
  makeNode({ id: 4, name: "Finance" }),
];

describe("flattenFolderTree", () => {
  it("returns a depth-annotated, pre-order flat list", () => {
    const flat = flattenFolderTree(TREE);
    expect(flat.map((f) => [f.node.id, f.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 0],
    ]);
  });

  it("returns an empty list for no folders", () => {
    expect(flattenFolderTree([])).toEqual([]);
  });
});

describe("findFolderInTree", () => {
  it("finds a deeply nested folder", () => {
    expect(findFolderInTree(TREE, 3)?.name).toBe("USA");
  });

  it("finds a root folder", () => {
    expect(findFolderInTree(TREE, 4)?.name).toBe("Finance");
  });

  it("returns null when the id is absent", () => {
    expect(findFolderInTree(TREE, 999)).toBeNull();
  });
});

describe("folderBreadcrumb", () => {
  it("builds root → … → target", () => {
    expect(folderBreadcrumb(TREE, 3)).toEqual([
      { id: 1, name: "Travel" },
      { id: 2, name: "Visas" },
      { id: 3, name: "USA" },
    ]);
  });

  it("is a single entry for a root folder", () => {
    expect(folderBreadcrumb(TREE, 4)).toEqual([{ id: 4, name: "Finance" }]);
  });

  it("is empty for an unknown id", () => {
    expect(folderBreadcrumb(TREE, 999)).toEqual([]);
  });
});

describe("findCaseFolder", () => {
  it("matches a folder by linked_case_id anywhere in the tree", () => {
    const tree: FolderNode[] = [
      makeNode({
        id: 10,
        name: "Cases",
        folder_type: "system",
        children: [
          makeNode({
            id: 11,
            name: "Visa — Amina",
            folder_type: "case",
            linked_case_id: 77,
          }),
        ],
      }),
    ];
    expect(findCaseFolder(tree, 77)?.id).toBe(11);
  });

  it("returns null when no folder is linked to the case", () => {
    expect(findCaseFolder(TREE, 77)).toBeNull();
  });
});

describe("filterToQuery", () => {
  it("serializes truthy keys and skips empty values", () => {
    const q = filterToQuery({
      expiring_soon: true,
      document_type: "",
      tag_id: 5,
      status: undefined,
    });
    expect(q).toContain("expiring_soon=true");
    expect(q).toContain("tag_id=5");
    expect(q).not.toContain("document_type");
    expect(q).not.toContain("status");
    expect(q.startsWith("?")).toBe(true);
  });

  it("returns an empty string for no filter / empty filter", () => {
    expect(filterToQuery(undefined)).toBe("");
    expect(filterToQuery({})).toBe("");
  });
});

describe("label maps + presets", () => {
  it("labels every folder type", () => {
    expect(FOLDER_TYPE_LABELS.case).toBe("Case");
    expect(Object.keys(FOLDER_TYPE_LABELS)).toHaveLength(5);
  });

  it("labels every structure mode", () => {
    expect(STRUCTURE_MODE_LABELS.by_person).toBe("By person");
    expect(Object.keys(STRUCTURE_MODE_LABELS)).toHaveLength(5);
  });

  it("exposes the expected smart-view presets", () => {
    const keys = SMART_VIEW_PRESETS.map((p) => p.key);
    expect(keys).toContain("expiring_soon");
    expect(keys).toContain("recently_uploaded");
    expect(keys).toContain("unfiled");
    const expiring = SMART_VIEW_PRESETS.find((p) => p.key === "expiring_soon");
    expect(expiring?.filter).toEqual({ expiring_soon: true });
  });
});
