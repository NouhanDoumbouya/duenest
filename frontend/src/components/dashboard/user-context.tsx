"use client";

import { createContext, useContext } from "react";

import type { User } from "@/types/auth";

const DashboardUserContext = createContext<User | null>(null);

export const DashboardUserProvider = DashboardUserContext.Provider;

/** Access the authenticated user inside any dashboard page. */
export function useDashboardUser(): User {
  const user = useContext(DashboardUserContext);
  if (!user) {
    // The (dashboard) layout guarantees a user before rendering children.
    throw new Error("useDashboardUser must be used within the dashboard layout.");
  }
  return user;
}
