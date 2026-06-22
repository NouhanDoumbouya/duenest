"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { User } from "@/types/auth";

const DashboardUserContext = createContext<User | null>(null);
const DashboardUserSetterContext = createContext<((user: User) => void) | null>(
  null,
);

/** Provides the authenticated user and a setter so pages (e.g. Profile) can push
 *  updates that the shell — avatar, name — reflects immediately. */
export function DashboardUserProvider({
  user,
  setUser,
  children,
}: {
  user: User;
  setUser: (user: User) => void;
  children: ReactNode;
}) {
  return (
    <DashboardUserContext.Provider value={user}>
      <DashboardUserSetterContext.Provider value={setUser}>
        {children}
      </DashboardUserSetterContext.Provider>
    </DashboardUserContext.Provider>
  );
}

/** Access the authenticated user inside any dashboard page. */
export function useDashboardUser(): User {
  const user = useContext(DashboardUserContext);
  if (!user) {
    // The (dashboard) layout guarantees a user before rendering children.
    throw new Error("useDashboardUser must be used within the dashboard layout.");
  }
  return user;
}

/** Update the shared user (name, avatar…) so the whole shell re-renders. */
export function useSetDashboardUser(): (user: User) => void {
  const setUser = useContext(DashboardUserSetterContext);
  if (!setUser) {
    throw new Error(
      "useSetDashboardUser must be used within the dashboard layout.",
    );
  }
  return setUser;
}
