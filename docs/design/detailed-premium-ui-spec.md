# DueNest — Detailed Premium UI Spec

> The concrete build spec for premium DueNest. It **codifies the system that
> already ships** (tokens/motion in `frontend/src/app/globals.css`, primitives in
> `frontend/src/components/ui/*`) and specifies the rules to apply consistently.
> Where this spec and code disagree, prefer the token — never hardcode hex.
>
> Companion docs: [`design-system.md`](./design-system.md) (token reference),
> [`duenest-premium-pattern-library.md`](./duenest-premium-pattern-library.md)
> (flow patterns), [`product-inspiration-audit.md`](./product-inspiration-audit.md).

## 1. Color system (already in `:root`)

Use semantic token utilities only (`bg-card`, `text-muted-foreground`,
`border-border`, `bg-accent`, `text-brand-amber`).

| Role | Token | Value |
| --- | --- | --- |
| App background | `--background` | `#f7f8fb` (cool off-white, not pure white) |
| Card surface | `--card` | `#ffffff` |
| Quiet fill | `--secondary` / `--muted` | `#eef1f7` |
| Primary text | `--foreground` | `#0b1220` (Midnight Navy) |
| Secondary text | `--muted-foreground` | `#586a85` |
| Brand navy | `--brand-navy` | `#0b1220` |
| Primary action | `--primary` | `#2563eb` (Trust Blue) |
| Ready / success | `--brand-success` | `#22c55e` |
| Brand accent | `--brand-teal` | `#14b8a6` |
| Attention / due | `--brand-amber` | `#f59e0b` |
| Accent surface | `--accent` | `#ccfbf1` (Soft Mint) |
| Destructive | `--destructive` | `#ef4444` |
| Border / input | `--border` | `#e6eaf2` |

**Status color map (canonical):** Ready=success · Due/Expiring=amber ·
Overdue/Revoked/Error=destructive · Shared/Active=primary · Draft/Neutral=muted ·
Private/Original=teal. One primary + one accent; color carries meaning, not
decoration. No rainbow dashboards, no neon, at most one subtle hero gradient.

## 2. Typography scale (use the typed utilities)

Existing utilities in globals.css — prefer these over ad-hoc sizes:
`text-page-title`, `text-page-subtitle`, `text-section-title`, `text-card-title`,
`text-metadata`. Headings use `--font-heading`.

| Use | Size (desktop → mobile) | Weight |
| --- | --- | --- |
| Landing hero H1 | `~2.6rem → 6xl` | 600–700 |
| Landing subhead | 18–22 → 16–18 | 400 |
| Page title | 28–36 → 24–30 | 650–700 |
| Section title | 20–26 | 650–700 |
| Card title | 15–18 | 600–700 |
| Body | 14–16, line-height 1.5–1.7 | 400 |

Rules: every page has a title + one-line explanation. No tiny gray text for
important info. Few weights. Avoid label-uppercase overuse.

## 3. Spacing & layout

Desktop page padding 32–48 · tablet 24–32 · mobile 16–20. Landing section spacing
80–120 desktop / 56–72 mobile. Card padding 20–28 / 16–20 mobile. Card gap 16–24.
Max-width containers (`max-w-6xl` landing, `PageContainer` in app). ≤3–4 primary
dashboard cards above the fold. Whitespace over heavy borders.

## 4. Cards (`components/ui/card.tsx`, `section-card.tsx`)

White bg, subtle `border-border`, radius 18–24 (`rounded-2xl`), padding 20–28,
`shadow-card` default / `shadow-elevated` on hover or `shadow-floating` for hero
moments. Hover = border emphasis or 1–2px lift (`surface-hover`). Every card answers:
what is this? why does it matter? what next? No nested cards, no glass everywhere,
no 5+ inline actions.

## 5. Buttons (`components/ui/button.tsx`, base-ui)

