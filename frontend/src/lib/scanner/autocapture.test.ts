import { describe, expect, it } from "vitest";

import {
  AutoCaptureController,
  assessFraming,
  type FrameSignal,
  type Quad,
} from "./autocapture";

function rect(x0: number, y0: number, x1: number, y1: number): Quad {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

describe("assessFraming", () => {
  it("reports no_document when nothing is detected", () => {
    expect(assessFraming(null, 1000, 1000).state).toBe("no_document");
  });

  it("asks to move closer when the document is small", () => {
    expect(assessFraming(rect(450, 450, 550, 550), 1000, 1000).state).toBe(
      "move_closer",
    );
  });

  it("asks to move back when the document overflows", () => {
    expect(assessFraming(rect(10, 10, 990, 990), 1000, 1000).state).toBe(
      "too_close",
    );
  });

  it("asks to center when off to one side", () => {
    // ~0.3 coverage but pushed to the right edge.
    expect(assessFraming(rect(600, 200, 1200, 800), 1200, 1000).state).toBe(
      "center_document",
    );
  });

  it("asks to align when the quad is too skewed", () => {
    const skewed: Quad = [
      { x: 450, y: 200 },
      { x: 750, y: 200 },
      { x: 950, y: 800 },
      { x: 150, y: 800 },
    ];
    expect(assessFraming(skewed, 1000, 1000).state).toBe("align_document");
  });

  it("is ready for a centered, well-sized, flat page", () => {
    const a = assessFraming(rect(150, 150, 850, 850), 1000, 1000);
    expect(a.state).toBe("ready");
    expect(a.coverage).toBeCloseTo(0.49, 2);
  });
});

describe("AutoCaptureController", () => {
  const good = rect(150, 150, 850, 850);
  const signal = (quad: Quad | null, over: Partial<FrameSignal> = {}): FrameSignal => ({
    quad,
    frameWidth: 1000,
    frameHeight: 1000,
    sharpness: 120,
    brightness: 150,
    ...over,
  });

  it("captures once after the page is held steady for the dwell, then cools down", () => {
    const c = new AutoCaptureController();
    expect(c.update(signal(good), 0).shouldCapture).toBe(false); // first frame: no prior to compare
    expect(c.update(signal(good), 100).shouldCapture).toBe(false); // steady starts
    const fire = c.update(signal(good), 700); // 600ms dwell reached
    expect(fire.shouldCapture).toBe(true);
    expect(fire.coaching).toBe("ready");
    // Immediately after: in cooldown, must not double-fire.
    expect(c.update(signal(good), 750).shouldCapture).toBe(false);
  });

  it("never captures a blurry frame, even when well framed", () => {
    const c = new AutoCaptureController();
    c.update(signal(good, { sharpness: 10 }), 0);
    const d = c.update(signal(good, { sharpness: 10 }), 800);
    expect(d.shouldCapture).toBe(false);
    expect(d.coaching).toBe("hold_steady");
  });

  it("resets the dwell when the document moves", () => {
    const c = new AutoCaptureController();
    c.update(signal(good), 0);
    c.update(signal(good), 100); // steady
    // Big jump (>30px) between frames → not still → dwell resets.
    c.update(signal(rect(300, 300, 1000, 1000)), 200);
    expect(c.update(signal(rect(300, 300, 1000, 1000)), 900).shouldCapture).toBe(
      false,
    );
  });

  it("coaches when no document is present", () => {
    const c = new AutoCaptureController();
    expect(c.update(signal(null), 0).coaching).toBe("no_document");
  });
});
