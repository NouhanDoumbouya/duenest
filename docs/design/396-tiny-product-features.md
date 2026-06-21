# DueNest — 396 Tiny Product Features Ledger

> A long-term design/product backlog of 396 small, document-readiness-aligned
> improvements. Every item supports the core promise: **Important documents, ready when
> life asks.** No subscription/finance, no dark patterns, no fake engagement, no
> gamification-for-its-own-sake.
>
> **Status honesty:** statuses are a best-effort first pass from the Phase 1 audit
> (`audit.md`). They were **not** verified by opening every module. `implemented` =
> directly observed in code; `partially implemented` = plausibly present, needs
> confirmation; `deferred` = backlog. Treat the matrix in `component-audit.md` as the
> place to confirm per-module state.
>
> Priority: P0 (critical) · P1 (high) · P2 (medium) · P3 (nice). Effort: XS/S/M/L.
>
> ## ⚠️ Status reconciliation (read this)
>
> The per-row `Status` column below is the **stale first-pass audit** from when this
> ledger was created. A later code-verification pass found that **many rows marked
> "deferred" are in fact already implemented** in the mature app. Confirmed examples:
> File Inbox title + empty-state copy (TF-115/116) exist (`files/page.tsx`); the Vault
> "smart views" (TF-091/092/093/095/097) exist as the documents-page quick-filters
> (`documents/page.tsx`: expiring_soon/shared/needs_attention/pinned…); the "expires soon"
> badge (TF-099) exists (`DocumentStatusBadge`). So "implement them all" is being worked as:
> **build the genuine gaps, mark already-done rows truthfully, never fabricate.** Rows are
> updated to `implemented` only as they are code-verified or built — this is in progress,
> not complete.
>
> **Code-verified present (despite "deferred" rows below):** TF-196 (Trash Undo toast),
> TF-251 (pack readiness ring), TF-260 (SafeSend a pack), TF-261 (pack export ZIP/merged
> PDF), TF-262 (pack cover sheet), TF-138 (scans-stay-private copy), TF-243 (reminder
> channels), TF-321 (request QR), TF-373/374 (export/delete account data), TF-039 (command
> palette), TF-040 (quick "+ new"). **Built this pass:** TF-102 (signed-copy badge),
> TF-309 (QR access-rules note).

## Index

1. Landing (TF-001–024) · 2. Navigation & sidebar (025–038) · 3. Topbar & tabs (039–048)
· 4. Dashboard & first-login (049–066) · 5. Onboarding (067–080) · 6. Auth (081–088)
· 7. Vault (089–114) · 8. File Inbox (115–126) · 9. Scanner (127–140)
· 10. Document detail & cards (141–154) · 11. List/table view (155–162)
· 12. Search/filters/sorting (163–176) · 13. Tags/categories/smart views/metadata (177–190)
· 14. Version history/trash/bulk (191–202) · 15. Document Tools / Convert (203–218)
· 16. Fill & Sign (219–228) · 17. Deadlines & Renewals (229–246)
· 18. Application Packs core (247–266) · 19. Job/Scholarship/Visa/Travel/Emergency packs (267–286)
· 20. SafeSend (287–302) · 21. Custom QR (303–310) · 22. Document Requests (311–324)
· 23. AI (325–352) · 24. Organizations/Portals (353–360) · 25. Founder Console (361–368)
· 26. Settings/Profile/Security (369–380) · 27. Mobile/PWA (381–388)
· 28. Accessibility/Microcopy/States/SEO/Performance (389–396)

---

## 1. Landing page clarity & conversion

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-001 | Landing | Hero headline "Important documents, ready when life asks." | Passes 10-second test | Instant understanding | P0 | XS | partially implemented | Verify exact wording on `(marketing)/page.tsx` |
| TF-002 | Landing | Subheadline naming scan/organize/prepare/track/share | Explains the verbs | Knows what it does | P0 | XS | partially implemented | |
| TF-003 | Landing | Primary CTA "Start with your first document" | Low-commitment first step | Easy entry | P0 | XS | partially implemented | |
| TF-004 | Landing | Secondary CTA "See how DueNest works" | Serves researchers | Choice without pressure | P1 | XS | partially implemented | |
| TF-005 | Landing | Trust line "Private until shared" under hero | Trust before signup | Feels safe | P0 | XS | deferred | |
| TF-006 | Landing | Workflow strip Scan→Organize→Prepare→Track→Share | Shows the loop | Mental model | P0 | S | partially implemented | |
| TF-007 | Landing | Hero visual: Vault→Deadline→Pack→SafeSend→AI flow | Shows it's connected | Sees the product | P1 | M | partially implemented | |
| TF-008 | Landing | Problem section "Stop searching when life is already asking" | Names the pain | Feels seen | P1 | XS | deferred | |
| TF-009 | Landing | Differentiator "not another file storage app" | Category clarity | Knows it's different | P0 | XS | deferred | |
| TF-010 | Landing | Use-case grid (students, visa, scholarship, job, families, agencies) | Emotional relevance | Sees themselves | P0 | M | implemented | 7 use-case pages exist |
| TF-011 | Landing | Scenario quotes labeled "Real document situations" not testimonials | Honesty | Trust | P0 | S | deferred | Must be clearly labeled scenarios |
| TF-012 | Landing | Application Packs section | Key differentiator | Understands value | P1 | S | partially implemented | |
| TF-013 | Landing | Document Tools section | Shows breadth | Sees utility | P2 | S | deferred | |
| TF-014 | Landing | SafeSend section with trust framing | Sharing is a draw | Confidence | P1 | S | deferred | |
| TF-015 | Landing | AI Assistant section with "AI assists, you decide" | Sets expectation | No fear of AI | P1 | S | deferred | |
| TF-016 | Landing | Deadlines & Renewals section | Anxiety reducer | Relief | P1 | S | deferred | |
| TF-017 | Landing | Emergency Access section, serious tone | Sensitive draw | Preparedness | P2 | S | deferred | |
| TF-018 | Landing | FAQ answering "Why not Google Drive?" | Objection handling | Removes doubt | P1 | S | partially implemented | Objection FAQs added per git log |
| TF-019 | Landing | FAQ "Is Fill & Sign legally binding?" honest answer | Honesty | Trust | P0 | XS | deferred | |
| TF-020 | Landing | FAQ "Is my data private?" honest, no overclaim | Trust | Confidence | P0 | XS | deferred | |
| TF-021 | Landing | Final CTA repeating primary action | Conversion | Easy to act | P1 | XS | partially implemented | |
| TF-022 | Landing | Above-the-fold mobile: headline + CTA visible at 360px | Mobile-first | No scroll to act | P0 | S | deferred | Verify per mobile checklist |
| TF-023 | Landing | OG/Twitter metadata per page | Pro link previews | Shareable | P1 | S | implemented | Dynamic OG branch merged |
| TF-024 | Landing | Remove any vague hero ("all-in-one", "future of") | Clarity | No confusion | P1 | XS | deferred | Part of copy sweep |

