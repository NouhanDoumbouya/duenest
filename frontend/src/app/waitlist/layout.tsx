import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description:
    "Request private-beta access to CertaNest — a calm, secure command center for important documents, renewals, applications, and secure sharing.",
  alternates: { canonical: "/waitlist" },
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
