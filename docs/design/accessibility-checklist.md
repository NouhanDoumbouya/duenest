# DueNest — Accessibility Checklist

> Baseline already exists (focus-visible rings, semantic nav, `aria-current`,
> `aria-expanded`/`aria-controls`, reduced-motion). This is the completeness checklist.

## Already in place (verify, don't redo)

- ✅ Focus-visible rings (`ring-ring/50`) on nav links, buttons, collapsible toggles.
- ✅ `aria-current="page"` on active nav leaf.
- ✅ `aria-expanded` + `aria-controls` + descriptive `aria-label` on sidebar collapsibles.
- ✅ Semantic `<nav aria-label="Primary">` landmark.
- ✅ Full `prefers-reduced-motion: reduce` block disabling/neutralizing all motion.
- ✅ Pinch-zoom intentionally left enabled (not blocked by `touch-action`).

## Perception & contrast

- [ ] Body text and `--muted-foreground` (#586a85 on #f7f8fb) meet WCAG AA (verify 4.5:1).
- [ ] Status colors are not the *only* signal — pair amber/red/green with icon + label.
- [ ] Due Amber text on white meets contrast, or is used as fill with dark text.
- [ ] Focus ring visible against every surface (cards, accent/mint backgrounds).

## Keyboard & focus

- [ ] All actions reachable by keyboard; logical tab order.
- [ ] Escape closes dialogs, drawers, command palette, menus.
- [ ] Focus trapped in modals; returned to trigger on close.
- [ ] Command palette (⌘K) fully keyboard-operable.
- [ ] Skip-to-content link on app shell and marketing pages.

## Semantics & screen readers

- [ ] One `<h1>` per page; logical heading order (h1→h2→h3, no skips).
- [ ] Buttons vs links used semantically (action = button, navigation = link).
- [ ] Icon-only buttons have `aria-label` (overflow ⋯, close, revoke).
- [ ] Images/thumbnails have meaningful `alt`; decorative icons `aria-hidden`.
- [ ] Status changes announced via `aria-live` (toasts, upload progress, "pack ready").
- [ ] Form fields have associated `<label>`; errors linked via `aria-describedby` and
      announced.

## Forms & errors

- [ ] Required fields marked accessibly (not color-only).
- [ ] Inline errors are specific, programmatically associated, and announced.
- [ ] Success/confirmation announced to assistive tech.

## Motion & media

- [ ] Every animation inert or static under reduced motion (✅ baseline — verify new ones).
- [ ] No content conveyed by motion/color alone.

## Testing

- [ ] Keyboard-only pass on: login, onboarding, Vault, Bundles, Quick Share, AI, Settings.
- [ ] Screen-reader smoke test (VoiceOver/NVDA) on the same flows.
- [ ] Automated axe/lighthouse a11y check in CI where practical.