## 2. Navigation & sidebar

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-025 | Sidebar | Grouped sections (Life admin, Assistant, Prepare & share, Account) | Reduces overload | Finds things | P0 | M | implemented | `lib/navigation.ts` |
| TF-026 | Sidebar | Collapsible parents (Vault, Planning) with persisted state | Less clutter | Personalized | P1 | M | implemented | localStorage persist |
| TF-027 | Sidebar | Active-section auto-expand | Orientation | Knows where they are | P1 | S | implemented | |
| TF-028 | Sidebar | Active leaf accent bar + `aria-current` | Clear active state | Orientation | P1 | XS | implemented | |
| TF-029 | Sidebar | Feature-flagged items hide cleanly when off | No dead links | Clean nav | P1 | S | implemented | `featureKey` |
| TF-030 | Nav | Resolve SafeSend/Quick Share, Application Packs/Bundles label drift | Coherent product | No confusion | P0 | S | deferred | See navigation-map.md |
| TF-031 | Sidebar | Group headings in quiet uppercase micro-label | Hierarchy | Scannable | P2 | XS | implemented | |
| TF-032 | Sidebar | Founder section only for founder access | Security/clarity | Relevant nav | P1 | XS | implemented | |
| TF-033 | Sidebar | Short, specific labels (no "Stuff"/"Manage") | Clarity | Fast scanning | P1 | XS | implemented | |
| TF-034 | Nav | Consistent lucide icon per item | Recognition | Faster nav | P2 | XS | implemented | |
| TF-035 | Sidebar | Keyboard focus rings on all nav controls | A11y | Keyboard users | P1 | XS | implemented | |
| TF-036 | Nav | Breadcrumb or section title in topbar for deep pages | Orientation | Knows location | P2 | S | deferred | |
| TF-037 | Sidebar | Collapse-all / compact mode for power users | Density choice | Control | P3 | M | deferred | |
| TF-038 | Nav | "New" / count badges only when truthful (e.g. inbox count) | Honest signal | Useful nudge | P2 | S | deferred | No fake badges |

## 3. Topbar & tabs

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-039 | Topbar | Global search / command palette entry (⌘K) | Speed | Reach anything fast | P1 | M | partially implemented | `command-palette/` exists |
| TF-040 | Topbar | Quick "+ New" action menu (scan/upload/pack/deadline) | Fewer taps | Fast creation | P1 | S | deferred | |
| TF-041 | Topbar | Account menu with clear sign-out | Standard | Control | P2 | XS | partially implemented | |
| TF-042 | Topbar | Notification entry only if feature on | Relevance | Stays informed | P2 | S | partially implemented | `notification_center` |
| TF-043 | Tabs | Shared `tabs` primitive across modules | Consistency | Familiarity | P0 | M | deferred | Promote `document-tabs` |
| TF-044 | Tabs | Vault smart-view tabs (All/Recent/Expiring/Shared/In packs) | Fast slicing | Finds docs | P1 | M | deferred | |
| TF-045 | Tabs | Bundles tabs (My Packs/Templates/Missing/Ready/Shared/History) | Pack workflow | Clarity | P1 | M | deferred | |
| TF-046 | Tabs | Document Tools tabs (Convert/Compress/Merge/Fill & Sign/Watermark) | Tool grouping | Findable tools | P1 | M | deferred | |
| TF-047 | Tabs | Quick Share tabs (Active/Expiring/Revoked/History/QR) | Link mgmt | Control | P1 | M | deferred | |
| TF-048 | Tabs | Tab state reflected in URL (?view=) for deep-link/back | Shareable state | Predictable | P2 | S | partially implemented | `tabViewParam` exists |

## 4. Dashboard & first-login

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-049 | Dashboard | Title "Your document readiness" + "What needs attention today" | Sets purpose | Focus | P0 | XS | deferred | |
| TF-050 | Dashboard | File Inbox needs-organizing card | Drives organization | Clear next step | P1 | S | partially implemented | |
| TF-051 | Dashboard | Expiring documents card | Anxiety reducer | Stays ready | P0 | S | partially implemented | |
| TF-052 | Dashboard | Upcoming deadlines card | Core value | No missed dates | P0 | S | partially implemented | |
| TF-053 | Dashboard | Incomplete packs card with readiness % | Drives completion | Knows what's left | P1 | S | deferred | |
| TF-054 | Dashboard | Recent scans/documents quick row | Fast return | Continuity | P2 | S | partially implemented | |
| TF-055 | Dashboard | Active SafeSend links card | Awareness | Control | P1 | S | deferred | |
| TF-056 | Dashboard | AI suggestions needing review card | Review-first | Stays in control | P2 | S | deferred | |
| TF-057 | Dashboard | Pending document requests card | Collection flow | No chasing | P2 | S | deferred | |
| TF-058 | Dashboard | Emergency pack status card | Preparedness | Peace of mind | P2 | S | deferred | |
| TF-059 | Dashboard | Each card has explicit next action | One obvious step | Frictionless | P0 | S | deferred | |
| TF-060 | Dashboard | Urgency via amber, never fear/red-everywhere | Calm | Less anxiety | P1 | XS | deferred | |
| TF-061 | First-login | "Welcome to DueNest. Start with one important document." | Reduces overwhelm | Easy start | P0 | S | partially implemented | `readiness-setup` exists |
| TF-062 | First-login | Primary quick actions (Scan/Upload/Create pack/Add deadline) | Fast value | Activation | P0 | S | partially implemented | |
| TF-063 | Dashboard | Remove any subscription/finance/spending widgets | On-brand | No confusion | P0 | S | deferred | Check `subscriptions` route |
| TF-064 | Dashboard | "Last organized today" reassuring micro-line | Calm | Reassurance | P3 | XS | deferred | |
| TF-065 | Dashboard | Skeleton cards on load (no blank dashboard) | Perceived speed | No flash | P1 | S | partially implemented | `skeleton` exists |
| TF-066 | Dashboard | Empty dashboard teaches instead of showing zeros | Activation | Guidance | P1 | S | deferred | |

