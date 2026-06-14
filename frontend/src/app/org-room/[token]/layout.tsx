import type { Metadata } from "next";

// Private, token-gated route — must never be indexed or cached by search engines.
export const metadata: Metadata = {
  title: "Organization room · DueNest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function OrgRoomViewerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
