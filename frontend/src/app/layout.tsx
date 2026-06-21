import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/components/pwa/pwa-provider";

// Inter for body text, Sora for display/headings — per the DueNest brand kit.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://duenest.app";
const SITE_TITLE =
  "DueNest — Important Documents, Ready When Life Asks";
// Open Graph gets the punchier brand tagline for shared-link previews.
const OG_TITLE = "Where important documents become ready.";
const SITE_DESCRIPTION =
  "DueNest helps you organize, prepare, track, generate, and safely share important documents before deadlines, applications, renewals, and emergencies — all from one calm, secure place.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · DueNest",
  },
  description: SITE_DESCRIPTION,
  applicationName: "DueNest",
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
    siteName: "DueNest",
    title: OG_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "DueNest" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  // PWA: link the web app manifest and the installable icons (SEC: only public
  // brand assets are referenced here — never private data).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DueNest",
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
      className={`${inter.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