Variants: `default` (primary), `outline`, `secondary`, `ghost`, `destructive`
(subtle tinted, not solid red), `link`. Sizes: `xs/sm/default/lg` + icon variants.
One dominant primary per surface. Verb-led labels ("Upload file", "Save prepared
copy", "Revoke link"). Visible loading + disabled states; explain disabled when not
obvious. On mobile, primary can be sticky bottom. Never 5 buttons on one card.

## 6. Sidebar (`sidebar-nav.tsx` + `lib/navigation.ts`)

Grouped headings (uppercase muted 0.68rem) → leaves + collapsible parents (Vault,
Planning). Active = `bg-accent text-accent-foreground` + left 2px rail; expand
persisted in localStorage; active section auto-expands. Consistent lucide icons.
Target grouping (IA only, all routes already exist): Dashboard · Organize (Vault,
File Inbox) · Prepare (Scan, Tools, Packs) · Track (Deadlines) · Share (SafeSend,
Requests) · Intelligence (AI) · Protection (Emergency) · Teams (Portals) · Settings.

## 7. Topbar (`page-header.tsx`)

Title + optional subtitle left; ONE primary action right; minimal profile menu. No
breadcrumb clutter, no 3+ actions.

## 8. Dashboard layout (`dashboard/page.tsx` — Life Radar)

Readiness summary + one primary (Scan) + ≤2 secondary → Needs attention (3–4) →
Continue preparing → Recent (4–6, "View all") → Quick actions. Skeletons mirror
shape. No 12-widget grid, no vanity charts for normal users.

## 9. Landing layout (`app/(marketing)/page.tsx`)

Existing arc (keep): Hero → TrustBar → Pain → HowItWorks → Connected → LifeRadar →
Vault → SafeSend → Emergency → DeadlinesRenewals → Capabilities → (AI gated) →
Security → Principles → UseCases → FAQ → FinalCTA. Premium work = hero density,
section rhythm, one composed product-story visual. Preserve: private-beta flag
(`PRIVATE_BETA`), AI gate (`AI_ENABLED`), FAQ structured data, a11y, mockups.

## 10. Vault layout

Header "Vault" + subtitle "Your secure home for important documents." Primary
Upload; secondary Scan. Smart views: All · Recent · Expiring · Shared · In packs ·
Prepared · Trash. Filters collapsed. Card = identity + status + one action + More
(Pattern #11). Trust copy: "Private until shared. Original preserved."

## 11. File picker flow (Pattern #7)

Header "Select a document" → search → tabs Recent | Vault | Packs | Upload (Recent
default) → sticky selected summary + Continue. Full-screen sheet on mobile. Reused
by SafeSend, Packs, AI, Fill & Sign, Convert, Requests, Deadline linking.

## 12. SafeSend flow (Pattern #8)

Step 1 What (document / pack / prepared copy / upload) → Step 2 Select (picker) →
Step 3 Access (expiry, allow download, access code, note; advanced collapsed:
watermark, QR style, email required, one-time) → Step 4 Review ("No public link
yet") → Step 5 Link created (link, copy, QR, revoke, manage). Statuses: Active,
Expired, Revoked, Download disabled, Code required. Mobile = full-screen stepper.

## 13. Pack builder flow (Pattern #9)

List card = progress + missing-required + deadline + next action. Detail sections:
Missing → Needs review → Ready → Optional → Export/share. Checklist item = title +
required/optional badge + status + ONE action (Attach/Scan/Generate/Request) + More.
Completion: "This pack is ready to review." Disclaimer: "Generic template.
Requirements vary. Verify with the official source."

## 14. AI flow (Pattern #15/#16)

Home: Ask a document / Ask a pack / Generate / Review suggestions. Default = ask a
selected document. Scope chip "Answering based on: <file>" + Change document.
Answers cite source snippets. Generation = type → context → related → generate →
review → save. Nothing auto-saves. Copy: "Review before saving or sharing."

## 15. Document Tools flow (Pattern #13)

Tool cards (Convert to PDF, PDF to Word, Compress, Merge/Split, Fill & Sign,
Watermark, Export pack) each with icon + outcome + one CTA. Flow: choose tool →
choose document → configure → preview → Save prepared copy → next action. Trust:
"Your original file is preserved."

## 16. Fill & Sign flow (Pattern #26/#27)

Canvas center; compact toolbar (Text, Date, Checkmark, Initials, Signature);
properties panel only when an item is selected; advanced collapsed (saved
signature, audit trail, flatten/export). Save never overwrites original → "Prepared
copy saved. Original preserved." Legal honesty: "This helps prepare a signed copy.
Legal acceptance may depend on the recipient and jurisdiction." Audit shows signer,
method, timestamp, optional hash — "not a legal certificate."

## 17. Requests / Portals flow (Pattern #17/#18)

Request creation: what → who → instructions + due date → review → create link.
Public upload page: logo + title + requested type + requester + instructions +
upload + submit + trust note ("goes only to the requester"). Review: preview →
Accept / Request changes / Save to inbox / Attach to pack. Portal dashboard: review
queue + missing docs + applicants + recent uploads + templates. No payroll/
scheduling/workforce scope.

## 18. Empty state copy (`components/ui/empty-state.tsx`)

- Vault: "Your Vault is empty. Start with one important document." → Upload / Scan.
- File Inbox: "File Inbox is clear. New scans and uploads appear here before you
  organize them."
- Packs: "No packs yet. Prepare documents for a visa, scholarship, job, university,
  travel, or renewal." → Create pack.
- Deadlines: "No deadlines yet. Add expiry dates, renewals, or application
  deadlines so DueNest can remind you." → Add deadline.
- SafeSend: "No shared documents yet. Share sensitive documents with expiry, access
  control, and QR." → Share safely.
- AI: "Select a document to ask questions, extract dates, or generate a draft." →
  Choose document.
- Requests: "No document requests yet. Request missing documents through a secure
  upload link." → Create request.
- Portals: "No portal workspace yet. Collect, review, and track documents from
  applicants or clients." → Create workspace.

## 19. Motion rules (existing utilities)

Timing: hover/press 100–160ms · transitions 150–220ms · modal/drawer 180–260ms ·
success 200–350ms. Use `reveal` (scroll), `cta-sheen` (primary hover), `pulse-soft`
(live dot), `radar-sweep` (Life Radar), `tilt-card` (hero moment), `flow-line`
(connectors), `vault-bar-in`, `quick-share-qr-in`. Always honor
`prefers-reduced-motion` (already gated in globals.css). No confetti, no cartoon
bounce, no motion that delays work.

## 20. Mobile rules

Bottom nav: Dashboard · Vault · Scan · Packs · More. Bottom sheets for actions,
sticky primary CTA, 44px+ targets, cards over tables, full-screen file picker,
modals→sheets, no horizontal overflow, safe-area padding, visible upload/share
progress. SafeSend = step-by-step wizard, never one giant form.

## 21. Anti-patterns to remove

All features at equal weight · file system shown all at once · sharing settings
before item selected · 12-widget dashboards · cards with 5+ actions · "Manage
documents" / "Get started" everywhere · weak gray text for important info ·
excessive badges · nested cards · random gradients · huge landing feature grid ·
fake testimonials · dead "Coming soon" cards · vanity charts · tables on mobile ·
overloaded modals · unclear destructive actions · hidden sharing status · AI
without scope label · Fill & Sign without original-preserved copy · template claims
without disclaimer.

---

## Implementation sequencing (recommended)

Phase 0 (done): branch + these three docs.
Phase 1: Landing hero/rhythm refinement (preserve flags, SEO, a11y, mockups).
Phase 2: Smart file picker (Pattern #7) as a shared component.
Phase 3: Progressive SafeSend + review-before-sharing.
Phase 4: Status badge unification + empty-state standardization.
Phase 5: Dashboard density + one-next-action sweep across feature pages.
Phase 6: AI scope labels, Pack readiness polish, Fill & Sign trust copy.
Phase 7: Mobile bottom-sheet pass + accessibility audit.

Each phase is its own focused, reviewable PR. No phase deletes working backend
wiring or breaks existing routes.
</content>
