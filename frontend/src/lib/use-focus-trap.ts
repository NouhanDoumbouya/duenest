import { useEffect, useRef } from "react";

// Excludes [tabindex="-1"] on every element type so backdrop buttons (which use
// tabIndex={-1}) are never trapped, letting the ref attach to the outer dialog.
const FOCUSABLE = [
  'button:not([disabled]):not([tabindex="-1"])',
  '[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Focus management for a modal/overlay. While `active`, it moves focus inside
 * the referenced element, traps Tab within it, and restores focus to the
 * previously-focused element on close/unmount. Escape handling stays with the
 * caller (each dialog has its own guarded close logic).
 *
 * Usage:
 *   const ref = useFocusTrap<HTMLDivElement>(open);
 *   return open ? <div role="dialog" ref={ref} tabIndex={-1}>…</div> : null;
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    // Capture before moving focus in, so we can restore it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables[0] ?? node).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
