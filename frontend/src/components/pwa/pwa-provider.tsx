"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  type BeforeInstallPromptEvent,
  dismissInstall,
  isInstallDismissed,
  isIos,
  isStandalone,
  supportsServiceWorker,
} from "@/lib/pwa";
import { InstallPrompt } from "./install-prompt";
import { OfflineBanner } from "./offline-banner";
import { UpdateBanner } from "./update-banner";

const SW_URL = "/sw.js";
// Only show the install prompt once the user has reached value (the app shell).
const INSTALL_ROUTES = ["/dashboard", "/onboarding"];
const INSTALL_DELAY_MS = 8000;

/**
 * App-wide PWA orchestrator: registers the single unified service worker (prod
 * only), surfaces an "Update available" banner on a user-initiated refresh,
 * tracks offline state, and shows a polite, dismissible install prompt on
 * value routes. It renders {children} unchanged so it can wrap the app root.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  const waitingWorker = useRef<ServiceWorker | null>(null);
  const updating = useRef(false);

  // ---- Service worker registration + update lifecycle ----------------------
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !supportsServiceWorker()) {
      return;
    }
    let cancelled = false;

    const trackWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        waitingWorker.current = reg.waiting;
        setUpdateReady(true);
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            waitingWorker.current = reg.waiting ?? installing;
            setUpdateReady(true);
          }
        });
      });
    };

    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        trackWaiting(reg);
      })
      .catch(() => {
        /* SW is an enhancement; the app works fully without it. */
      });

    // Reload exactly once, and only for a user-initiated update.
    const onControllerChange = () => {
      if (updating.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  // ---- Online / offline awareness ------------------------------------------
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ---- Install prompt capture (Android/Chrome) -----------------------------
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setShowInstall(false);
      dismissInstall();
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // ---- Decide whether to show the install prompt (politely, on value routes).
  // Rendering is gated on `onValueRoute` below, so leaving the route hides it
  // without a synchronous setState here.
  const onValueRoute = INSTALL_ROUTES.some((r) => pathname?.startsWith(r));
  useEffect(() => {
    if (!onValueRoute) return;
    if (isStandalone() || isInstallDismissed()) return;
    // Android needs a captured prompt; iOS shows manual guidance.
    const eligible = Boolean(installEvent) || isIos();
    if (!eligible) return;
    const t = setTimeout(() => setShowInstall(true), INSTALL_DELAY_MS);
    return () => clearTimeout(t);
  }, [onValueRoute, installEvent, pathname]);

  const handleUpdate = useCallback(() => {
    updating.current = true;
    waitingWorker.current?.postMessage({ type: "SKIP_WAITING" });
    setUpdateReady(false);
    // Fallback: if controllerchange doesn't fire shortly, reload anyway.
    setTimeout(() => {
      if (updating.current) window.location.reload();
    }, 1500);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    setShowInstall(false);
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      /* user dismissed the native sheet */
    } finally {
      setInstallEvent(null);
      dismissInstall();
    }
  }, [installEvent]);

  const handleDismissInstall = useCallback(() => {
    setShowInstall(false);
    dismissInstall();
  }, []);

  return (
    <>
      {children}
      <OfflineBanner online={online} />
      {showInstall && onValueRoute ? (
        <InstallPrompt
          mode={installEvent ? "android" : "ios"}
          onInstall={handleInstall}
          onDismiss={handleDismissInstall}
        />
      ) : null}
      <UpdateBanner
        visible={updateReady && !(showInstall && onValueRoute)}
        onUpdate={handleUpdate}
        onDismiss={() => setUpdateReady(false)}
      />
    </>
  );
}
