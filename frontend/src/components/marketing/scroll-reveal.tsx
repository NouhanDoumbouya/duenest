"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Reveals its children with a calm fade-up the first time they scroll into
 * view. Uses a single IntersectionObserver (no animation library) and honors
 * `prefers-reduced-motion` via CSS (`.reveal`). Children stay server-rendered —
 * this is just a thin client wrapper.
 *
 * Robustness: if IntersectionObserver is unavailable the content is shown
 * immediately, so nothing can get stuck hidden.
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in milliseconds. */
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      // No observer support — reveal immediately (deferred to avoid a
      // synchronous setState inside the effect body).
      const id = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      // threshold 0 + a bottom inset fires reliably for elements of any height,
      // a little before they're fully in view, so the motion reads as you scroll.
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // The element type is fixed per `as`, so the ref union is safe.
      ref={ref as React.Ref<never>}
      className={cn("reveal", visible && "is-visible", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
