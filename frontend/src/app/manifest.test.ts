import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Guard the PWA install config so a careless edit can't quietly break
// installability. Runs in the default node environment (no DOM needed).
const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"),
) as {
  name: string;
  short_name: string;
  display: string;
  start_url: string;
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
};

describe("web app manifest", () => {
  it("is installable: standalone display with brand identity", () => {
    expect(manifest.name).toBe("CertaNest");
    expect(manifest.short_name).toBe("CertaNest");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/dashboard");
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
  });

  it("ships 192 and 512 icons plus at least one maskable icon", () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
      manifest.icons.some((i) => (i.purpose ?? "").includes("maskable")),
    ).toBe(true);
  });

  it("references only public icon paths (no private/data URLs)", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/icons/")).toBe(true);
    }
  });
});
