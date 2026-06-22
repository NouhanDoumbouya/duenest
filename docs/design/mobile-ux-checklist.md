# CertaNest — Mobile / PWA UX Checklist

> Several items are **already implemented** in `globals.css` and PWA components — marked
> ✅. The rest are verification/backlog items.

## Already in place (verify, don't redo)

- ✅ `overflow-x: clip` on html/body — no accidental horizontal scroll.
- ✅ 16px input floor under `max-width: 767px` — stops iOS focus zoom.
- ✅ `touch-action: manipulation` on interactive elements — removes 300ms tap delay.
- ✅ `env(safe-area-inset-*)` padding in `@media (display-mode: standalone)`.
- ✅ `.truncate { min-width: 0 }` — long filenames can't blow out width.
- ✅ Shorter, calmer reveal motion under `max-width: 640px`.
- ✅ Bottom nav (`components/layout/bottom-nav.tsx`) and PWA provider.

## To verify across all core flows

- [ ] Landing hero + primary CTA visible above the fold on a 360px viewport.
- [ ] No horizontal overflow on any dashboard module (test 320–414px).
- [ ] Tap targets ≥ 44×44px (nav, row actions, badges-as-buttons).
- [ ] Primary action is sticky/bottom-anchored on long forms and builders.
- [ ] Document actions open as a bottom sheet, not a tiny desktop dropdown.
- [ ] Filters/smart views reachable in ≤1 tap on Vault.
- [ ] Scanner controls thumb-reachable; capture button large and centered.
- [ ] Pack builder usable one-handed; attach/scan-into-pack reachable.
- [ ] Quick Share / SafeSend flow: review + confirm legible on mobile.
- [ ] QR preview scales and stays scannable; download works on mobile.
- [ ] AI chat input doesn't get hidden by the on-screen keyboard.
- [ ] Modals become full-height sheets on mobile where appropriate.
- [ ] Safe-area respected on notched devices (already padded — confirm visually).
- [ ] Text remains ≥16px for inputs; body legible without zoom.
- [ ] Skeletons render on slow connections (no blank screens).
- [ ] Offline route (`/offline`) and PWA install path work.

## PWA specifics

- [ ] Manifest icons, theme color match brand (Midnight Navy / Trust Blue).
- [ ] Standalone mode hides browser chrome cleanly; overscroll chaining tamed (✅ in CSS).
- [ ] Install prompt is honest and dismissible (no nag pattern).
