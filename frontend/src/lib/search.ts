// Unified quick-search used by the command palette. Wraps the owner-scoped
// `/search/` endpoint, which returns a small, capped list of "go here" results
// across documents, subscriptions, and organizations.

import { apiFetch } from "./api";

export type SearchResultType = "document" | "subscription" | "organization";

export interface SearchResult {
  type: SearchResultType;
  id: number;
  title: string;
  subtitle: string;
  url: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/** Search the current user's workspace. A blank query returns no results. */
export function searchWorkspace(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return Promise.resolve({ query: "", results: [] });
  }
  return apiFetch<SearchResponse>(
    `/search/?q=${encodeURIComponent(trimmed)}`,
    { auth: true, signal },
  );
}
