# CertaNest — Interaction Principles

The product feeling we are protecting:
**"I trust this. I understand this. I know exactly what to do next."**

Core promise: **Important documents, ready when life asks.**

## Product principles (applied to every screen)

1. **Readiness over storage.** CertaNest is where documents become *ready*, not where
   files sit. Surfaces should push toward a next state, not just display.
2. **Calm over chaos.** Every screen reduces anxiety. Urgency is communicated with Due
   Amber, never with fear, fake countdowns, or red-everywhere.
3. **Trust before growth.** Sensitive flows (share, sign, emergency, AI) are honest and
   explicit. No accidental exposure. No overclaims.
4. **One obvious next action.** Exactly one primary action per view.
5. **Preserve originals.** Convert / fill / sign / export create *prepared copies* by
   default; the original is never destroyed. Say so in the UI.
6. **Private until shared.** No public link, QR, or external access without explicit
   user confirmation. State link status plainly.
7. **AI assists, user decides.** AI output is a suggestion to review, never auto-applied,
   auto-shared, or presented as official/legal.
8. **Mobile is first-class.** Document emergencies happen on phones.
9. **Fast feels trustworthy.** Optimistic UI, skeletons, instant feedback. Slow sensitive
   tools create anxiety.
10. **Delight through usefulness.** Beautiful details make users calmer and faster — never
    distract, manipulate, or manufacture engagement.

## Interaction rules

- **Latency masking:** show a skeleton within 100ms; never a blank screen.
- **Optimistic actions:** apply locally, reconcile on response, offer Undo on reversible
  ones (move to Trash, remove from pack, archive).
- **Confirmation tiering:** reversible → toast with Undo; destructive/irreversible →
  `confirm-dialog` naming the exact consequence ("This permanently deletes 3 documents").
- **Consequence transparency (Wise-style):** before share/sign/send, show exactly what
  will be shared and with what rules.
- **Keyboard & command:** command palette for power users; `/` or `⌘K` to search; visible
  focus order; Escape closes overlays.
- **State completeness:** every async surface defines loading, empty, error, and success.
  Empty states teach and offer the next action.
- **Motion as meaning:** 150–260ms for interactions; motion clarifies state transitions
  (inbox→vault, delete wind-down, pack reaching Ready). Always reduced-motion safe.

## Anti-patterns (never do)

- Fake urgency, fake scarcity, fake social proof, fake testimonials/numbers.
- Dark patterns, manipulative engagement loops, meaningless gamification.
- Hiding consequences of share/delete/sign actions.
- Claiming legal/official/compliance status that isn't implemented.
- Auto-sharing or auto-submitting AI output.
- Blank empty states. Dead-end errors. Silent failures.
