import { brandOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/components/og/brand-og";

// Default branded Open Graph image for the whole site (any route without its
// own opengraph-image). Generated with next/og so it always matches the brand.
export const alt = "DueNest — Where important documents become ready";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return brandOgImage({ title: "Important documents, ready when life asks." });
}
