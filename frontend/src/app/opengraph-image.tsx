import { brandOgImage, OG_CONTENT_TYPE, OG_SIZE } from "@/components/og/brand-og";

// Default branded Open Graph image for the whole site (any route without its
// own opengraph-image). Generated with next/og so it always matches the brand.
export const alt = "CertaNest — Life documents, deadlines, and proof, ready when life asks";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return brandOgImage({
    title: "Life documents, deadlines, and proof — ready when life asks.",
  });
}
