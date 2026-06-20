import { describe, expect, it } from "vitest";

import { cleanOcrText, hasUsableText } from "./ocr";

describe("cleanOcrText", () => {
  it("trims trailing whitespace on each line", () => {
    expect(cleanOcrText("hello   \nworld  ")).toBe("hello\nworld");
  });

  it("collapses runs of blank lines to a single blank line", () => {
    expect(cleanOcrText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("collapses internal runs of spaces/tabs", () => {
    expect(cleanOcrText("foo \t  bar")).toBe("foo bar");
  });

  it("normalises CRLF and trims the whole block", () => {
    expect(cleanOcrText("\r\n  one\r\ntwo  \r\n\r\n")).toBe("one\ntwo");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(cleanOcrText("   \n\t\n  ")).toBe("");
  });

  it("never reorders or invents content", () => {
    expect(cleanOcrText("Passport\nNo: 12345")).toBe("Passport\nNo: 12345");
  });
});

describe("hasUsableText", () => {
  it("is false for an empty/near-empty result", () => {
    expect(hasUsableText({ text: "", confidence: 95 })).toBe(false);
    expect(hasUsableText({ text: "a", confidence: 95 })).toBe(false);
  });

  it("is true once there is real content", () => {
    expect(hasUsableText({ text: "Passport", confidence: 40 })).toBe(true);
  });
});
