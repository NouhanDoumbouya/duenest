import type { Metadata } from "next";

// Emergency links are private, token-gated, and must never be indexed by search
// engines. This server layout wraps the (client) viewer with robots noindex.
export const metadata: Metadata = {
  title: "Emergency access · CertaNest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function EmergencyViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
