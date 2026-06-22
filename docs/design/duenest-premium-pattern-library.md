# CertaNest — Premium Pattern Library

> CertaNest-specific UX patterns. Each pattern says where it appears, its layout /
> copy / interaction / mobile / a11y rules, and the anti-patterns to avoid.
>
> Built on the existing system: tokens + motion in `frontend/src/app/globals.css`,
> primitives in `frontend/src/components/ui/*`, navigation in
> `frontend/src/lib/navigation.ts`. See also [`design-system.md`](./design-system.md),
> [`microcopy-patterns.md`](./microcopy-patterns.md), and
> [`interaction-principles.md`](./interaction-principles.md).

Conventions used below:
- **Primary action** = one dominant, verb-led button per surface.
- **Status map** = the canonical color map in `design-system.md` (Ready=success,
  Due=amber, Error/Revoked=destructive, Shared=primary, Neutral=muted, Private=teal).
- **Motion** = use existing utilities (`reveal`, `cta-sheen`, `pulse-soft`,
  `radar-sweep`, `tilt-card`); honor `prefers-reduced-motion`.

---

### 1. 10-second landing hero

- **Purpose:** a first-time visitor understands what/who/why in 10s.
- **Where:** `app/(marketing)/page.tsx` `Hero`.
- **Layout:** eyebrow chip → H1 promise (≤8 words) → one-line subhead → one CTA
  pair → one trust line → one composed product visual. Max 2 columns desktop,
  stacked mobile.
- **Copy:** "Important documents, ready when life asks." Subhead names the verbs
  (scan, organize, prepare, track, share). Trust line: "Private until shared."
- **Interaction:** primary CTA uses `cta-sheen`; secondary scrolls to How-it-works.
- **Mobile:** visual below text; CTA full-width; no more than 2 trust facts.
- **A11y:** `<h1>` once per page; decorative gradients `aria-hidden`.
- **Anti-pattern:** multiple competing CTAs, screenshot dumps, 20 tiny UI bits.

### 2. Pain-recognition section

- **Purpose:** make the user feel seen before pitching features.
- **Where:** landing `Pain` (before/after two-card).
- **Layout:** two cards — "Without CertaNest" (amber dots) vs "With CertaNest"
  (success checks).
- **Copy:** concrete frustrations ("scattered across WhatsApp, email, Drive").
- **Interaction:** `reveal` on scroll with small stagger.
- **Mobile:** stack; keep both cards.
- **A11y:** icons decorative; meaning carried by text.
- **Anti-pattern:** vague pain ("life is hard"), fear-mongering.

### 3. Product-workflow visual

- **Purpose:** show "scattered files → ready documents" as a system.
- **Where:** landing `Connected` (`SystemFlow`), `HowItWorks`.
- **Layout:** 3 numbered steps OR connected node flow; connectors animate via
  `flow-line`.
- **Copy:** verbs first — Add it once / CertaNest watches / You stay ready.
- **Mobile:** vertical steps; connectors hidden or simplified.
- **Anti-pattern:** fake dashboards with unreadable micro-text.

### 4. Sidebar grouping

- **Purpose:** fewer high-level items; related features grouped.
- **Where:** `components/layout/sidebar-nav.tsx` driven by `lib/navigation.ts`.
- **Layout:** group heading (uppercase, muted, 0.68rem) → leaf links → collapsible
  parents (Vault, Planning) with auto-expand on active section.
- **Copy:** noun labels (Vault, Deadlines, SafeSend) — never "Manage X".
- **Interaction:** active = mint accent bg + left 2px rail; expand state persisted
  in localStorage.
