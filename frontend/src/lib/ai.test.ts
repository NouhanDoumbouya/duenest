import { describe, expect, it } from "vitest";

import { retrievalModeLabel } from "./ai";

describe("retrievalModeLabel", () => {
  it("maps each backend mode to friendly, non-technical copy", () => {
    expect(retrievalModeLabel("chunk_vector")).toBe(
      "Answered from document content",
    );
    expect(retrievalModeLabel("chunk_lexical")).toBe(
      "Answered from document content search",
    );
    expect(retrievalModeLabel("document_fallback")).toBe(
      "Answered from document details",
    );
    expect(retrievalModeLabel("no_context")).toBe("Not enough information found");
  });

  it("returns null for an unknown/absent mode (backward compatible)", () => {
    expect(retrievalModeLabel(undefined)).toBeNull();
  });

  it("never leaks raw technical mode names", () => {
    for (const mode of [
      "chunk_vector",
      "chunk_lexical",
      "document_fallback",
      "no_context",
    ] as const) {
      const label = retrievalModeLabel(mode);
      expect(label).not.toMatch(/chunk|vector|lexical|embedding|rag/i);
    }
  });
});
