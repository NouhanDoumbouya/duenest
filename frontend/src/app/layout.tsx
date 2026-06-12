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

export const metadata: Metadata = {
  title: {
    default:
      "DueNest — Documents, deadlines, and renewals in one secure workspace",
    template: "%s · DueNest",
  },
  description:
    "DueNest keeps your important documents, renewals, subscriptions, and deadlines organized in one calm, secure workspace.",
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
