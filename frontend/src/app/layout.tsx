import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/components/pwa/pwa-provider";

// Inter for body/UI text, Manrope for display/headings — per the CertaNest brand kit.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://certanest.com";
const SITE_TITLE =
  "CertaNest — Life Documents, Deadlines, and Proof, Ready When Life Asks";
// Open Graph gets the punchier brand tagline for shared-link previews.
const OG_TITLE = "Life documents, deadlines, and proof — ready when life asks.";
const SITE_DESCRIPTION =
  "CertaNest is a secure life-admin platform that keeps important documents, deadlines, renewals, subscriptions, reusable application packs, trusted sharing, and emergency access organized and ready whenever life asks.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · CertaNest",
  },
  description: SITE_DESCRIPTION,
  applicationName: "CertaNest",
  keywords: [
    "document organizer",
    "document scanner",
    "renewal reminders",
    "secure document sharing",
    "application packs",
    "emergency document access",
  ],
  openGraph: {
    type: "website",
    siteName: "CertaNest",
    title: OG_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    // og:image comes from the file-based `opengraph-image` convention (root +
    // per-use-case), so it's branded and segment-specific with no duplicate tag.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // og:image comes from the file-based `opengraph-image` convention (next/og),
    // which Next also applies to the Twitter card — so it stays branded with no
    // dependency on a static raster.
  },
  // PWA: link the web app manifest and the installable icons (SEC: only public
  // brand assets are referenced here — never private data).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CertaNest",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Standalone-friendly viewport: brand theme color for the status bar/chrome and
// safe-area support so the installed app respects notches/home indicators.
export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