## 5. Onboarding

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-067 | Onboarding | First screen "What do you want to prepare first?" | Intent routing | Fast value | P0 | M | partially implemented | `onboarding/` + `readiness-setup` |
| TF-068 | Onboarding | Goal options (organize/pack/deadline/scan/share/generate/ask/emergency) | Personalized path | Relevant start | P0 | M | partially implemented | |
| TF-069 | Onboarding | Copy "Start with one document. Organize the rest later." | Reduces overwhelm | Calm start | P0 | XS | deferred | |
| TF-070 | Onboarding | Route Organize→upload/scan→Inbox→Vault | Clear path | Reaches value | P1 | M | partially implemented | |
| TF-071 | Onboarding | Route Pack→choose type→checklist→attach first doc | Activation | Sees the magic | P1 | M | deferred | |
| TF-072 | Onboarding | Route Deadline→create reminder→optional link doc | Quick win | Immediate value | P1 | S | deferred | |
| TF-073 | Onboarding | Skip option always present | Respect autonomy | No lock-in | P1 | XS | partially implemented | |
| TF-074 | Onboarding | Trust copy on sensitive-flow steps (share/emergency) | Trust | Confidence | P1 | XS | deferred | |
| TF-075 | Onboarding | Progress indicator (calm, not gamified) | Orientation | Knows length | P2 | S | deferred | |
| TF-076 | Onboarding | Works fully on mobile | Mobile-first | Phone users | P0 | M | deferred | |
| TF-077 | Onboarding | Resume onboarding if abandoned | Recovery | No lost progress | P2 | S | deferred | |
| TF-078 | Onboarding | First successful action celebrated calmly | Completion delight | Momentum | P2 | XS | deferred | |
| TF-079 | Onboarding | Optional autofill profile setup prompt | Future speed | Faster forms later | P3 | S | deferred | |
| TF-080 | Onboarding | No long mandatory setup before value | Activation | Fast | P0 | S | deferred | |

## 6. Auth pages

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-081 | Auth | Calm, branded login/register layout | Trust at entry | Confidence | P1 | S | partially implemented | `(auth)/*` exist |
| TF-082 | Auth | Google sign-in clearly labeled, backend-verified | Honest auth | Easy + safe | P1 | S | partially implemented | |
| TF-083 | Auth | Inline, specific form errors | Recovery | Less frustration | P1 | S | partially implemented | |
| TF-084 | Auth | Password reset + email verify flows polished | Completeness | Trust | P1 | S | implemented | routes exist |
| TF-085 | Auth | Show/hide password toggle | Usability | Fewer errors | P2 | XS | deferred | |
| TF-086 | Auth | Trust line near signup ("Private until shared") | Trust | Confidence | P2 | XS | deferred | |
| TF-087 | Auth | Loading state on submit (no double-submit) | Reliability | No confusion | P1 | XS | partially implemented | |
| TF-088 | Auth | Clear path back to marketing site | Orientation | No dead end | P3 | XS | partially implemented | |

## 7. Vault

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-089 | Vault | Strong title + "secure home for important documents" framing | Sets meaning | Trust | P1 | XS | deferred | |
| TF-090 | Vault | Smart view: All | Baseline | Browse | P1 | S | partially implemented | |
| TF-091 | Vault | Smart view: Recent | Fast return | Continuity | P1 | S | deferred | |
| TF-092 | Vault | Smart view: Expiring soon | Anxiety reducer | Stays ready | P0 | S | deferred | |
| TF-093 | Vault | Smart view: Shared | Awareness | Control | P1 | S | deferred | |
| TF-094 | Vault | Smart view: In application packs | Cross-link | Context | P1 | S | deferred | |
| TF-095 | Vault | Smart view: Needs review | Quality | Confidence | P2 | S | deferred | |
| TF-096 | Vault | Smart view: Prepared/signed copies | Findable outputs | Speed | P2 | S | deferred | |
| TF-097 | Vault | Smart view: Favorites | Quick access | Speed | P2 | S | deferred | |
| TF-098 | Vault | Smart view: Trash | Recovery | Safety | P1 | S | partially implemented | `trash` route |
| TF-099 | Vault | Badge: Expires soon (amber) | Attention | Stays ready | P0 | S | deferred | |
| TF-100 | Vault | Badge: In N packs | Context | Awareness | P1 | XS | deferred | |
| TF-101 | Vault | Badge: Shared | Awareness | Control | P1 | XS | deferred | |
| TF-102 | Vault | Badge: Prepared copy / Original | Preserve-originals principle | Clarity | P1 | XS | implemented | "Signed copy" badge on prepared copies in the document files list |
| TF-103 | Vault | Badge: Needs review | Quality | Confidence | P2 | XS | deferred | |
| TF-104 | Vault | Quick action: View | Core | Speed | P1 | XS | partially implemented | |
| TF-105 | Vault | Quick action: Rename | Organization | Control | P1 | XS | partially implemented | |
| TF-106 | Vault | Quick action: Add deadline | Cross-feature | Stays ready | P1 | S | deferred | |
| TF-107 | Vault | Quick action: Attach to pack | Cross-feature | Speed | P1 | S | deferred | |
| TF-108 | Vault | Quick action: Convert / Fill & Sign | Cross-feature | Prepare in place | P2 | S | deferred | |
| TF-109 | Vault | Quick action: Ask AI | Cross-feature | Understanding | P2 | S | deferred | |
| TF-110 | Vault | Quick action: Share safely | Cross-feature | Control | P1 | S | deferred | |
| TF-111 | Vault | Quick action: Move to Trash + Undo toast | Recovery | Safety | P1 | S | partially implemented | |
| TF-112 | Vault | Trust copy "Original preserved" / "Private until shared" | Trust | Confidence | P1 | XS | deferred | |
| TF-113 | Vault | Grid + list view toggle | Preference | Comfort | P2 | S | partially implemented | |
| TF-114 | Vault | Vault never feels like a file dump (status + actions on every item) | Readiness over storage | Purposeful | P0 | M | deferred | |

## 8. File Inbox

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-115 | File Inbox | Title + "new scans/uploads waiting to be organized" | Clear purpose | Knows the role | P1 | XS | deferred | |
| TF-116 | File Inbox | Empty state "File Inbox is clear." | Calm | Reassurance | P1 | XS | deferred | |
| TF-117 | File Inbox | Bulk organize (categorize many at once) | Speed | Fast cleanup | P1 | M | deferred | |
| TF-118 | File Inbox | Category suggestions per item | Less typing | Speed | P2 | M | deferred | AI Smart Intake |
| TF-119 | File Inbox | Tag suggestions | Organization | Speed | P2 | S | deferred | |
| TF-120 | File Inbox | Document-type detection suggestion | Smart intake | Less work | P2 | M | deferred | |
| TF-121 | File Inbox | Reminder suggestion from detected dates | Proactive | Stays ready | P1 | M | deferred | |
| TF-122 | File Inbox | Attach to pack from inbox | Cross-feature | Speed | P1 | S | deferred | |
| TF-123 | File Inbox | Move to Vault action | Core flow | Organized | P0 | S | partially implemented | |
| TF-124 | File Inbox | Discard → Trash (not permanent delete) | Recovery | Safety | P1 | XS | deferred | |
| TF-125 | File Inbox | Inbox is staging, not a duplicate Vault | IA clarity | No confusion | P1 | S | deferred | |
| TF-126 | File Inbox | Count badge in nav reflects unorganized items | Honest nudge | Awareness | P2 | S | deferred | |

