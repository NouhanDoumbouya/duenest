import { ImageResponse } from "next/og";

// Shared renderer for branded Open Graph images (next/og + Satori). Used by the
// root and per-use-case `opengraph-image.tsx` files. Styles are inline and use
// the Satori-supported subset (every multi-child box is display:flex).

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// CertaNest brand colors (see brand/certanest/colors.md).
const NAVY = "#0B1220"; /* Primary Ink */
const TEAL = "#5EEAD4"; /* Certa Teal tint (reads on ink) */
const EMERALD = "#10B981"; /* Secure Emerald */
const CLOUD = "#F8F6F1"; /* Warm Ivory */
const SLATE = "#94A3B8";

export function brandOgImage({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          padding: "76px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: TEAL,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                background: EMERALD,
                display: "flex",
              }}
            />
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: CLOUD, display: "flex" }}>
            CertaNest
          </div>
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {eyebrow ? (
            <div style={{ fontSize: 30, fontWeight: 600, color: TEAL }}>
              {eyebrow}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <div
            style={{
              fontSize: 66,
              fontWeight: 700,
              color: CLOUD,
              lineHeight: 1.08,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
        </div>

        {/* Footer tagline */}
        <div style={{ fontSize: 27, color: SLATE }}>
          Your life-admin, securely organized.
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
