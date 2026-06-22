import { OG_CONTENT_TYPE, OG_SIZE } from "@/components/og/brand-og";
import { useCaseOgImage } from "@/components/og/use-case-og";
import { getUseCase } from "@/lib/use-cases";

export const alt = getUseCase("agencies-schools")?.metaTitle ?? "CertaNest";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return useCaseOgImage("agencies-schools");
}