## 9. Scanner

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-127 | Scanner | "Scan once. Prepare it wherever you need it." framing | Connected, not isolated | Sees value | P1 | XS | deferred | |
| TF-128 | Scanner | Post-scan: Save to File Inbox | Staging | Organized | P1 | S | partially implemented | `ScannerExperience` |
| TF-129 | Scanner | Post-scan: Save to Vault | Direct | Speed | P1 | S | partially implemented | |
| TF-130 | Scanner | Post-scan: Attach to Pack | Cross-feature | Speed | P1 | S | deferred | |
| TF-131 | Scanner | Post-scan: Fill & Sign | Cross-feature | Prepare | P2 | S | deferred | |
| TF-132 | Scanner | Post-scan: Convert/Compress | Cross-feature | Ready output | P2 | S | deferred | |
| TF-133 | Scanner | Post-scan: Share safely | Cross-feature | Control | P2 | S | deferred | |
| TF-134 | Scanner | Post-scan: Add deadline | Cross-feature | Stays ready | P2 | S | deferred | |
| TF-135 | Scanner | Post-scan: Ask AI | Cross-feature | Understanding | P3 | S | deferred | |
| TF-136 | Scanner | Blurry-scan warning + rescan prompt | Quality | Usable scans | P1 | S | deferred | |
| TF-137 | Scanner | Multi-page management (reorder/delete pages) | Real docs | Control | P1 | M | partially implemented | |
| TF-138 | Scanner | Trust line "Scans stay private unless you share" | Trust | Confidence | P1 | XS | deferred | |
| TF-139 | Scanner | Mobile capture button large + thumb-reachable | Mobile-first | Easy capture | P0 | S | deferred | |
| TF-140 | Scanner | Failed-upload recovery (retry, keep local) | Reliability | No lost scans | P1 | S | deferred | |

## 10. Document detail & cards

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-141 | Doc detail | Preview pane/page with clear metadata | Core | Understands doc | P1 | M | partially implemented | `file-preview-dialog` |
| TF-142 | Doc detail | Inline rename | Organization | Control | P1 | XS | partially implemented | |
| TF-143 | Doc detail | Category + tags editable | Organization | Findability | P1 | S | deferred | |
| TF-144 | Doc detail | Expiry/deadline field with reminder | Stays ready | Peace of mind | P0 | S | deferred | |
| TF-145 | Doc detail | "Used in" packs list | Context | Awareness | P1 | S | deferred | |
| TF-146 | Doc detail | Share status + manage links | Control | Awareness | P1 | S | deferred | |
| TF-147 | Doc detail | Activity timeline (added/converted/shared) | Transparency | Trust | P2 | M | partially implemented | `timeline` route |
| TF-148 | Doc detail | Prepared-copy lineage (links to original) | Preserve originals | Clarity | P2 | S | deferred | |
| TF-149 | Doc card | Consistent card: icon, name, type, badges, one primary action | Consistency | Scannable | P0 | M | deferred | |
| TF-150 | Doc card | Overflow ⋯ menu for secondary actions | Density | Clean cards | P1 | S | deferred | |
| TF-151 | Doc card | Hover lift via `.surface-hover` | Tactility | Premium feel | P2 | XS | implemented | utility exists |
| TF-152 | Doc card | Status badge from canonical map | No drift | Clarity | P1 | S | deferred | |
| TF-153 | Doc card | Thumbnail when available, typed icon fallback | Recognition | Speed | P2 | S | partially implemented | |
| TF-154 | Doc card | Long filename truncates without breaking layout | Mobile safety | No overflow | P1 | XS | implemented | `.truncate` min-w fix |

## 11. List / table view

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-155 | Table | Shared `table` primitive | Consistency | Familiarity | P2 | M | deferred | |
| TF-156 | Table | Sortable columns (name/type/expiry/updated) | Control | Finds docs | P2 | S | deferred | |
| TF-157 | Table | Sticky header on scroll | Usability | Orientation | P2 | S | deferred | |
| TF-158 | Table | Row selection for bulk actions | Efficiency | Speed | P1 | S | deferred | |
| TF-159 | Table | Column for status badge | Scan state | Clarity | P2 | XS | deferred | |
| TF-160 | Table | Responsive: collapses to cards on mobile | Mobile-first | Usable | P1 | M | deferred | |
| TF-161 | Table | Density toggle (comfortable/compact) | Preference | Comfort | P3 | S | deferred | |
| TF-162 | Table | Empty/loading states for table view | Polish | No blank | P1 | S | deferred | |

## 12. Search / filters / sorting

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-163 | Search | Global search across documents | Speed | Finds anything | P1 | M | partially implemented | command palette |
| TF-164 | Search | Keyboard hint (⌘K / /) visible | Discoverability | Power users | P2 | XS | deferred | |
| TF-165 | Search | Search by name, type, tag, category | Coverage | Finds docs | P1 | M | deferred | |
| TF-166 | Search | Recent searches | Speed | Continuity | P3 | S | deferred | |
| TF-167 | Search | Empty-result state with suggestion | Recovery | No dead end | P2 | S | deferred | |
| TF-168 | Filters | Filter by expiry window | Stays ready | Focus | P1 | S | deferred | |
| TF-169 | Filters | Filter by shared / in-pack | Context | Control | P2 | S | deferred | |
| TF-170 | Filters | Filter by category/tag | Organization | Findability | P1 | S | deferred | |
| TF-171 | Filters | Active filters shown as removable chips | Transparency | Control | P2 | S | deferred | |
| TF-172 | Filters | Clear-all filters | Recovery | Speed | P2 | XS | deferred | |
| TF-173 | Sorting | Sort by expiry (soonest first) | Anxiety reducer | Stays ready | P1 | S | deferred | |
| TF-174 | Sorting | Sort by recently updated/added | Continuity | Speed | P2 | XS | deferred | |
| TF-175 | Sorting | Sort persists per view | Convenience | Less re-work | P3 | S | deferred | |
| TF-176 | Search | Search reflects in URL for shareable state | Predictable | Deep link | P3 | S | deferred | |

