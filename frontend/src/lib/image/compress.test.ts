import { describe, expect, it } from "vitest";

import { imageOutputName, scaledDimensions } from "./compress";

describe("scaledDimensions", () => {
  it("leaves images within the cap unchanged", () => {
    expect(scaledDimensions(800, 600, 1000)).toEqual({ width: 800, height: 600 });
  });

  it("returns the input when no cap is given", () => {
    expect(scaledDimensions(4000, 3000)).toEqual({ width: 4000, height: 3000 });
  });

  it("scales the longest edge down to the cap, preserving aspect ratio", () => {
    expect(scaledDimensions(4000, 2000, 1000)).toEqual({
      width: 1000,
      height: 500,
    });
  });

  it("scales by height when the image is portrait", () => {
    expect(scaledDimensions(1500, 3000, 1500)).toEqual({
      width: 750,
      height: 1500,
    });
  });

  it("never produces a zero dimension", () => {
    const { width, height } = scaledDimensions(2000, 1, 100);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe("imageOutputName", () => {
  it("keeps the base name and forces a .jpg extension", () => {
    expect(imageOutputName("passport.png")).toBe("passport-compressed.jpg");
    expect(imageOutputName("scan.jpeg")).toBe("scan-compressed.jpg");
  });

  it("falls back to a sensible name when there is no base", () => {
    expect(imageOutputName(".png")).toBe("image-compressed.jpg");
  });
});