- **Mobile:** replaced by bottom nav (Pattern #24); overflow → "More".
- **A11y:** `aria-current="page"`, `aria-expanded`, `aria-controls` on toggles.
- **Anti-pattern:** every feature as an equal top-level item (feature dump).

### 5. Topbar contextual action

- **Purpose:** one page-specific primary action, minimal chrome.
- **Where:** `components/ui/page-header.tsx`, dashboard shell topbar.
- **Layout:** page title + optional one-line subtitle on the left; ONE primary
  action on the right; profile/menu minimal.
- **Copy:** action is a verb ("Upload file", "Create pack").
- **Mobile:** title row; primary action becomes sticky bottom CTA where helpful.
- **Anti-pattern:** 3+ topbar buttons, breadcrumbs nobody uses.

### 6. Dashboard readiness command center

- **Purpose:** "what needs attention today" in one glance.
- **Where:** `app/(dashboard)/dashboard/page.tsx` (Life Radar).
- **Layout:** readiness hero + metric grid + **Fix first** + Needs attention
  (3–4 cards max) + Continue preparing + Recent (4–6) + Quick actions.
- **Copy:** "Your document readiness" / "What needs attention today."
- **Interaction:** each card links to its action; skeletons while loading.
- **Mobile:** single column; readiness summary → quick actions → attention →
  recent. No dense grids.
- **Anti-pattern:** 12 widgets above the fold, vanity charts for normal users.

### 7. Smart file picker (the keystone pattern)

- **Purpose:** select a document without exposing the whole file system.
- **Where:** SafeSend, Attach-to-pack, AI scope, Fill & Sign, Convert, Requests,
  Deadline linking.
- **Layout:** header "Select a document" → search → tabs **Recent | Vault | Packs
  | Upload** (Recent default) → sticky selected-item summary with Continue.
- **Copy:** search placeholder "Search by name, type, tag, or pack…"
- **Interaction:** Recent shows 8–12 relevant; Packs shows packs then contents;
  Upload allows direct upload; selection is always visible.
- **Mobile:** full-screen sheet; sticky selected bar; large tap targets.
- **A11y:** tabs are a real tablist; selected item announced.
- **Anti-pattern:** dumping a full folder tree; no search; hidden selection.

### 8. Progressive SafeSend flow

- **Purpose:** controlled sharing, step-by-step, consequences before commit.
- **Where:** SafeSend creation (`dashboard/sharing`, `dashboard/quick-share`).
- **Layout:** Step 1 What → Step 2 Select (Pattern #7) → Step 3 Access (essentials
  first, advanced collapsed) → Step 4 **Review** → Step 5 Link created.
- **Copy:** "No public link has been created yet." / "You can revoke this anytime."
- **Interaction:** advanced settings collapsed by default; QR fades in on success.
- **Mobile:** full-screen stepper, never one giant form.
- **Anti-pattern:** showing all files + every setting before an item is chosen.

### 9. Application Pack readiness flow

- **Purpose:** make pack completeness obvious and guided.
- **Where:** `dashboard/bundles` (packs list + detail).
- **Layout:** list card = progress + missing-required count + deadline + next
  action. Detail = Missing → Needs review → Ready → Optional → Export/share.
- **Copy:** "5 of 7 required documents ready · Missing: Financial proof."
- **Interaction:** checklist item shows ONE primary action (Attach/Scan/Generate/
  Request) + More.
- **Mobile:** stacked sections; sticky "Continue preparing".
- **Anti-pattern:** every action (attach/scan/generate/request/convert/sign/share/
  delete) shown at once.

### 10. Document detail layout

- **Purpose:** one document, everything about it, one next action.
- **Where:** document detail route, `components/documents/*`.
- **Layout:** main = preview + readiness status + key metadata; side panel =
  linked packs, deadlines, sharing status, prepared copies, AI actions, activity.
- **Copy:** trust line "Private until shared. Original preserved."
- **Mobile:** side panel becomes stacked sections below preview.
- **Anti-pattern:** burying status; 6 inline buttons.

### 11. Vault card / list

- **Purpose:** a document as identity + status + next action.
- **Where:** `dashboard/documents`, `components/vault/*`.
- **Layout:** icon/thumbnail + name + type/category + status badge + last updated +
  ONE primary action + More.
- **Copy:** status uses the canonical map; badges like "In Visa Pack".
- **Interaction:** hover = subtle border emphasis (`surface-hover`), not heavy lift.
- **Mobile:** card list, not a table; row tap → detail; long-press/More → sheet.
- **Anti-pattern:** all actions inline; tables on mobile.

### 12. File Inbox staging

- **Purpose:** a calm staging area for un-organized scans/uploads.
- **Where:** `dashboard/files`.
- **Layout:** list of pending files each with "Organize" primary action.
- **Copy empty:** "File Inbox is clear. New scans and uploads appear here before
  you organize them."
- **Anti-pattern:** treating inbox as permanent storage.

### 13. Document Tools one-task flow

- **Purpose:** focused utility, output becomes a prepared copy.
- **Where:** Document Tools, Convert/Export.
- **Layout:** choose tool → choose document (Pattern #7) → configure → preview →
  Save prepared copy → next action (Attach/Share/Download/Deadline/Ask AI).
- **Copy:** "Your original file is preserved. We'll create a prepared copy."
- **Anti-pattern:** a giant grid of tools with all options exposed.

### 14. (merged into #13 — Tools one-task flow)

### 15. AI scoped assistant

- **Purpose:** AI answers about a selected document/pack, never the whole vault.
- **Where:** `dashboard/ask`, `dashboard/assistant`, `components/ai/*`.
- **Layout:** scope chip "Answering based on: Passport.pdf" + "Change document";
  chat below; answers show source snippets.
- **Copy:** "AI helps you prepare. You stay in control. Review before saving."
- **Interaction:** nothing auto-saves; suggestions need accept/reject.
- **Mobile:** scope chip sticky at top; input docked at bottom.
- **A11y:** loading state announced; sources are real links.
- **Anti-pattern:** defaulting to whole vault; auto-applying output.

### 16. Document Generation draft-review

- **Purpose:** generated documents stay drafts until reviewed.
- **Where:** `dashboard/draft`, generation flows.
- **Layout:** type → context → optional related docs → Generate → review/edit →
  Save/export/attach.
- **Copy:** "Draft — review before saving or sharing."
- **Anti-pattern:** treating AI output as final; auto-attaching to a pack.

### 17. Public upload request

- **Purpose:** let a third party upload exactly what's requested, nothing more.
- **Where:** `app/request/[token]`, `app/org-request/[token]`.
- **Layout:** CertaNest logo → request title → requested type → requester (if safe) →
  instructions → upload area → submit → trust note.
- **Copy:** "This upload goes only to the person or organization that requested it."
- **Mobile:** single column, large upload target.
- **Anti-pattern:** exposing the requester's vault or unrelated UI.

### 18. Portal review queue

- **Purpose:** review incoming documents efficiently.
- **Where:** `app/org-room`, `dashboard/requests`, `dashboard/share-rooms`.
- **Layout:** queue of items needing review; each → preview + Accept / Request
  changes / Save to inbox / Attach to pack.
- **Anti-pattern:** payroll/scheduling/workforce complexity creeping in.

### 19. Status badge

- **Purpose:** one consistent badge vocabulary product-wide.
- **Where:** `components/ui/status-badge.tsx`, everywhere with state.
- **Layout:** dot + label; color from the canonical status map.
- **Copy:** Ready / Expiring soon / Expired / Shared / Revoked / Draft / Private.
- **A11y:** never color-only — always include the text label.
- **Anti-pattern:** bespoke colored pills per feature page.

### 20. Trust copy

- **Purpose:** reduce anxiety at the moment of action.
- **Where:** SafeSend, Fill & Sign, delete, AI, public upload.
- **Copy bank:** "Private until shared." · "Original preserved." · "No public link
  yet." · "Revoke anytime." · "Review before saving." · "Requirements vary — verify
  with the official source."
- **Anti-pattern:** legal overclaiming ("legally binding", "guaranteed").

### 21. Empty state

- **Purpose:** teach the next action when there's nothing yet.
- **Where:** `components/ui/empty-state.tsx`, every list.
- **Layout:** quiet icon → title → one teaching line → primary CTA → secondary.
- **Copy:** see canonical bank in the brief / `microcopy-patterns.md`.
- **Anti-pattern:** "No data" with no path forward.

### 22. Loading / skeleton

- **Purpose:** preserve layout and reduce perceived wait.
- **Where:** `components/ui/skeleton.tsx`, dashboard `states.tsx`.
- **Layout:** skeletons mirror the real card/list shape.
- **Anti-pattern:** full-page spinners; layout shift on load.

### 23. Toast / undo

- **Purpose:** confirm an action and offer reversal.
- **Where:** `components/ui/toast.tsx`.
- **Copy:** "Moved to Trash · Undo".
- **Interaction:** undo window for reversible destructive actions.
- **Anti-pattern:** silent deletes; toasts for trivial events.

### 24. Mobile bottom-sheet actions / bottom nav

- **Where:** `components/layout/bottom-nav.tsx`, `drawer.tsx`.
- **Layout:** bottom nav = Dashboard · Vault · Scan · Packs · More. Actions open as
  bottom sheets.
- **A11y:** 44px+ targets; safe-area padding.
- **Anti-pattern:** desktop sidebar squeezed onto mobile.

### 25. Review-before-sharing

- **Purpose:** a deliberate confirmation listing what will be exposed.
- **Where:** SafeSend Step 4, emergency access, public share.
- **Layout:** summary of item + expiry + download permission + code status + QR
  status, then the irreversible CTA.
- **Anti-pattern:** creating a public link as a side effect of a toggle.

### 26. Original-preserved

- **Purpose:** never overwrite the source file.
- **Where:** Fill & Sign, Document Tools.
- **Copy:** "Prepared copy saved. Original preserved."
- **Anti-pattern:** in-place edits that destroy the original.

### 27. Sensitive-action confirmation

- **Purpose:** require intent for destructive/irreversible actions.
- **Where:** delete/trash, revoke, disable emergency access.
- **Layout:** `confirm-dialog.tsx` with named consequence + matched verb button.
- **Anti-pattern:** one-click permanent delete with no recovery path.

### 28. Search / recent-first selection

- **Purpose:** the fastest path to the right item.
- **Where:** file picker, command palette, Vault search.
- **Layout:** search always present; Recent is the default tab/list.
- **Anti-pattern:** forcing browse-from-root before search.

### 29. Progressive advanced settings

- **Purpose:** essentials first, power on demand.
- **Where:** SafeSend access controls, pack export, tool config.
- **Layout:** essential fields visible; "Advanced" collapsed (`details`/disclosure).
- **Anti-pattern:** a wall of every option at once.

### 30. One-obvious-next-action

- **Purpose:** every screen makes the next step obvious.
- **Where:** all screens.
- **Layout:** exactly one dominant primary action; everything else secondary/More.
- **Copy:** verb-led, specific.
- **Anti-pattern:** five equal-weight buttons; "Continue" everywhere.

---

## Pattern adoption priority (for implementation)

1. #7 Smart file picker — unlocks SafeSend, Packs, AI, Tools consistency.
2. #8 Progressive SafeSend + #25 Review-before-sharing.
3. #19 Status badge unification + #21 empty states.
4. #6 Dashboard density pass + #30 one-next-action across feature pages.
5. #15/#16 AI scope labels + draft-review.
</content>