## 13. Tags / categories / smart views / metadata

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-177 | Categories | Sensible default categories (ID, Travel, Finance-docs, Education, Health) | Organization | Fast start | P1 | S | partially implemented | |
| TF-178 | Categories | Custom categories | Flexibility | Personal | P2 | S | deferred | |
| TF-179 | Tags | Free-form tags with suggestions | Findability | Speed | P2 | S | deferred | |
| TF-180 | Tags | Tag color coding (from token map) | Recognition | Scan speed | P3 | S | deferred | |
| TF-181 | Smart views | Saved smart views surface in Vault tabs | Speed | Fast slicing | P1 | M | deferred | |
| TF-182 | Smart views | "Expiring soon" auto-view from deadlines | Anxiety reducer | Stays ready | P0 | M | deferred | |
| TF-183 | Metadata | Editable metadata panel (type, issued, expiry, number) | Useful records | Completeness | P1 | M | deferred | |
| TF-184 | Metadata | Auto-extracted metadata pre-filled (review-first) | Less typing | Speed | P2 | M | deferred | OCR exists (`OCR_DOCUMENT_INTELLIGENCE.md`) |
| TF-185 | Metadata | Document number masked by default (privacy) | Privacy | Safety | P2 | S | deferred | |
| TF-186 | Metadata | Country/issuer field for IDs/passports | Pack matching | Relevance | P3 | S | deferred | |
| TF-187 | Categories | Move document between categories quickly | Organization | Control | P2 | S | deferred | |
| TF-188 | Tags | Bulk tag from selection | Efficiency | Speed | P2 | S | deferred | |
| TF-189 | Smart views | Favorites view | Quick access | Speed | P2 | S | deferred | |
| TF-190 | Metadata | Metadata changes logged in activity timeline | Transparency | Trust | P3 | S | deferred | |

## 14. Version history / trash / bulk

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-191 | Versions | Keep version history when a doc is replaced | Safety | No lost data | P2 | M | deferred | |
| TF-192 | Versions | Restore previous version | Recovery | Safety | P2 | M | deferred | |
| TF-193 | Versions | "Attach new version" on renewal | Stays ready | Continuity | P2 | S | deferred | |
| TF-194 | Trash | Soft delete to Trash with restore | Recovery | Safety | P0 | S | partially implemented | `trash` route |
| TF-195 | Trash | Auto-purge after N days with clear notice | Honesty | No surprises | P2 | S | deferred | |
| TF-196 | Trash | "Moved to Trash. Undo" toast | Recovery delight | Confidence | P1 | S | deferred | |
| TF-197 | Trash | Empty-trash with confirm naming count | Safety | No accidents | P1 | S | deferred | |
| TF-198 | Bulk | Multi-select in grid/list | Efficiency | Speed | P1 | S | deferred | |
| TF-199 | Bulk | Bulk: move to category | Organization | Speed | P2 | S | deferred | |
| TF-200 | Bulk | Bulk: attach to pack | Cross-feature | Speed | P2 | S | deferred | |
| TF-201 | Bulk | Bulk: move to Trash with Undo | Recovery | Safety | P1 | S | deferred | |
| TF-202 | Bulk | Bulk action bar slides in (`.vault-bar-in`) | Polish | Clear mode | P2 | XS | implemented | utility exists |

## 15. Document Tools / Convert & Export

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-203 | Tools | Word→PDF | Common need | Ready output | P1 | M | partially implemented | `file-tools-dialog` |
| TF-204 | Tools | PDF→Word with "formatting may change" warning | Honesty | No surprises | P1 | M | deferred | |
| TF-205 | Tools | Image→PDF | Common need | Ready output | P1 | M | partially implemented | |
| TF-206 | Tools | PDF→Image | Flexibility | Usable output | P2 | M | deferred | |
| TF-207 | Tools | Merge PDFs | Pack building | Complete docs | P1 | M | deferred | |
| TF-208 | Tools | Split PDF / extract pages | Flexibility | Precise docs | P2 | M | deferred | |
| TF-209 | Tools | Reorder/rotate pages | Quality | Clean docs | P2 | M | deferred | |
| TF-210 | Tools | Compress PDF | Sharing limits | Sendable | P1 | M | deferred | |
| TF-211 | Tools | Watermark PDF | Protection | Safer sharing | P2 | M | deferred | |
| TF-212 | Tools | Add cover sheet | Pack polish | Professional | P2 | M | deferred | |
| TF-213 | Tools | "Original preserved. We'll save a prepared copy." note | Preserve originals | Trust | P0 | XS | deferred | |
| TF-214 | Tools | Output → attach to pack | Cross-feature | Speed | P1 | S | deferred | |
| TF-215 | Tools | Output → share safely | Cross-feature | Control | P1 | S | deferred | |
| TF-216 | Tools | Output → download | Core | Usable | P1 | XS | partially implemented | |
| TF-217 | Tools | Tools framed as "document readiness", not random utilities | Positioning | Coherent | P1 | XS | deferred | |
| TF-218 | Tools | Progress indicator during processing | Perceived speed | No anxiety | P1 | S | deferred | |

## 16. Fill & Sign

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-219 | Fill & Sign | Add text fields | Core | Prepares forms | P1 | M | deferred | |
| TF-220 | Fill & Sign | Add date / checkmark / cross | Forms | Completeness | P1 | S | deferred | |
| TF-221 | Fill & Sign | Draw signature | Core | Signs docs | P1 | M | deferred | |
| TF-222 | Fill & Sign | Type signature | Convenience | Speed | P2 | S | deferred | |
| TF-223 | Fill & Sign | Upload signature image | Flexibility | Reuse | P2 | S | deferred | |
| TF-224 | Fill & Sign | Saved signature (opt-in, secure) | Speed | Reuse | P3 | M | deferred | |
| TF-225 | Fill & Sign | Save signed copy (original preserved) | Preserve originals | Trust | P0 | S | deferred | |
| TF-226 | Fill & Sign | Honest note on legal acceptance | No overclaim | Trust | P0 | XS | deferred | |
| TF-227 | Fill & Sign | Output → attach to pack / share | Cross-feature | Speed | P1 | S | deferred | |
| TF-228 | Fill & Sign | Manual field placement on mobile | Mobile-first | Usable anywhere | P2 | M | deferred | |

## 17. Deadlines & Renewals

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-229 | Deadlines | Track document expiry (ID/passport/visa) | Core value | No expiry surprises | P0 | M | partially implemented | `reminders` route |
| TF-230 | Deadlines | Track application/scholarship/job deadlines | Core value | No missed dates | P0 | M | partially implemented | |
| TF-231 | Deadlines | Appointment reminders | Real moments | Preparedness | P1 | S | deferred | |
| TF-232 | Deadlines | Renewal reminders | Stays ready | Continuity | P1 | S | partially implemented | |
| TF-233 | Deadlines | Recurring reminders (allowed wording) | Repeated needs | Less effort | P1 | M | partially implemented | |
| TF-234 | Deadlines | View: Upcoming | Focus | Clarity | P1 | S | partially implemented | |
| TF-235 | Deadlines | View: Overdue | Recovery | Catch-up | P1 | S | deferred | |
| TF-236 | Deadlines | View: Expiring soon | Anxiety reducer | Stays ready | P0 | S | deferred | |
| TF-237 | Deadlines | View: Completed | History | Reassurance | P2 | S | deferred | |
| TF-238 | Deadlines | Calendar + list views | Preference | Orientation | P1 | M | partially implemented | `calendar` route |
| TF-239 | Deadlines | Link document to deadline | Context | Ready doc | P1 | S | deferred | |
| TF-240 | Deadlines | Link pack to deadline | Context | Ready pack | P1 | S | deferred | |
| TF-241 | Deadlines | Mark renewed → prompt attach new version | Stays ready | Continuity | P1 | S | deferred | |
| TF-242 | Deadlines | Snooze / remind later | Flexibility | Control | P2 | S | deferred | |
| TF-243 | Deadlines | Notification preferences (email/in-app) | Control | Right reminders | P1 | M | partially implemented | `NOTIFICATIONS.md` |
| TF-244 | Deadlines | "Stay ready before deadlines become urgent" framing | Calm | Less anxiety | P1 | XS | deferred | |
| TF-245 | Deadlines | Create reminder from extracted document date | Proactive | Less work | P1 | M | deferred | |
| TF-246 | Deadlines | No subscription/finance framing in this module | On-brand | Coherent | P0 | S | deferred | Verify `subscriptions` route |

