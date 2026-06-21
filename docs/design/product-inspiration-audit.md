# DueNest — Product Inspiration Audit

> Purpose: extract concrete UI/UX patterns from best-in-class products and map
> each one to a specific DueNest screen or flow. This is a **decision document**,
> not a moodboard. Every entry ends with an implementation recommendation tied to
> a real file in this repo.
>
> Grounding: DueNest already ships a mature design system — see
> [`design-system.md`](./design-system.md), tokens + motion in
> `frontend/src/app/globals.css`, primitives in `frontend/src/components/ui/*`,
> and the navigation model in `frontend/src/lib/navigation.ts`. This audit builds
> on that system; it does not replace it.

## How to read each entry

- **Does well** — the durable strength worth learning from.
- **Adapt** — the specific pattern DueNest should adopt.
- **Avoid** — what NOT to copy (brand, scope, or vibe mismatch).
- **Affected DueNest surfaces** — exact routes/components.
- **Recommendation** — concrete, file-level next step.

---

## 1. Apple (iCloud / Files / Notes / Wallet / HIG)

- Source: https://developer.apple.com/design/human-interface-guidelines/
- **Does well:** restraint, content-first hierarchy, generous whitespace, one
  primary action per surface, system calm.
- **Adapt:** reduce visible actions per card to **one primary + a More menu**;
  let document identity (name/thumbnail/status) be the visual focus.
- **Avoid:** Apple's exact glass/blur, SF iconography, frosted toolbars.
- **Affected surfaces:** `dashboard/documents` (Vault cards), `dashboard/vault`,
  document detail, `components/vault/*`.
- **Recommendation:** Audit every Vault/document card for action count. Where a
  card exposes >2 actions inline, collapse extras into a `More` menu (reuse
  `components/ui/drawer.tsx` on mobile, a popover on desktop). Keep status badge +
  one verb ("View") visible.

## 2. Linear

- Source: https://linear.app
- **Does well:** precision, low chrome, elegant sidebar, sharp status badges,
  fast keyboard-first workflows.
- **Adapt:** the sidebar already groups + collapses (`lib/navigation.ts`,
  `components/layout/sidebar-nav.tsx`). Push further: fewer equal-weight items,
  stronger single active state, consistent 1.5px icon stroke (lucide default).
- **Avoid:** issue-tracker semantics (cycles, triage), dense grayscale.
- **Affected surfaces:** sidebar, `status-badge.tsx`, all list views.
- **Recommendation:** Standardize one `StatusBadge` everywhere using the canonical
  status color map in `design-system.md`. Remove ad-hoc colored pills in feature
  pages and route them through `components/ui/status-badge.tsx`.

## 3. Telegram / WhatsApp / Signal

- Source: https://telegram.org , https://signal.org
- **Does well:** speed, lightweight mobile interactions, bottom sheets, instant
  optimistic feedback.
- **Adapt:** mobile action menus as **bottom sheets**; instant toast feedback on
  upload/share/move; sticky selected-item bar.
- **Avoid:** chat/social framing, message bubbles, presence dots everywhere.
- **Affected surfaces:** `components/layout/bottom-nav.tsx`, mobile Vault/SafeSend,
  `components/ui/toast.tsx`.
- **Recommendation:** Ensure every destructive/sharing action on mobile opens the
  existing `drawer.tsx` as a bottom sheet rather than a centered modal.

## 4. Stripe

- Source: https://stripe.com
- **Does well:** landing clarity, section rhythm, outcome-based copy, trust early.
- **Adapt:** DueNest's landing already follows this arc (`app/(marketing)/page.tsx`:
  Hero → TrustBar → Pain → HowItWorks → ... → FAQ → FinalCTA). Keep it; tighten
  section count so the 10-second test passes before the fold.
- **Avoid:** copying Stripe gradients literally; over-long landing.
- **Affected surfaces:** `app/(marketing)/page.tsx`.
- **Recommendation:** Landing is already strong. Highest-value change is **hero
  density** (one promise, one CTA pair, one product-story visual) and reducing the
  number of product sections a first-time visitor must scroll before "I get it."

## 5. Wise

- Source: https://wise.com
- **Does well:** practical trust, transparent consequences before an action.
- **Adapt:** state consequences **before** the irreversible step — "No public link
  has been created yet" in SafeSend; "Original preserved" in Fill & Sign.
