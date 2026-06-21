import type { ImageResponse } from "next/og";

import { getUseCase } from "@/lib/use-cases";
import { brandOgImage } from "./brand-og";

// Branded OG image for a use-case page: the segment eyebrow + title on the
// DueNest brand card. Used by each app/use-cases/<slug>/opengraph-image.tsx.
export function useCaseOgImage(slug: string): ImageResponse {
  const u = getUseCase(slug);
  return brandOgImage({
    eyebrow: u?.eyebrow,
    title: u?.title ?? "Important documents, ready when life asks.",
  });
}
