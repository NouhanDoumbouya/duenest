import type { Metadata } from "next";

// Private, token-gated upload route — must never be indexed or cached by search
// engines. No auth, no sidebar; this is the page an external recipient lands on.
export const metadata: Metadata = {
  title: "Document request · CertaNest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function DocumentRequestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