- **Avoid:** finance/currency framing.
- **Affected surfaces:** SafeSend flow, Fill & Sign, public upload, delete/trash.
- **Recommendation:** Add an explicit **Review step** before link creation in
  SafeSend that lists exactly what will be exposed (see Pattern Library #25).

## 6. Notion

- Source: https://notion.so
- **Does well:** calm empty states that teach, modular structure, approachable
  power.
- **Adapt:** empty states that show the next action, not just "nothing here";
  modular Application Pack checklist.
- **Avoid:** block editor, infinite nesting, generic-workspace feel.
- **Affected surfaces:** `components/ui/empty-state.tsx` and every list's empty
  branch; `dashboard/bundles` (packs).
- **Recommendation:** Standardize all empty states through `empty-state.tsx` with
  the canonical copy in the Pattern Library (#21) — title, one teaching line, one
  primary CTA, one secondary.

## 7. Superhuman / Raycast

- Source: https://superhuman.com , https://raycast.com
- **Does well:** speed, recent-first, command palette, keyboard efficiency.
- **Adapt:** there is already a `components/command-palette/`. Make **recent
  documents** the default in every file picker and the palette.
- **Avoid:** forcing keyboard-only flows on a mobile-first audience.
- **Affected surfaces:** `command-palette/*`, file picker.
- **Recommendation:** Build/confirm a single **smart file picker** (Pattern #7)
  with a Recent tab as default, reused by SafeSend, Packs, AI, Fill & Sign.

## 8. Dropbox DocSend

- Source: https://docsend.com
- **Does well:** controlled sharing, link state (active/expired/revoked),
  recipient view clarity, access logs.
- **Adapt:** SafeSend already has active/revoked + activity log + watermark +
  expiry (see `ControlledAccessCard` on landing). Surface those states as
  first-class badges in the SafeSend management list.
- **Avoid:** deal-room / investor analytics positioning.
- **Affected surfaces:** `dashboard/sharing`, `dashboard/quick-share`, `share/*`.
- **Recommendation:** Ensure the share **management list** shows a status badge
  (Active / Expired / Revoked / Code required / Download off) on every row, using
  the same `StatusBadge`.

## 9. Adobe Acrobat

- Source: https://www.adobe.com/acrobat.html
- **Does well:** professional document tooling, output-focused flows, Fill & Sign
  simplicity.
- **Adapt:** every tool output becomes a **prepared copy** that can flow to Vault /
  Pack / SafeSend / Deadline. Tools should feel connected, not isolated.
- **Avoid:** an overwhelming wall of tool tiles.
- **Affected surfaces:** Document Tools, Fill & Sign, Convert/Export.
- **Recommendation:** Use the one-task flow (Pattern #13): choose tool → choose
  document → configure → save prepared copy → next action. Don't show every tool's
  options at once.

## 10. Smallpdf / iLovePDF

- Source: https://smallpdf.com , https://ilovepdf.com
- **Does well:** single-task utility clarity, drag-and-drop, obvious output action.
- **Adapt:** tool-first then document-second ordering; clear "what you'll get".
- **Avoid:** generic PDF-utility-website vibe, ad-heavy density.
- **Affected surfaces:** Document Tools.
- **Recommendation:** Keep each tool a focused 3–4 step flow; never a settings dump.

## 11. DocuSign

- Source: https://docusign.com
- **Does well:** signing seriousness, signer status, timestamped audit trail.
- **Adapt:** Fill & Sign shows a prepared signed-copy status + serious (non-legal)
  audit trail. Copy must avoid legal overclaiming — this is already handled in the
  landing FAQ ("not a legal e-signature service").
- **Avoid:** implying legal/eIDAS compliance.
- **Affected surfaces:** Fill & Sign, signature audit.
- **Recommendation:** Keep the existing honesty copy; mirror it inside the Fill &
  Sign UI at the point of saving (Pattern #26/#27).

## 12. Typeform / Tally / Airbnb onboarding

- Source: https://typeform.com , https://tally.so
- **Does well:** one question at a time, visible progress, smart defaults, minimal
  friction.
- **Adapt:** goal-based onboarding ("What do you want to prepare first?") that
  routes straight to the matching first action.
- **Avoid:** long multi-field forms before value.
- **Affected surfaces:** `components/onboarding/*`, `dashboard/onboarding`,
  `dashboard/readiness-setup`.
- **Recommendation:** Confirm onboarding asks the single goal question and routes
  to Scan / Pack / Deadline / Upload accordingly (Pattern #30).

## 13. ChatGPT / Claude / Perplexity / Notion AI / Grammarly

- Source: https://claude.ai , https://perplexity.ai
- **Does well:** scoped tasks, source display, review-before-apply, honest
  uncertainty.
- **Adapt:** AI is **scoped to a selected document/pack** with a visible scope
  label ("Answering based on: Passport.pdf"); answers cite source; nothing
  auto-saves. The landing already promises exactly this.
- **Avoid:** a generic full-vault chatbot; auto-applying suggestions.
- **Affected surfaces:** `dashboard/ask`, `dashboard/assistant`,
  `dashboard/pack-copilot`, `components/ai/*`.
- **Recommendation:** Every AI surface shows a scope chip + "Change document" and a
  review/confirm step before anything is written (Pattern #15/#16).

---

## Cross-cutting takeaways

1. **The system already exists — extend, don't reinvent.** Most premium primitives
   (tokens, motion, status map, typed text utilities) are in place.
2. **The biggest wins are flow-level, not pixel-level:** the smart file picker,
   progressive SafeSend, pack readiness, and consistent empty/loading/error states.
3. **Honesty copy is a feature.** DueNest already says the hard-but-true things
   (no AI guesswork, not a legal e-signature, templates are generic). Keep and
   mirror that copy at every point of action.
</content>
</invoke>
