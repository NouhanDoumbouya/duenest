import type { Metadata } from "next";

// Private, token-gated sharing-room route — must never be indexed or cached by
// search engines. No auth, no sidebar; this is the page a recipient lands on
// from a secure room link. SINGULAR /room/[token] — distinct from the older
// ShareRoom feature's plural /rooms/[token].
export const metadata: Metadata = {
  title: "Shared room · CertaNest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function SharingRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
