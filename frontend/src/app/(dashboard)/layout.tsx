"use client";

// Shared chrome + auth gate for every /dashboard route.
//
// The hard gate is server-side Next middleware (src/middleware.ts), which keeps
// logged-out users out before this renders. Here we additionally resolve the
// current user from the cookie session via /users/me/ (the API client refreshes
// once on 401); if that fails we log out and redirect to /login.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { DashboardUserProvider } from "@/components/dashboard/user-context";
import { FeatureFlagsProvider } from "@/components/features/feature-flags-provider";
import { LogoMark } from "@/components/layout/logo";
import { getCurrentUser, logout } from "@/lib/auth";
import type { User } from "@/types/auth";

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/40">
      <LogoMark size="lg" className="animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((me) => {
        if (active) {
          setUser(me);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          void logout();
          router.replace("/login");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (loading || !user) {
    return <FullScreenLoader />;
  }

  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.username;

  return (
    <DashboardUserProvider value={user}>
      <FeatureFlagsProvider>
        <DashboardShell user={{ name: fullName, email: user.email }}>
          {children}
        </DashboardShell>
      </FeatureFlagsProvider>
    </DashboardUserProvider>
  );
}
