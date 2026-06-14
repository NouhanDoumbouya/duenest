import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

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
  "DueNest — Stay ready for important documents, renewals, and secure sharing";
const SITE_DESCRIPTION =
  "DueNest helps you organize important files, track renewals, build bundles, manage subscriptions, and share selected documents securely — all from one calm, secure place.";

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
    "renewal reminders",
    "secure document sharing",
    "subscription tracker",
    "application packs",
    "emergency document access",
  ],
  openGraph: {
    type: "website",
    siteName: "DueNest",
    title: SITE_TITLE,
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