## 18. Application Packs (core)

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-247 | Packs | Pack list with readiness at a glance | Core differentiator | Knows status | P1 | M | partially implemented | `bundles` route |
| TF-248 | Packs | Pack templates (visa/scholarship/job/university/travel/emergency/custom) | Fast start | Less setup | P1 | M | partially implemented | |
| TF-249 | Packs | Pack creation flow | Core | Builds packs | P0 | M | partially implemented | |
| TF-250 | Packs | Checklist of required/optional items | Clarity | Knows what's needed | P0 | M | partially implemented | |
| TF-251 | Packs | Readiness progress (ring/%) | Motivation | Sees progress | P1 | S | deferred | |
| TF-252 | Packs | Missing-documents count | Clarity | Knows the gap | P0 | S | deferred | |
| TF-253 | Packs | Attach from Vault | Reuse | Speed | P1 | S | deferred | |
| TF-254 | Packs | Attach from File Inbox | Reuse | Speed | P2 | S | deferred | |
| TF-255 | Packs | Scan directly into pack | Fast capture | Speed | P1 | S | deferred | |
| TF-256 | Packs | Generate document into pack | AI assist | Completeness | P2 | M | deferred | `pack-copilot` |
| TF-257 | Packs | Fill & Sign into pack | Prepare | Ready pack | P2 | S | deferred | |
| TF-258 | Packs | Convert/compress into pack | Ready output | Sendable | P2 | S | deferred | |
| TF-259 | Packs | Link deadline to pack | Stays ready | No missed dates | P1 | S | deferred | |
| TF-260 | Packs | SafeSend the whole pack | Sharing | Control | P1 | M | deferred | |
| TF-261 | Packs | Export as ZIP or merged PDF | Submission | Usable output | P1 | M | deferred | |
| TF-262 | Packs | Generate cover sheet | Polish | Professional | P2 | M | deferred | |
| TF-263 | Packs | Pack statuses (Draft/Missing/Ready to review/Ready to share/Shared/Submitted/Archived) | Lifecycle clarity | Knows stage | P1 | M | deferred | |
| TF-264 | Packs | Submission history | Records | Confidence | P2 | M | deferred | |
| TF-265 | Packs | Pack review screen before share/submit | Trust | No mistakes | P1 | M | deferred | |
| TF-266 | Packs | Mobile pack builder usable one-handed | Mobile-first | Anywhere | P1 | M | deferred | |

