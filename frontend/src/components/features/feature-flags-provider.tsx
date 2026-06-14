"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getFeatureMap, type FeatureState } from "@/lib/features";

type FeatureContextValue = {
  features: Record<string, FeatureState>;
  loaded: boolean;
};

const FeatureContext = createContext<FeatureContextValue>({
  features: {},
  loaded: false,
});

/**
 * Loads the resolved feature map once for the authenticated app shell. Failures
 * are non-fatal: features default to "available" in the UI (the backend still
 * enforces), so a flag-service hiccup never blocks the dashboard.
 */
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Record<string, FeatureState>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getFeatureMap()
      .then((res) => active && setFeatures(res.features))
      .catch(() => active && setFeatures({}))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ features, loaded }), [features, loaded]);
  return (
    <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>
  );
}

/**
 * Whether a feature is available to the current user. Unknown keys (and the
 * pre-load window) resolve to `true` so the UI never hides a feature it isn't
 * sure about — the backend remains the source of truth.
 */
export function useFeature(key: string): boolean {
  const { features } = useContext(FeatureContext);
  const state = features[key];
  return state ? state.enabled : true;
}

/** The maintenance message for a paused feature, if any. */
export function useFeatureMessage(key: string): string {
  const { features } = useContext(FeatureContext);
  return features[key]?.maintenance_message ?? "";
}

/** The full resolved feature map (for list filtering, e.g. nav). */
export function useFeatures(): Record<string, FeatureState> {
  return useContext(FeatureContext).features;
}