## 19. Job / Scholarship / Visa / Travel / Emergency packs

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-267 | Job pack | Paste job description | Tailoring | Relevant docs | P2 | S | deferred | |
| TF-268 | Job pack | Job requirement summary | Clarity | Knows needs | P2 | M | deferred | |
| TF-269 | Job pack | ATS-style CV generator (no "guaranteed pass") | Honest help | Stronger CV | P2 | L | deferred | |
| TF-270 | Job pack | Cover letter generator | Speed | Less writing | P2 | M | deferred | |
| TF-271 | Job pack | Supporting docs checklist (certs/transcript/portfolio) | Completeness | Ready pack | P2 | S | deferred | |
| TF-272 | Job pack | Stays inside Packs (not a career platform) | Focus | No scope creep | P1 | XS | deferred | |
| TF-273 | Scholarship | Checklist (transcript/certs/CV/motivation/recommendations/test) | Completeness | Ready pack | P1 | M | deferred | |
| TF-274 | Scholarship | Motivation-letter draft generator (review-first) | Speed | Less stress | P2 | M | deferred | |
| TF-275 | Visa pack | Checklist (passport/form/photo/financial/invitation/insurance/itinerary) | Completeness | Ready pack | P1 | M | deferred | |
| TF-276 | Visa pack | Appointment deadline + expiry reminders | Stays ready | No missed appt | P1 | S | deferred | |
| TF-277 | Visa pack | SafeSend to agency | Sharing | Control | P2 | S | deferred | |
| TF-278 | University | Checklist (transcript/SOP/personal statement/recommendations/portfolio) | Completeness | Ready pack | P2 | M | deferred | |
| TF-279 | Travel pack | Checklist (passport/visa/insurance/tickets/bookings) | Real moment | Travel-ready | P2 | M | deferred | |
| TF-280 | Emergency pack | Critical-document checklist | Preparedness | Peace of mind | P2 | M | partially implemented | `emergency` route |
| TF-281 | All packs | "Requirements vary. Verify with the official source." note | Honesty | No misleading | P0 | XS | deferred | |
| TF-282 | All packs | Template clearly labeled as starting point, not official | Honesty | Trust | P0 | XS | deferred | |
| TF-283 | Packs | Per-template recommended deadlines | Stays ready | Less setup | P3 | S | deferred | |
| TF-284 | Packs | Duplicate a pack as a starting point | Speed | Reuse | P3 | S | deferred | |
| TF-285 | Packs | Pack activity timeline | Transparency | Trust | P3 | M | deferred | |
| TF-286 | Packs | Pack export summary sheet (what's included) | Clarity | Confidence | P2 | S | deferred | |

## 20. SafeSend

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-287 | SafeSend | Empty state "No shared documents yet." + CTA | Activation | Guidance | P1 | XS | deferred | |
| TF-288 | SafeSend | Create-share flow: select doc/pack | Core | Shares safely | P0 | M | partially implemented | `quick-share` route |
| TF-289 | SafeSend | Choose access rules (expiry, code, view/download) | Control | Safe sharing | P0 | M | partially implemented | |
| TF-290 | SafeSend | Review what will be shared before confirm | Trust | No accidents | P0 | S | deferred | |
| TF-291 | SafeSend | Explicit confirm step before link creation | Private-until-shared | Safety | P0 | S | deferred | |
| TF-292 | SafeSend | "No public link has been created yet" state | Trust | Clarity | P0 | XS | deferred | |
| TF-293 | SafeSend | Revoke link anytime | Control | Safety | P0 | S | partially implemented | |
| TF-294 | SafeSend | Expiry on links | Safety | Limits exposure | P1 | S | partially implemented | |
| TF-295 | SafeSend | Password/access code option | Safety | Control | P2 | M | deferred | |
| TF-296 | SafeSend | Watermark prepared copy option | Protection | Safer sharing | P3 | M | deferred | |
| TF-297 | SafeSend | Share history (active/revoked/expired) | Awareness | Control | P1 | M | deferred | |
| TF-298 | SafeSend | Recipient view is clean and trustworthy | Reputation | Recipient trust | P1 | M | partially implemented | `share/`, `rooms/` |
| TF-299 | SafeSend | Mobile sharing flow polished | Mobile-first | Anywhere | P1 | M | deferred | |
| TF-300 | SafeSend | "You can revoke this link" reassurance copy | Trust | Confidence | P1 | XS | deferred | |
| TF-301 | SafeSend | Copy-link + share-sheet integration | Speed | Easy share | P2 | S | partially implemented | |
| TF-302 | SafeSend | Link status badge (Active/Expiring/Revoked/Expired) | Awareness | Control | P1 | S | deferred | |

## 21. Custom QR

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-303 | QR | QR generated from a SafeSend link | Extension not gimmick | Easy share | P1 | S | partially implemented | `customizable-qr-codes` branch |
| TF-304 | QR | Live QR preview updates on style change | Feedback | Confidence | P2 | S | partially implemented | `.quick-share-qr-in` |
| TF-305 | QR | Color contrast warning for scannability | Reliability | Works when scanned | P2 | S | deferred | |
| TF-306 | QR | Logo in center (optional, safe) | Branding | Professional | P3 | M | deferred | |
| TF-307 | QR | Download PNG/SVG/PDF | Flexibility | Usable | P2 | S | deferred | |
| TF-308 | QR | Frame/card styles | Polish | Professional | P3 | M | deferred | |
| TF-309 | QR | "This QR follows your SafeSend access rules" note | Trust | Clarity | P1 | XS | implemented | Added under the QR on the SafeSend detail page |
| TF-310 | QR | Expiry + revoke visible on QR | Safety | Control | P1 | S | deferred | |

## 22. Document Requests

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-311 | Requests | Request a missing document via secure upload link | B2B/personal bridge | No messy email | P1 | M | partially implemented | `requests` route |
| TF-312 | Requests | Upload deadline on request | Stays ready | Timely collection | P1 | S | deferred | |
| TF-313 | Requests | Status tracking (Requested/Uploaded/In review/Accepted/Needs changes/Expired/Revoked) | Clarity | Knows state | P1 | M | deferred | |
| TF-314 | Requests | Reminder to recipient | Less chasing | Efficiency | P2 | S | deferred | |
| TF-315 | Requests | Accept / reject / request changes | Control | Quality | P1 | M | deferred | |
| TF-316 | Requests | Attach received file to pack | Cross-feature | Speed | P1 | S | deferred | |
| TF-317 | Requests | Save received file to File Inbox | Staging | Organized | P2 | S | deferred | |
| TF-318 | Requests | Revoke request | Control | Safety | P2 | S | deferred | |
| TF-319 | Requests | Recipient-friendly upload page (no account needed) | Adoption | Easy for sender | P1 | M | partially implemented | `request/[token]` |
| TF-320 | Requests | Requester notes/instructions on request | Clarity | Right docs | P2 | S | deferred | |
| TF-321 | Requests | Request QR (safe) | Convenience | Easy collection | P3 | S | deferred | |
| TF-322 | Requests | "Request missing documents without messy back-and-forth" framing | Positioning | Value clarity | P2 | XS | deferred | |
| TF-323 | Requests | Bulk requests (multiple recipients) | B2B scale | Efficiency | P3 | M | deferred | |
| TF-324 | Requests | Request templates (checklist-based) | Speed | Less setup | P3 | M | deferred | |

## 23. AI Assistant

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-325 | AI | Default scope = selected document/pack, not whole Vault | Privacy | Safe AI | P0 | S | partially implemented | feature-flagged AI |
| TF-326 | AI | "AI helps you prepare. You stay in control." framing | Trust | No fear | P1 | XS | deferred | |
| TF-327 | AI | Review-first on all AI output | No auto-apply | Control | P0 | S | deferred | |
| TF-328 | AI | Never auto-share AI output | Safety | Trust | P0 | XS | deferred | |
| TF-329 | AI | Smart Intake: suggest category/tags/type | Less work | Speed | P2 | M | partially implemented | OCR intelligence exists |
| TF-330 | AI | Smart Intake: extract key dates → suggest reminder | Proactive | Stays ready | P1 | M | deferred | |
| TF-331 | AI Chat | Chat with a selected document | Understanding | Clarity | P1 | M | partially implemented | `ai_chat` flag |
| TF-332 | AI Chat | Show source snippets/citations if available | Trust | Verifiable | P2 | M | deferred | |
| TF-333 | AI Chat | "AI can make mistakes. Review important details." note | Honesty | Trust | P0 | XS | deferred | |
| TF-334 | AI Ask | Ask-documents Q&A | Understanding | Answers fast | P1 | M | partially implemented | `ai_document_qa` |
| TF-335 | AI | Summarize a document | Speed | Quick grasp | P2 | M | partially implemented | |
| TF-336 | AI | Explain a document simply | Accessibility | Understanding | P2 | M | deferred | |
| TF-337 | AI Draft | Generate CV | Speed | Less writing | P2 | L | partially implemented | `ai_document_drafting` |
| TF-338 | AI Draft | Generate cover letter | Speed | Less writing | P2 | M | deferred | |
| TF-339 | AI Draft | Generate motivation letter | Speed | Less stress | P2 | M | deferred | |
| TF-340 | AI Draft | Generate request/formal email | Speed | Professional | P3 | M | deferred | |
| TF-341 | AI Draft | Improve tone / shorten to word limit | Polish | Better docs | P3 | S | deferred | |
| TF-342 | AI Draft | Output saved as draft (review before use) | Control | Safe | P1 | S | deferred | |
| TF-343 | AI Briefing | Weekly/at-a-glance readiness briefing | Proactive | Stays ahead | P2 | M | partially implemented | `ai_briefing` |
| TF-344 | AI Pack Copilot | Match documents to pack checklist | Completeness | Less work | P2 | M | partially implemented | `ai_pack_copilot` |
| TF-345 | AI Pack Copilot | Suggest missing items for a pack | Clarity | Ready pack | P2 | M | deferred | |
| TF-346 | AI | Cover-sheet generation for a pack | Polish | Professional | P3 | M | deferred | |
| TF-347 | AI | "Review suggestion" explicit state UI | Control | Trust | P1 | S | deferred | |
| TF-348 | AI | AI history (past asks/generations) | Continuity | Reuse | P3 | M | deferred | |
| TF-349 | AI | AI loading state is calm, honest ("Reading your document…") | Perceived speed | Patience | P2 | S | deferred | |
| TF-350 | AI | Clear AI on/off control in settings | Control | Trust | P1 | S | partially implemented | `settings/ai` |
| TF-351 | AI | Never claim AI is official/legal/perfect | Honesty | Trust | P0 | XS | deferred | |
| TF-352 | AI | "If unsure, say so" behavior surfaced honestly | Trust | Reliability | P1 | M | deferred | |

## 24. Organizations / Portals

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-353 | Orgs | Org positioning = request/collect/review documents | Focus | Clear value | P2 | M | partially implemented | `organizations` route |
| TF-354 | Orgs | Document request templates for orgs | Efficiency | Less setup | P2 | M | deferred | |
| TF-355 | Orgs | Applicant/client profiles with checklist status | Clarity | Track progress | P2 | M | partially implemented | `org-room`, `org-request` |
| TF-356 | Orgs | Review status + request changes | Quality | Control | P2 | M | deferred | |
| TF-357 | Orgs | Reminders to applicants | Less chasing | Efficiency | P3 | S | deferred | |
| TF-358 | Orgs | Org branding on request pages | Trust | Professional | P3 | M | deferred | |
| TF-359 | Orgs | No workforce/scheduling/payroll scope | Focus | Stays document-centered | P1 | XS | deferred | |
| TF-360 | Orgs | Roles/permissions if present, least-privilege | Security | Safe access | P2 | M | partially implemented | |

## 25. Founder / Admin Console

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-361 | Founder | Active users metric | Product health | Improves product | P2 | S | partially implemented | `founder` route |
| TF-362 | Founder | Documents/packs/reminders created | Usage truth | Prioritization | P2 | S | partially implemented | |
| TF-363 | Founder | SafeSend links + AI actions counts | Feature usage | Decisions | P2 | S | deferred | |
| TF-364 | Founder | Failed uploads + notification failures | Reliability | Fix issues | P2 | M | deferred | |
| TF-365 | Founder | Error rates + health status | Operability | Stability | P2 | M | partially implemented | |
| TF-366 | Founder | Support feedback inbox | Listen to users | Better product | P2 | M | partially implemented | `feedback` route |
| TF-367 | Founder | Clean charts/cards, no vanity-only metrics | Focus | Actionable | P2 | S | deferred | |
| TF-368 | Founder | Actionable alerts (not just numbers) | Operability | Faster response | P3 | M | deferred | |

## 26. Settings / Profile / Security

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-369 | Settings | Profile + preferences | Standard | Control | P2 | S | partially implemented | `settings` route |
| TF-370 | Settings | Notification preferences | Right reminders | Control | P1 | S | partially implemented | |
| TF-371 | Settings | Privacy/security center | Trust | Confidence | P1 | M | partially implemented | `trust` route |
| TF-372 | Settings | Sessions/devices view | Security | Control | P2 | M | deferred | |
| TF-373 | Settings | Export my data | Trust/portability | Ownership | P2 | M | partially implemented | `settings/data` |
| TF-374 | Settings | Delete account (clear consequences) | Trust | Control | P1 | M | partially implemented | `data-deletion` route |
| TF-375 | Settings | AI preferences (on/off, scope) | Control | Trust | P1 | S | partially implemented | `settings/ai` |
| TF-376 | Settings | SafeSend defaults (expiry, access) | Convenience | Safe defaults | P2 | S | deferred | |
| TF-377 | Settings | QR defaults | Convenience | Speed | P3 | S | deferred | |
| TF-378 | Settings | Signature settings | Reuse | Speed | P3 | S | deferred | |
| TF-379 | Settings | Reminder defaults (lead time) | Stays ready | Less setup | P2 | S | deferred | |
| TF-380 | Settings | Plan & billing clear, honest (no dark patterns on cancel) | Trust | Control | P1 | M | partially implemented | `settings/billing`, `BILLING.md` |

## 27. Mobile / PWA

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-381 | Mobile | Bottom nav for core sections | Mobile-first | Reach fast | P1 | M | implemented | `bottom-nav.tsx` |
| TF-382 | Mobile | Sticky primary action on long screens | Frictionless | Easy to act | P1 | S | deferred | |
| TF-383 | Mobile | Document actions as bottom sheet | Mobile-first | Thumb-friendly | P1 | M | deferred | needs `drawer` primitive |
| TF-384 | Mobile | No horizontal overflow anywhere | Polish | No jank | P0 | S | implemented | `overflow-x: clip` |
| TF-385 | Mobile | 16px input floor (no iOS zoom) | Polish | Smooth forms | P1 | XS | implemented | globals.css |
| TF-386 | PWA | Safe-area insets in standalone | Native feel | Polish | P1 | XS | implemented | globals.css |
| TF-387 | PWA | Offline route + install path | Reliability | Works offline | P2 | M | partially implemented | `/offline`, PWA provider |
| TF-388 | Mobile | Tap targets ≥ 44px audited | A11y | Easy taps | P1 | S | deferred | per mobile checklist |

## 28. Accessibility / Microcopy / States / SEO / Performance

| ID | Area | Description | Why it matters | User benefit | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-389 | A11y | Reduced-motion fallback for all motion | Inclusive | Comfort | P0 | S | implemented | full reduce block |
| TF-390 | A11y | Focus-visible rings everywhere interactive | Keyboard users | Access | P1 | S | partially implemented | strong baseline |
| TF-391 | Microcopy | Canonical button verbs (no generic "Submit") | Coherence | Clarity | P1 | M | deferred | see microcopy-patterns.md |
| TF-392 | States | Every module has loading/empty/error/success | "Feels finished" | Polish | P0 | L | deferred | see component-audit matrix |
| TF-393 | States | Toasts standardized with Undo on reversible actions | Recovery | Confidence | P1 | S | partially implemented | `toast` exists |
| TF-394 | SEO | Title/description/OG per public page | Shareability | Reach | P1 | S | implemented | OG branch merged |
| TF-395 | Performance | Skeletons within 100ms; never blank screens | Perceived speed | Trust | P1 | M | partially implemented | `skeleton` exists |
| TF-396 | Honesty | Codebase copy sweep removes banned/risky claims | Trust | Integrity | P0 | M | deferred | dedicated cleanup phase |

---

## Summary

- **Total:** 396 (TF-001 … TF-396).
- **implemented:** items directly observed in code (motion/reduced-motion, sidebar
  structure & active states, overflow/zoom/safe-area mobile hardening, bottom nav,
  OG metadata, use-case pages, trash route, `.surface-hover`/`.vault-bar-in`).
- **partially implemented:** plausibly present from routes/branches but not verified
  end-to-end (most Vault/Packs/SafeSend/AI/Requests/Settings items).
- **deferred:** backlog — the bulk, intentionally not built in this docs-only branch.

These statuses are a **first pass** and must be confirmed against each module (use the
state-coverage matrix in `component-audit.md`). Nothing here was implemented in code on
this branch — this is the backlog that the implementation phases will draw from.
