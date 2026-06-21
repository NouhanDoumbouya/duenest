# DueNest — 369 Delightful Details Ledger

> 369 small moments of delight that make users feel **calmer, safer, faster, smarter,
> and more in control** — never distracted, manipulated, or addicted. Delight here comes
> from clarity, speed, trust, and craft, not gimmicks. No fake urgency, no dark patterns.
>
> **Status honesty:** statuses are a best-effort first pass from the Phase 1 audit.
> `implemented` = directly observed in `globals.css`/components/navigation;
> `partially implemented` = plausibly present; `deferred` = backlog. Nothing in this
> ledger was built in code on this docs-only branch.
>
> **Delight types:** clarity · speed · trust · visual · motion · microcopy · mobile ·
> recovery · privacy · onboarding · completion · accessibility · power-user.
> Priority: P0–P3. Effort: XS/S/M/L.

## Index

1. Onboarding (DD-001–018) · 2. Dashboard (019–036) · 3. Vault (037–060)
· 4. File Inbox (061–072) · 5. Scanner (073–086) · 6. Document cards & detail (087–102)
· 7. Search & filter (103–114) · 8. Deadlines (115–130) · 9. Application Packs (131–152)
· 10. Document Tools & Fill & Sign (153–168) · 11. SafeSend (169–186) · 12. Custom QR (187–196)
· 13. Document Requests (197–208) · 14. AI (209–230) · 15. Emergency (231–240)
· 16. Organizations & Founder (241–250) · 17. Settings & Profile (251–260)
· 18. Navigation, sidebar & tabs (261–274) · 19. Motion & microinteraction (275–292)
· 20. Microcopy (293–306) · 21. Trust & privacy (307–320) · 22. Recovery (321–332)
· 23. Mobile & PWA (333–346) · 24. Accessibility (347–357) · 25. Completion & power-user (358–369)

---

## 1. Onboarding

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-001 | Onboarding | "Start with one document" reduces first-step pressure | onboarding | Lowers activation barrier | Relieved | P0 | XS | deferred | |
| DD-002 | Onboarding | Goal cards with calm icons, not a wall of fields | clarity | Fast comprehension | Oriented | P1 | S | partially implemented | |
| DD-003 | Onboarding | First successful save gets a calm "Nicely done" | completion | Positive first moment | Encouraged | P2 | XS | deferred | No confetti |
| DD-004 | Onboarding | Skip is always one tap away | trust | Respects autonomy | In control | P1 | XS | partially implemented | |
| DD-005 | Onboarding | Trust line appears the moment a sensitive flow starts | privacy | Pre-empts worry | Safe | P1 | XS | deferred | |
| DD-006 | Onboarding | Progress is shown as a quiet step count, not a game | onboarding | Honest orientation | Calm | P2 | XS | deferred | |
| DD-007 | Onboarding | Picks up where you left off if interrupted | recovery | No lost effort | Reassured | P2 | S | deferred | |
| DD-008 | Onboarding | Example doc names in fields ("Passport", "CV") | clarity | Removes blank-page freeze | Guided | P2 | XS | deferred | |
| DD-009 | Onboarding | Soft reveal of each step (`.content-fade-in`) | motion | Feels alive, not jarring | Calm | P3 | XS | implemented | utility exists |
| DD-010 | Onboarding | "You can change this later" under irreversible-looking choices | microcopy | Reduces decision anxiety | Relaxed | P2 | XS | deferred | |
| DD-011 | Onboarding | Mobile keyboard never hides the primary button | mobile | Frictionless | Smooth | P1 | S | deferred | |
| DD-012 | Onboarding | First deadline auto-suggests a sensible lead time | speed | Less thinking | Helped | P2 | S | deferred | |
| DD-013 | Onboarding | Warm, human welcome line (not corporate) | microcopy | Sets brand tone | Welcomed | P2 | XS | deferred | |
| DD-014 | Onboarding | Goal choice tailors the dashboard you land on | clarity | Immediate relevance | Understood | P1 | M | deferred | |
| DD-015 | Onboarding | Quiet checkmark as each setup item completes | completion | Sense of progress | Satisfied | P2 | XS | deferred | |
| DD-016 | Onboarding | No email-verification wall before first value | speed | Faster activation | Unblocked | P1 | S | deferred | |
| DD-017 | Onboarding | Reassurance that nothing is shared yet | privacy | Trust at the start | Safe | P1 | XS | deferred | |
| DD-018 | Onboarding | A single, obvious next action on the post-onboarding screen | clarity | Momentum | Confident | P0 | S | deferred | |

## 2. Dashboard

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-019 | Dashboard | "What needs attention today" framing | clarity | Focuses the user | Calm | P0 | XS | deferred | |
| DD-020 | Dashboard | Cards order by urgency, calmly (amber not red) | clarity | Right priority | Reassured | P1 | S | deferred | |
| DD-021 | Dashboard | "Nothing needs attention" is a positive, restful state | completion | Reward for being ready | Relieved | P1 | S | deferred | |
| DD-022 | Dashboard | Each card states the next action verb | clarity | Removes guesswork | Confident | P0 | S | deferred | |
| DD-023 | Dashboard | Skeleton cards on load (no blank flash) | speed | Perceived speed | Patient | P1 | S | partially implemented | `skeleton` |
| DD-024 | Dashboard | Live status dot pulses calmly (`.pulse-soft`) | motion | "Always watching" reassurance | Safe | P2 | XS | implemented | utility exists |
| DD-025 | Dashboard | Expiring-soon count shown without alarm | trust | Awareness, not panic | Calm | P1 | XS | deferred | |
| DD-026 | Dashboard | "Last organized today" gentle reassurance | microcopy | Feels on top of things | Reassured | P3 | XS | deferred | |
| DD-027 | Dashboard | Recent documents quick-row for instant return | speed | Fewer clicks | Efficient | P2 | S | partially implemented | |
| DD-028 | Dashboard | Pack readiness ring previews progress at a glance | visual | Motivating clarity | Encouraged | P1 | S | deferred | |
| DD-029 | Dashboard | Active-share count links straight to manage view | clarity | Control | In control | P1 | XS | deferred | |
| DD-030 | Dashboard | Cards lift slightly on hover (`.surface-hover`) | motion | Tactile quality | Premium | P3 | XS | implemented | |
| DD-031 | Dashboard | First-login dashboard teaches instead of showing zeros | onboarding | Activation | Guided | P1 | S | deferred | |
| DD-032 | Dashboard | Time-aware greeting ("Good evening") done tastefully | microcopy | Human warmth | Welcomed | P3 | XS | deferred | |
| DD-033 | Dashboard | Quick-create "+" reachable from anywhere on dashboard | speed | Fast capture | Efficient | P1 | S | deferred | |
| DD-034 | Dashboard | Subtle section reveal on scroll (`.reveal`) | motion | Calm choreography | Calm | P3 | XS | implemented | |
| DD-035 | Dashboard | AI suggestion card always says "review" | trust | Control over AI | Safe | P1 | XS | deferred | |
| DD-036 | Dashboard | No vanity metrics or finance widgets | trust | On-brand focus | Clear | P0 | S | deferred | |

## 3. Vault

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-037 | Vault | Tiny shield icon beside private documents | privacy | Visible safety | Safe | P1 | XS | deferred | |
| DD-038 | Vault | "This file is only in your Vault" private note | privacy | Reassurance | Safe | P1 | XS | deferred | |
| DD-039 | Vault | Badge "Used in 2 packs" gives context at a glance | clarity | Awareness | Informed | P1 | XS | deferred | |
| DD-040 | Vault | "Expires soon" amber badge, calm not alarming | clarity | Right urgency | Aware | P0 | XS | deferred | |
| DD-041 | Vault | Soft transition when a file moves Inbox→Vault | motion | Satisfying organization | Satisfied | P2 | S | deferred | |
| DD-042 | Vault | Hover preview of document status | clarity | Faster understanding | Efficient | P2 | S | deferred | |
| DD-043 | Vault | Typed icon fallback is brand-tasteful, not generic | visual | Recognizable | Calm | P2 | S | partially implemented | |
| DD-044 | Vault | Quick action row appears on hover/focus only | clarity | Clean by default | Calm | P2 | S | deferred | |
| DD-045 | Vault | "Original preserved" note after any processing | trust | Preserve-originals promise | Reassured | P0 | XS | deferred | |
| DD-046 | Vault | Smart view chips remember your last choice | speed | Less repetition | Efficient | P3 | S | deferred | |
| DD-047 | Vault | Favorite toggles with a gentle, instant response | motion | Tactile feedback | Pleased | P3 | XS | deferred | |
| DD-048 | Vault | Empty Vault invites one action, not many | onboarding | No overwhelm | Calm | P1 | XS | deferred | |
| DD-049 | Vault | Prepared-copy badge links back to the original | clarity | Lineage clarity | Oriented | P2 | S | deferred | |
| DD-050 | Vault | Long filenames truncate gracefully with full name on hover | clarity | No layout break | Calm | P1 | XS | partially implemented | `.truncate` fix |
| DD-051 | Vault | Selecting items reveals a calm bottom action bar | motion | Clear mode change | In control | P2 | XS | implemented | `.vault-bar-in` |
| DD-052 | Vault | "Removed from pack. File not deleted." reassurance | recovery | Prevents fear | Reassured | P1 | XS | deferred | |
| DD-053 | Vault | Drag-to-reorder feels smooth where supported | motion | Tactile control | Pleased | P3 | M | deferred | |
| DD-054 | Vault | Category color accents are subtle, not loud | visual | Calm organization | Calm | P3 | S | deferred | |
| DD-055 | Vault | Expiry shown as friendly relative time ("in 3 weeks") | microcopy | Human readability | Clear | P2 | S | deferred | |
| DD-056 | Vault | Shared documents show who/what scope at a glance | privacy | Awareness | In control | P1 | S | deferred | |
| DD-057 | Vault | Grid↔list toggle animates without reflow jank | motion | Polish | Smooth | P3 | S | deferred | |
| DD-058 | Vault | "Needs review" badge invites, doesn't nag | microcopy | Gentle nudge | Calm | P2 | XS | deferred | |
| DD-059 | Vault | Recently added items get a brief, subtle highlight | motion | Find what's new | Oriented | P3 | S | deferred | |
| DD-060 | Vault | Vault feels like a calm home, not a file dump | visual | Emotional core | Safe | P0 | M | deferred | |

## 4. File Inbox

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-061 | File Inbox | "File Inbox is clear" empty state feels rewarding | completion | Reward for tidiness | Satisfied | P1 | XS | deferred | |
| DD-062 | File Inbox | Suggested category appears as a one-tap chip | speed | Less typing | Helped | P2 | S | deferred | |
| DD-063 | File Inbox | Organizing an item slides it out smoothly | motion | Satisfying clearing | Satisfied | P2 | S | deferred | |
| DD-064 | File Inbox | Count quietly decreases as you organize | clarity | Visible progress | Encouraged | P2 | XS | deferred | |
| DD-065 | File Inbox | Bulk-organize feels fast and reversible | recovery | Confidence | In control | P1 | S | deferred | |
| DD-066 | File Inbox | Detected document type shown for confirmation | trust | Review-first | Reassured | P2 | S | deferred | |
| DD-067 | File Inbox | Swipe to file on mobile (with undo) | mobile | Fast triage | Efficient | P2 | M | deferred | |
| DD-068 | File Inbox | "We'll suggest a reminder" hint when a date is found | speed | Proactive help | Helped | P1 | S | deferred | |
| DD-069 | File Inbox | Discard goes to Trash, with reassurance | recovery | No accidental loss | Safe | P1 | XS | deferred | |
| DD-070 | File Inbox | Inbox clearly framed as temporary staging | clarity | No IA confusion | Oriented | P1 | XS | deferred | |
| DD-071 | File Inbox | Newest uploads appear at top instantly (optimistic) | speed | Responsive feel | Pleased | P2 | S | deferred | |
| DD-072 | File Inbox | Gentle nudge only when items have waited a while | microcopy | Helpful, not naggy | Calm | P3 | S | deferred | |

## 5. Scanner

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-073 | Scanner | Edge-detection feels instant and accurate | speed | Trustworthy capture | Confident | P1 | M | partially implemented | |
| DD-074 | Scanner | Soft warning on blurry scan with one-tap rescan | recovery | Quality without frustration | Helped | P1 | S | deferred | |
| DD-075 | Scanner | Capture button gives a subtle haptic/visual pulse | motion | Tactile confirmation | Satisfied | P2 | XS | deferred | |
| DD-076 | Scanner | Page thumbnails reorder with a smooth drag | motion | Control | Pleased | P2 | M | deferred | |
| DD-077 | Scanner | "Scan stays private unless you share it" line | privacy | Reassurance | Safe | P1 | XS | deferred | |
| DD-078 | Scanner | Post-scan actions are one tap, contextual | speed | Frictionless next step | Efficient | P1 | S | deferred | |
| DD-079 | Scanner | Auto-crop preview before saving | clarity | Confidence in result | Reassured | P2 | S | partially implemented | |
| DD-080 | Scanner | Multi-page count shown clearly | clarity | Orientation | Oriented | P2 | XS | deferred | |
| DD-081 | Scanner | Failed upload keeps the scan locally, offers retry | recovery | No lost work | Reassured | P1 | S | deferred | |
| DD-082 | Scanner | Mobile controls sit in the thumb zone | mobile | One-handed use | Comfortable | P1 | S | deferred | |
| DD-083 | Scanner | Calm "scan" sweep motif while processing | motion | Perceived activity | Patient | P3 | S | implemented | `.live-scan` |
| DD-084 | Scanner | Brightness/contrast auto-enhance toggle | clarity | Readable scans | Pleased | P2 | M | deferred | |
| DD-085 | Scanner | "Saved to File Inbox" confirmation with next action | completion | Closure + momentum | Satisfied | P1 | XS | deferred | |
| DD-086 | Scanner | Re-scan a single page without redoing all | speed | Less rework | Relieved | P2 | M | deferred | |

## 6. Document cards & detail

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-087 | Doc card | Status badge color matches the canonical map | visual | Consistent meaning | Oriented | P1 | S | deferred | |
| DD-088 | Doc card | Hover lift + soft shadow signals interactivity | motion | Tactile quality | Premium | P3 | XS | implemented | `.surface-hover` |
| DD-089 | Doc card | Overflow menu opens fast, closes on Escape | speed | Power-user smoothness | Efficient | P2 | S | deferred | |
| DD-090 | Doc detail | Preview loads progressively, not blank-then-pop | speed | Perceived speed | Patient | P2 | S | deferred | |
| DD-091 | Doc detail | "Used in" packs are clickable chips | clarity | Easy context jump | Oriented | P2 | S | deferred | |
| DD-092 | Doc detail | Inline rename with instant optimistic save | speed | Responsive | Pleased | P1 | S | deferred | |
| DD-093 | Doc detail | Expiry field offers a "remind me" toggle right there | speed | One-step readiness | Helped | P1 | S | deferred | |
| DD-094 | Doc detail | Activity timeline reads like a calm story | trust | Transparency | Reassured | P2 | M | partially implemented | `timeline` |
| DD-095 | Doc detail | Sensitive fields (numbers) masked, reveal on intent | privacy | Safety | Safe | P2 | S | deferred | |
| DD-096 | Doc card | Thumbnail corner shows file type subtly | clarity | Fast recognition | Efficient | P3 | S | deferred | |
| DD-097 | Doc detail | Prepared-copy banner links to the original | trust | Lineage clarity | Oriented | P2 | S | deferred | |
| DD-098 | Doc card | Keyboard-focusable with visible ring | accessibility | Keyboard users | Included | P1 | XS | partially implemented | |
| DD-099 | Doc detail | Download shows a brief progress, then a checkmark | completion | Closure | Satisfied | P2 | S | deferred | |
| DD-100 | Doc detail | Share status panel states link health plainly | privacy | Awareness | In control | P1 | S | deferred | |
| DD-101 | Doc card | Selected state is unmistakable yet calm | clarity | No mis-selection | Confident | P2 | XS | deferred | |
| DD-102 | Doc detail | "Set expiry reminder" contextual quick action | speed | Readiness in one tap | Helped | P1 | S | deferred | |

## 7. Search & filter

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-103 | Search | ⌘K opens search instantly from anywhere | speed | Power-user reach | Efficient | P1 | M | partially implemented | command palette |
| DD-104 | Search | Keyboard hint shown subtly near the search box | power-user | Discoverability | Empowered | P2 | XS | deferred | |
| DD-105 | Search | Results appear as you type, debounced and smooth | speed | Responsive | Pleased | P1 | M | deferred | |
| DD-106 | Search | Empty result suggests a next action, not a void | recovery | No dead end | Reassured | P2 | S | deferred | |
| DD-107 | Filter | Active filters shown as removable chips | clarity | Transparency | In control | P2 | S | deferred | |
| DD-108 | Filter | "Clear all" resets in one tap | speed | Fast recovery | Efficient | P2 | XS | deferred | |
| DD-109 | Search | Recent searches offered on focus | speed | Less typing | Efficient | P3 | S | deferred | |
| DD-110 | Search | Matching text highlighted in results | clarity | Faster scanning | Oriented | P2 | S | deferred | |
| DD-111 | Filter | Expiring filter is one tap from anywhere in Vault | speed | Anxiety reducer | Calm | P1 | S | deferred | |
| DD-112 | Search | Search remembers scope (this pack vs all) | clarity | Predictable | Confident | P2 | S | deferred | |
| DD-113 | Search | Keyboard arrows navigate results, Enter opens | power-user | Mouse-free flow | Empowered | P2 | S | deferred | |
| DD-114 | Filter | Filter state survives back-navigation | recovery | No lost context | Reassured | P3 | S | deferred | |

## 8. Deadlines

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-115 | Deadlines | Friendly relative dates ("in 5 days") | microcopy | Human readability | Clear | P1 | S | deferred | |
| DD-116 | Deadlines | "Create reminder from this date" on extracted dates | speed | Proactive readiness | Helped | P1 | S | deferred | |
| DD-117 | Deadlines | Amber for soon, calm slate for distant | visual | Right urgency | Calm | P1 | XS | deferred | |
| DD-118 | Deadlines | Overdue framed as recoverable, not shaming | microcopy | Reduces guilt | Reassured | P1 | XS | deferred | |
| DD-119 | Deadlines | Mark renewed prompts attaching the new version | trust | Keeps Vault current | Reassured | P1 | S | deferred | |
| DD-120 | Deadlines | Snooze offers sensible presets | speed | Less fiddling | Efficient | P2 | S | deferred | |
| DD-121 | Deadlines | Calendar dots use brand status colors | visual | Scannable | Oriented | P2 | S | partially implemented | `calendar` |
| DD-122 | Deadlines | Completed deadlines feel quietly satisfying | completion | Reward | Satisfied | P2 | S | deferred | |
| DD-123 | Deadlines | Linked document is one tap away | clarity | Context | Oriented | P1 | S | deferred | |
| DD-124 | Deadlines | Lead-time default is smart per document type | speed | Less setup | Helped | P2 | M | deferred | |
| DD-125 | Deadlines | "You're ahead of this one" positive note when early | microcopy | Encouragement | Confident | P3 | XS | deferred | |
| DD-126 | Deadlines | Reminder channel clearly shown (email/in-app) | trust | No surprises | In control | P1 | S | partially implemented | |
| DD-127 | Deadlines | Recurring reminders read as "renewal", never "subscription" | microcopy | On-brand | Clear | P0 | XS | deferred | |
| DD-128 | Deadlines | Adding a deadline confirms with the next reminder date | completion | Closure | Reassured | P2 | XS | deferred | |
| DD-129 | Deadlines | Timeline view tells a calm chronological story | visual | Orientation | Calm | P2 | M | partially implemented | `timeline` |
| DD-130 | Deadlines | Passport/ID expiry gets a gentle early heads-up | trust | Avoids late panic | Reassured | P1 | S | deferred | |

## 9. Application Packs

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-131 | Packs | Calm "Ready" checkmark when a pack hits 100% | completion | Earned reward | Proud | P0 | S | deferred | |
| DD-132 | Packs | Tiny progress ring on each pack card | visual | Glanceable status | Oriented | P1 | S | deferred | |
| DD-133 | Packs | "You're almost ready — one item left" copy | microcopy | Gentle motivation | Encouraged | P1 | XS | deferred | |
| DD-134 | Packs | Missing items listed plainly, no red overload | clarity | Right urgency | Calm | P1 | S | deferred | |
| DD-135 | Packs | "Attach from Vault" reuses existing docs in one tap | speed | Less rework | Efficient | P1 | S | deferred | |
| DD-136 | Packs | "Scan directly into this pack" shortcut | speed | Fast capture | Efficient | P1 | S | deferred | |
| DD-137 | Packs | Checklist item checks off with a satisfying tick | motion | Progress feedback | Satisfied | P2 | XS | deferred | |
| DD-138 | Packs | Required vs optional clearly distinguished | clarity | No over-worry | Calm | P1 | S | deferred | |
| DD-139 | Packs | Pack review screen shows exactly what's included | trust | No surprises | Confident | P1 | M | deferred | |
| DD-140 | Packs | "Generate cover sheet" gives a polished finish | completion | Professional output | Proud | P2 | M | deferred | |
| DD-141 | Packs | Export bundles into a clean, named file | clarity | Submission-ready | Confident | P1 | M | deferred | |
| DD-142 | Packs | Duplicate-a-pack to reuse a proven structure | speed | Less setup | Efficient | P3 | S | deferred | |
| DD-143 | Packs | Status chips read the pack's lifecycle plainly | clarity | Orientation | Oriented | P1 | S | deferred | |
| DD-144 | Packs | "Requirements vary — verify officially" honest note | trust | No misleading | Reassured | P0 | XS | deferred | |
| DD-145 | Packs | Template picker previews what's inside before you commit | clarity | Informed choice | Confident | P2 | M | deferred | |
| DD-146 | Packs | Convert/Fill & Sign happen inside the pack flow | speed | No context switch | Efficient | P2 | S | deferred | |
| DD-147 | Packs | Linked deadline shows on the pack header | clarity | Stays ready | Aware | P1 | S | deferred | |
| DD-148 | Packs | "SafeSend this pack" reuses your share defaults | speed | Fast, safe sharing | Efficient | P1 | S | deferred | |
| DD-149 | Packs | Mobile pack builder is one-handed and smooth | mobile | Build anywhere | Comfortable | P1 | M | deferred | |
| DD-150 | Packs | Reordering pack items is a smooth drag | motion | Control | Pleased | P3 | M | deferred | |
| DD-151 | Packs | Submission history reads as reassuring receipts | trust | Confidence | Reassured | P2 | M | deferred | |
| DD-152 | Packs | Reaching "Ready to share" feels like a milestone | completion | Emotional payoff | Proud | P1 | S | deferred | |

## 10. Document Tools & Fill & Sign

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-153 | Tools | "Original preserved" note after every conversion | trust | Preserve-originals promise | Reassured | P0 | XS | deferred | |
| DD-154 | Tools | Progress with honest stage labels while processing | speed | Perceived speed | Patient | P1 | S | deferred | |
| DD-155 | Tools | "Saved as prepared copy" labeled output | clarity | No confusion | Oriented | P1 | XS | deferred | |
| DD-156 | Tools | PDF→Word warns formatting may change, calmly | trust | Honest expectations | Reassured | P1 | XS | deferred | |
| DD-157 | Tools | Output offers next actions (attach/share/download) | speed | Momentum | Efficient | P1 | S | deferred | |
| DD-158 | Tools | Compression shows before/after size | clarity | Visible value | Pleased | P2 | S | deferred | |
| DD-159 | Tools | Merge preview shows page order before commit | clarity | No mistakes | Confident | P2 | M | deferred | |
| DD-160 | Tools | Tools grouped as "document readiness", not a junk drawer | visual | Coherence | Calm | P1 | S | deferred | |
| DD-161 | Fill & Sign | Signature draws smoothly with a natural feel | motion | Tactile quality | Pleased | P2 | M | deferred | |
| DD-162 | Fill & Sign | Saved signature reused with consent | speed | Less repetition | Efficient | P3 | M | implemented | Drawing once saves it locally; reuse with one tap next time |
| DD-163 | Fill & Sign | Honest note on legal acceptance, no overclaim | trust | Integrity | Reassured | P0 | XS | deferred | |
| DD-164 | Fill & Sign | Fields snap to sensible positions | speed | Less fiddling | Efficient | P2 | M | deferred | |
| DD-165 | Fill & Sign | "Signed copy saved, original preserved" confirmation | completion | Closure + trust | Reassured | P1 | XS | deferred | |
| DD-166 | Fill & Sign | Mobile field placement is forgiving | mobile | Usable on phone | Comfortable | P2 | M | deferred | |
| DD-167 | Tools | Undo available right after a tool action | recovery | Safety | In control | P2 | S | deferred | |
| DD-168 | Tools | Cover-sheet adds a calm, branded finishing touch | visual | Professional output | Proud | P2 | M | deferred | |

## 11. SafeSend

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-169 | SafeSend | "No public link yet" reassuring default state | privacy | Private-until-shared | Safe | P0 | XS | deferred | |
| DD-170 | SafeSend | Review screen shows exactly what will be shared | trust | No accidents | Confident | P0 | S | deferred | |
| DD-171 | SafeSend | Explicit confirm before any link exists | privacy | Safety | In control | P0 | S | deferred | |
| DD-172 | SafeSend | Subtle success animation when a link is created | motion | Calm closure | Satisfied | P2 | S | partially implemented | QR pop exists |
| DD-173 | SafeSend | "You can revoke this anytime" reassurance | trust | Ongoing control | Reassured | P1 | XS | deferred | |
| DD-174 | SafeSend | Link status badge (Active/Expiring/Revoked/Expired) | clarity | Awareness | In control | P1 | S | deferred | |
| DD-175 | SafeSend | Revoke gives immediate, clear confirmation | recovery | Control | Reassured | P1 | S | deferred | |
| DD-176 | SafeSend | Access rules explained in plain language | clarity | Understanding | Confident | P1 | S | deferred | |
| DD-177 | SafeSend | Copy-link shows a brief "Copied" acknowledgment | microcopy | Feedback | Pleased | P2 | XS | deferred | |
| DD-178 | SafeSend | Expiry shown in human terms ("expires in 7 days") | microcopy | Readability | Clear | P1 | XS | deferred | |
| DD-179 | SafeSend | Recipient view feels trustworthy and branded | trust | Sender's reputation | Confident | P1 | M | partially implemented | |
| DD-180 | SafeSend | Watermark option previewed before sharing | privacy | Protection | Safe | P3 | M | deferred | |
| DD-181 | SafeSend | Active links surface gently on the dashboard | clarity | Awareness | In control | P1 | S | deferred | |
| DD-182 | SafeSend | Share sheet integration on mobile | mobile | Native feel | Efficient | P2 | S | partially implemented | |
| DD-183 | SafeSend | A revoked link's recipient page is graceful, not broken | recovery | Professionalism | Reassured | P2 | S | deferred | |
| DD-184 | SafeSend | Default expiry pre-selected for safety | privacy | Safe default | Safe | P1 | XS | deferred | |
| DD-185 | SafeSend | "Private until shared" appears at the decision point | privacy | Trust where it counts | Safe | P0 | XS | deferred | |
| DD-186 | SafeSend | History reads as a calm, reassuring log | trust | Transparency | In control | P2 | M | deferred | |

## 12. Custom QR

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-187 | QR | QR preview updates smoothly on style change | motion | Responsive craft | Pleased | P2 | S | partially implemented | `.quick-share-qr-in` |
| DD-188 | QR | Contrast warning keeps it scannable | clarity | Reliability | Reassured | P2 | S | deferred | |
| DD-189 | QR | "This QR follows your SafeSend rules" note | trust | Clarity | Confident | P1 | XS | deferred | |
| DD-190 | QR | Active QR card has a soft live ring | visual | "It's live" cue | Reassured | P3 | XS | implemented | `.quick-share-active-ring` |
| DD-191 | QR | Download formats are clearly labeled | clarity | No guesswork | Efficient | P2 | XS | deferred | |
| DD-192 | QR | Logo placement keeps the code readable | visual | Brand + function | Pleased | P3 | M | deferred | |
| DD-193 | QR | Expiry/revoke status visible on the QR view | privacy | Control | In control | P1 | S | deferred | |
| DD-194 | QR | Print-card layout looks polished | visual | Professional | Proud | P3 | M | deferred | |
| DD-195 | QR | Entrance pop is calm and fast | motion | Premium feel | Pleased | P3 | XS | implemented | `.quick-share-qr-in` |
| DD-196 | QR | Copy reminds the QR is as private as the link | privacy | No oversharing | Safe | P1 | XS | deferred | |

## 13. Document Requests

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-197 | Requests | Recipient page is simple, no account needed | clarity | Easy for others | Reassured | P1 | M | partially implemented | `request/[token]` |
| DD-198 | Requests | Status badges read plainly (Uploaded/In review/Accepted) | clarity | Awareness | In control | P1 | S | deferred | |
| DD-199 | Requests | "Request without messy back-and-forth" framing | microcopy | Value clarity | Relieved | P2 | XS | deferred | |
| DD-200 | Requests | Received file one tap to attach to a pack | speed | Less rework | Efficient | P1 | S | deferred | |
| DD-201 | Requests | Gentle reminder to recipient, not nagging | microcopy | Respectful | Calm | P2 | S | deferred | |
| DD-202 | Requests | Upload confirmation reassures the recipient | trust | Closure | Reassured | P1 | XS | deferred | |
| DD-203 | Requests | Requester notes appear clearly on the upload page | clarity | Right docs | Confident | P2 | S | deferred | |
| DD-204 | Requests | Deadline shown kindly to the recipient | microcopy | Clarity | Aware | P2 | XS | deferred | |
| DD-205 | Requests | "Needs changes" includes a clear reason field | clarity | Faster resolution | Helped | P2 | S | deferred | |
| DD-206 | Requests | Revoke a request gracefully closes the link | recovery | Control | In control | P2 | S | deferred | |
| DD-207 | Requests | Accept gives both sides a calm confirmation | completion | Closure | Satisfied | P1 | XS | deferred | |
| DD-208 | Requests | Mobile upload from a phone camera is seamless | mobile | Easy for recipient | Efficient | P1 | M | deferred | |

## 14. AI

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-209 | AI | "AI helps you prepare. You stay in control." line | trust | Sets the relationship | Safe | P1 | XS | deferred | |
| DD-210 | AI | Calm, honest loading ("Reading your document…") | speed | Perceived progress | Patient | P2 | S | deferred | |
| DD-211 | AI | Suggestions arrive in a clear "Review" state | trust | No auto-apply | In control | P0 | S | deferred | |
| DD-212 | AI | Source snippets shown so answers feel verifiable | trust | Trustworthy AI | Reassured | P2 | M | deferred | |
| DD-213 | AI | "AI can make mistakes — review details" reminder | trust | Honesty | Reassured | P0 | XS | deferred | |
| DD-214 | AI | Default scope is the selected doc, shown explicitly | privacy | No surprise access | Safe | P0 | S | deferred | |
| DD-215 | AI | Extracted dates become one-tap reminders | speed | Proactive readiness | Helped | P1 | S | deferred | |
| DD-216 | AI | Generated drafts saved as drafts, never auto-used | trust | Control | Safe | P1 | S | deferred | |
| DD-217 | AI | Answer text streams in smoothly, readable pace | motion | Natural feel | Engaged | P2 | M | deferred | |
| DD-218 | AI | "Accept suggestion" requires a deliberate tap | trust | Intentional control | In control | P1 | XS | deferred | |
| DD-219 | AI | Tag/category suggestions appear as dismissible chips | clarity | Easy review | Efficient | P2 | S | deferred | |
| DD-220 | AI | Pack Copilot highlights exactly what's missing | clarity | Actionable | Helped | P2 | M | deferred | |
| DD-221 | AI | Word-limit shortening shows the new count | clarity | Confidence | Reassured | P3 | S | deferred | |
| DD-222 | AI | "If unsure, I'll say so" honest behavior surfaced | trust | Reliability | Reassured | P1 | M | deferred | |
| DD-223 | AI | Briefing reads like a calm weekly summary | clarity | Stay-ahead value | Reassured | P2 | M | partially implemented | `ai_briefing` |
| DD-224 | AI | Easy on/off toggle in settings, clearly explained | trust | Control | In control | P1 | S | partially implemented | `settings/ai` |
| DD-225 | AI | Never claims to be official, legal, or perfect | trust | Integrity | Reassured | P0 | XS | deferred | |
| DD-226 | AI | Copy/insert AI output requires user action | trust | Control | Safe | P1 | XS | deferred | |
| DD-227 | AI | Chat remembers the document context within a session | clarity | Continuity | Efficient | P2 | M | deferred | |
| DD-228 | AI | Regenerate option without losing the previous answer | recovery | Safe exploration | In control | P2 | S | deferred | |
| DD-229 | AI | Empty AI state suggests selecting a document first | onboarding | Clear entry | Guided | P1 | XS | deferred | |
| DD-230 | AI | AI output clearly labeled as draft, review-first | trust | No mistaken finality | Reassured | P0 | XS | deferred | |

## 15. Emergency

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-231 | Emergency | Serious, calm tone — never playful | trust | Matches the stakes | Reassured | P1 | XS | deferred | |
| DD-232 | Emergency | Critical-document checklist is clear and short | clarity | Focus | Calm | P2 | S | partially implemented | `emergency` route |
| DD-233 | Emergency | Trusted-contact setup explains exactly what they'll see | privacy | Informed consent | In control | P1 | M | deferred | |
| DD-234 | Emergency | Read-only emergency view is unmistakable | privacy | No accidental edits | Safe | P1 | S | deferred | |
| DD-235 | Emergency | Access rules and revoke are front-and-center | privacy | Control | In control | P1 | S | deferred | |
| DD-236 | Emergency | "Prepare critical documents for trusted access" framing | microcopy | Clear purpose | Reassured | P2 | XS | deferred | |
| DD-237 | Emergency | Activity log shows any access calmly | trust | Transparency | Reassured | P2 | M | deferred | |
| DD-238 | Emergency | Mobile emergency view loads fast under stress | mobile | Works when it matters | Relieved | P1 | M | deferred | |
| DD-239 | Emergency | Setup confirms what's protected, plainly | completion | Peace of mind | Reassured | P2 | S | deferred | |
| DD-240 | Emergency | Minimal, distraction-free emergency layout | visual | Clarity under pressure | Calm | P1 | S | deferred | |

## 16. Organizations & Founder

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-241 | Orgs | Applicant checklist status shown at a glance | clarity | Track progress | Oriented | P2 | M | partially implemented | |
| DD-242 | Orgs | Request templates speed up common collections | speed | Less setup | Efficient | P2 | M | deferred | |
| DD-243 | Orgs | Org branding makes request pages feel trustworthy | trust | Recipient trust | Confident | P3 | M | deferred | |
| DD-244 | Orgs | "Request changes" is constructive, not harsh | microcopy | Better relationships | Calm | P2 | S | deferred | |
| DD-245 | Orgs | Document-centered scope, never workforce creep | trust | Focus | Clear | P1 | XS | deferred | |
| DD-246 | Founder | Health status reads green/amber/red with labels | clarity | Fast triage | Confident | P2 | S | partially implemented | |
| DD-247 | Founder | Charts are calm and readable, not cluttered | visual | Decisions | Clear | P2 | M | deferred | |
| DD-248 | Founder | Actionable alerts link to the issue | speed | Faster fixes | Efficient | P3 | M | deferred | |
| DD-249 | Founder | Feedback inbox surfaces real user voice | trust | Build the right thing | Motivated | P2 | M | partially implemented | `feedback` |
| DD-250 | Founder | Failed-upload alerts help protect user trust | trust | Reliability | Responsible | P2 | M | deferred | |

## 17. Settings & Profile

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-251 | Settings | Each section explains what it controls plainly | clarity | Understanding | Confident | P2 | S | partially implemented | |
| DD-252 | Settings | Notification preferences preview the result | clarity | No surprises | In control | P1 | S | deferred | |
| DD-253 | Settings | "Export my data" is easy to find and honest | trust | Ownership | Reassured | P2 | M | partially implemented | `settings/data` |
| DD-254 | Settings | Delete account states consequences clearly | trust | Informed control | In control | P1 | M | partially implemented | `data-deletion` |
| DD-255 | Settings | Cancel/downgrade has no dark patterns | trust | Integrity | Respected | P1 | M | deferred | |
| DD-256 | Settings | SafeSend defaults make safe sharing the default | privacy | Safe by default | Safe | P2 | S | deferred | |
| DD-257 | Settings | Reminder lead-time default is sensible | speed | Less setup | Helped | P2 | S | deferred | |
| DD-258 | Settings | Saved changes confirm quietly, no full reload | speed | Responsive | Pleased | P2 | S | deferred | |
| DD-259 | Settings | AI preferences explain scope and control | trust | Confidence | In control | P1 | S | partially implemented | `settings/ai` |
| DD-260 | Settings | Trust & security center reads as reassuring | trust | Confidence | Safe | P1 | M | partially implemented | `trust` route |

## 18. Navigation, sidebar & tabs

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-261 | Sidebar | Active item has a clear accent bar | clarity | Orientation | Oriented | P1 | XS | implemented | |
| DD-262 | Sidebar | Collapsible groups remember your preference | power-user | Personalized | In control | P2 | S | implemented | localStorage |
| DD-263 | Sidebar | Chevron rotates smoothly on expand/collapse | motion | Tactile feedback | Pleased | P3 | XS | implemented | `rotate-90` transition |
| DD-264 | Sidebar | Active section auto-expands on navigation | clarity | No hunting | Oriented | P1 | S | implemented | |
| DD-265 | Nav | Icons aid recognition without shouting | visual | Faster scanning | Calm | P2 | XS | implemented | |
| DD-266 | Tabs | Tab switch is instant, no layout jump | speed | Smoothness | Pleased | P1 | S | deferred | |
| DD-267 | Tabs | Active tab underline/indicator is clear and calm | clarity | Orientation | Oriented | P1 | XS | deferred | |
| DD-268 | Tabs | Tab state in URL enables back/share | power-user | Predictable | Empowered | P2 | S | partially implemented | `tabViewParam` |
| DD-269 | Nav | Quiet uppercase group labels organize the sidebar | visual | Hierarchy | Calm | P2 | XS | implemented | |
| DD-270 | Nav | Feature-off items disappear cleanly, no dead links | clarity | Tidy nav | Calm | P1 | S | implemented | featureKey |
| DD-271 | Nav | Keyboard focus moves logically through nav | accessibility | Keyboard users | Included | P1 | S | partially implemented | |
| DD-272 | Nav | Mobile bottom nav keeps core sections one tap away | mobile | Reach fast | Efficient | P1 | M | implemented | `bottom-nav` |
| DD-273 | Nav | Hover states are subtle, never distracting | visual | Calm | Calm | P2 | XS | implemented | |
| DD-274 | Nav | Founder section appears only when relevant | clarity | Relevant nav | Focused | P1 | XS | implemented | |

## 19. Motion & microinteraction

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-275 | Motion | Content fades up gently on mount (180ms) | motion | Calm entrance | Calm | P3 | XS | implemented | `.content-fade-in` |
| DD-276 | Motion | Scroll reveals are calm and shorter on mobile | motion | No drift | Calm | P2 | S | implemented | `.reveal` mobile tune |
| DD-277 | Motion | Cards lift on hover, settle on press | motion | Tactility | Premium | P3 | XS | implemented | `.surface-hover` |
| DD-278 | Motion | Bottom bars slide up, never pop harshly | motion | Smoothness | Pleased | P2 | XS | implemented | `.vault-bar-in` |
| DD-279 | Motion | Live status dot pulse is slow and calm | motion | "Watching" reassurance | Safe | P3 | XS | implemented | `.pulse-soft` |
| DD-280 | Motion | Hero "scan" sweep suggests constant readiness | motion | Brand motif | Reassured | P3 | S | implemented | `.live-scan` |
| DD-281 | Motion | Radar sweep reinforces "always watching" | motion | Signature delight | Reassured | P3 | S | implemented | `.radar-sweep` |
| DD-282 | Motion | 2.5D tilt adds depth on capable pointers | motion | Craft | Delighted | P3 | M | implemented | `.tilt-card` |
| DD-283 | Motion | CTA sheen sweeps once on hover | motion | Premium polish | Pleased | P3 | XS | implemented | `.cta-sheen` |
| DD-284 | Motion | Flow connectors draw in as a section reveals | motion | Storytelling | Engaged | P3 | S | implemented | `.flow-line` |
| DD-285 | Motion | Every animation honors reduced-motion | accessibility | Inclusive delight | Respected | P0 | S | implemented | full reduce block |
| DD-286 | Motion | Durations stay in the 150–260ms sweet spot | motion | Fast, not sluggish | Pleased | P1 | S | implemented | per design-system |
| DD-287 | Motion | Inbox→Vault move animates the transition | motion | Satisfying organization | Satisfied | P2 | S | deferred | |
| DD-288 | Motion | Trash delete winds down, doesn't just vanish | motion | Closure + safety | Reassured | P2 | S | deferred | |
| DD-289 | Motion | Undo restore eases the item back in | recovery | Reassurance | Relieved | P2 | S | deferred | |
| DD-290 | Motion | Pack readiness ring animates toward 100% | motion | Progress payoff | Encouraged | P2 | S | deferred | |
| DD-291 | Motion | Upload progress is smooth and honest | motion | Trust in process | Patient | P1 | S | deferred | |
| DD-292 | Motion | No confetti, no bounce, no childish effects | visual | Premium restraint | Calm | P1 | XS | deferred | guardrail |

## 20. Microcopy

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-293 | Microcopy | Specific button verbs ("Share safely", "Add deadline") | microcopy | Clarity | Confident | P1 | M | deferred | |
| DD-294 | Microcopy | Consequences stated before destructive actions | microcopy | No surprises | In control | P0 | S | deferred | |
| DD-295 | Microcopy | "Saved as prepared copy" reassures | microcopy | Preserve-originals | Reassured | P1 | XS | deferred | |
| DD-296 | Microcopy | Errors say what happened and how to recover | recovery | No dead ends | Helped | P1 | S | deferred | |
| DD-297 | Microcopy | Empty states teach the next action | onboarding | Activation | Guided | P1 | S | deferred | |
| DD-298 | Microcopy | Relative dates everywhere ("in 3 weeks") | clarity | Readability | Clear | P2 | S | deferred | |
| DD-299 | Microcopy | Calm, human tone — serious but warm | microcopy | Brand feel | Welcomed | P1 | M | deferred | |
| DD-300 | Microcopy | No hype, no fear, no fake urgency words | trust | Integrity | Respected | P0 | S | deferred | |
| DD-301 | Microcopy | Tooltips on sensitive flows explain, don't lecture | clarity | Understanding | Reassured | P2 | S | deferred | |
| DD-302 | Microcopy | Success copy points to the next useful step | completion | Momentum | Confident | P1 | S | deferred | |
| DD-303 | Microcopy | "Private until shared" used consistently | privacy | Trust pattern | Safe | P0 | XS | deferred | |
| DD-304 | Microcopy | Numbers/labels match across product and marketing | clarity | Coherence | Confident | P1 | M | deferred | resolve name drift |
| DD-305 | Microcopy | Loading copy is honest about what's happening | trust | Patience | Reassured | P2 | XS | deferred | |
| DD-306 | Microcopy | No "Submit"/"Click here"/"Learn more" everywhere | microcopy | Specificity | Oriented | P1 | M | deferred | |

## 21. Trust & privacy

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-307 | Privacy | Shield icon marks private documents | privacy | Visible safety | Safe | P1 | XS | deferred | |
| DD-308 | Privacy | Clear "what will be shared" before every share | privacy | No accidents | In control | P0 | S | deferred | |
| DD-309 | Privacy | Revoke is always visible on shared items | privacy | Ongoing control | Reassured | P1 | S | deferred | |
| DD-310 | Trust | No compliance/security overclaims anywhere | trust | Integrity | Respected | P0 | M | deferred | honesty sweep |
| DD-311 | Trust | Honest AI limitations stated where AI appears | trust | Reliability | Reassured | P0 | S | deferred | |
| DD-312 | Privacy | Sensitive numbers masked by default | privacy | Safety | Safe | P2 | S | deferred | |
| DD-313 | Trust | Activity timelines provide transparency | trust | Confidence | Reassured | P2 | M | partially implemented | |
| DD-314 | Trust | Consequences of delete/sign/send never hidden | trust | Honesty | In control | P0 | S | deferred | |
| DD-315 | Privacy | Default expiry on shares limits exposure | privacy | Safe default | Safe | P1 | XS | deferred | |
| DD-316 | Trust | Templates labeled as starting points, not official | trust | No misleading | Reassured | P0 | XS | deferred | |
| DD-317 | Trust | "You stay in control" reinforced in AI flows | trust | Reassurance | Safe | P1 | XS | deferred | |
| DD-318 | Privacy | Emergency access shows exactly what contacts see | privacy | Informed consent | In control | P1 | M | deferred | |
| DD-319 | Trust | No fake testimonials/numbers anywhere | trust | Integrity | Respected | P0 | M | deferred | scenario quotes only |
| DD-320 | Trust | Security center reads honestly about what's done | trust | Confidence | Reassured | P1 | M | partially implemented | |

## 22. Recovery

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-321 | Recovery | "Moved to Trash. Undo" toast | recovery | Forgiving | Reassured | P1 | S | deferred | |
| DD-322 | Recovery | Restore from Trash is one tap | recovery | Safety | Relieved | P1 | S | partially implemented | `trash` |
| DD-323 | Recovery | Undo on most reversible actions | recovery | Confidence | In control | P1 | S | deferred | |
| DD-324 | Recovery | Failed uploads keep the file and offer retry | recovery | No lost work | Reassured | P1 | S | deferred | |
| DD-325 | Recovery | Auto-saved drafts so nothing is lost | recovery | Safety | Reassured | P2 | M | deferred | |
| DD-326 | Recovery | Network-error states offer a clear retry | recovery | No dead end | Helped | P1 | S | deferred | |
| DD-327 | Recovery | "Removed from pack. File not deleted." reassurance | recovery | Prevents fear | Reassured | P1 | XS | deferred | |
| DD-328 | Recovery | Confirm dialogs name the exact consequence | recovery | No accidents | In control | P0 | S | partially implemented | `confirm-dialog` |
| DD-329 | Recovery | Regenerate AI without losing the prior result | recovery | Safe exploration | In control | P2 | S | deferred | |
| DD-330 | Recovery | Revoked-link recipients see a graceful message | recovery | Professionalism | Reassured | P2 | S | deferred | |
| DD-331 | Recovery | Session expiry returns you to where you were | recovery | Continuity | Relieved | P2 | M | deferred | |
| DD-332 | Recovery | Friendly-but-serious error voice, never blaming | microcopy | Calm under failure | Reassured | P1 | S | deferred | |

## 23. Mobile & PWA

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-333 | Mobile | Sticky primary action stays in reach | mobile | Frictionless | Efficient | P1 | S | deferred | |
| DD-334 | Mobile | Document actions open as a bottom sheet | mobile | Thumb-friendly | Comfortable | P1 | M | deferred | needs drawer primitive |
| DD-335 | Mobile | No horizontal overflow on any screen | mobile | Polish | Calm | P0 | S | implemented | `overflow-x: clip` |
| DD-336 | Mobile | Inputs never trigger iOS zoom | mobile | Smooth forms | Pleased | P1 | XS | implemented | 16px floor |
| DD-337 | Mobile | Taps respond instantly (no 300ms delay) | speed | Responsive | Pleased | P1 | XS | implemented | `touch-action` |
| DD-338 | PWA | Safe-area insets respected when installed | mobile | Native feel | Pleased | P1 | XS | implemented | env insets |
| DD-339 | PWA | Overscroll chaining tamed in standalone | mobile | Native feel | Pleased | P2 | XS | implemented | overscroll-behavior |
| DD-340 | Mobile | Swipe-friendly tabs where it helps | mobile | Fluid navigation | Efficient | P2 | M | deferred | |
| DD-341 | Mobile | Large, reachable tap targets (≥44px) | accessibility | Easy taps | Comfortable | P1 | S | deferred | audit |
| DD-342 | Mobile | AI chat input stays above the keyboard | mobile | Usable input | Efficient | P1 | S | deferred | |
| DD-343 | Mobile | Modals become full-height sheets on phones | mobile | Native feel | Comfortable | P2 | M | deferred | |
| DD-344 | PWA | Offline route is calm and informative | recovery | No scary error | Reassured | P2 | S | partially implemented | `/offline` |
| DD-345 | PWA | Install prompt is honest and dismissible | trust | No nag pattern | Respected | P2 | S | partially implemented | |
| DD-346 | Mobile | Skeletons on slow connections, never blank | speed | Perceived speed | Patient | P1 | S | partially implemented | `skeleton` |

## 24. Accessibility

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-347 | A11y | Visible, elegant focus rings everywhere | accessibility | Keyboard users included | Included | P1 | S | partially implemented | `ring-ring/50` |
| DD-348 | A11y | Escape closes overlays predictably | accessibility | Keyboard flow | Empowered | P1 | S | deferred | |
| DD-349 | A11y | Status announced to screen readers (aria-live) | accessibility | Equal awareness | Included | P1 | M | deferred | |
| DD-350 | A11y | Color never the only signal (icon + label) | accessibility | Color-blind safe | Included | P1 | S | deferred | |
| DD-351 | A11y | Logical heading order on every page | accessibility | SR navigation | Included | P1 | S | deferred | |
| DD-352 | A11y | Icon-only buttons have clear aria-labels | accessibility | SR clarity | Included | P1 | S | deferred | |
| DD-353 | A11y | Reduced-motion users get static, full content | accessibility | Comfort | Respected | P0 | S | implemented | reduce block |
| DD-354 | A11y | Pinch-zoom stays enabled | accessibility | Low-vision support | Respected | P1 | XS | implemented | not blocked |
| DD-355 | A11y | Form errors linked and announced | accessibility | Recoverable | Helped | P1 | S | deferred | |
| DD-356 | A11y | Skip-to-content link on shells | accessibility | Keyboard speed | Empowered | P2 | S | deferred | |
| DD-357 | A11y | Sufficient contrast on text and status colors | accessibility | Readability | Included | P1 | M | deferred | verify AA |

## 25. Completion & power-user

| ID | Area | Description | Delight type | Why it matters | User emotion | Priority | Effort | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DD-358 | Completion | Calm "Ready" milestone when a pack completes | completion | Earned payoff | Proud | P1 | S | deferred | |
| DD-359 | Completion | "You're all caught up" restful dashboard state | completion | Reward for readiness | Relieved | P1 | S | deferred | |
| DD-360 | Completion | Quiet checkmarks as checklist items finish | completion | Visible progress | Satisfied | P2 | XS | deferred | |
| DD-361 | Power-user | ⌘K command palette reaches any action | power-user | Speed | Empowered | P1 | M | partially implemented | exists |
| DD-362 | Power-user | Keyboard shortcuts for common actions | power-user | Efficiency | Empowered | P2 | M | deferred | |
| DD-363 | Power-user | Shortcut hints surfaced subtly, not intrusively | power-user | Discoverability | Empowered | P2 | S | deferred | |
| DD-364 | Power-user | Recent items quick-jump | power-user | Continuity | Efficient | P2 | S | deferred | |
| DD-365 | Power-user | Bulk actions for repetitive work | power-user | Efficiency | Efficient | P1 | S | deferred | |
| DD-366 | Completion | Sharing confirmation closes the loop calmly | completion | Closure | Reassured | P1 | XS | deferred | |
| DD-367 | Completion | Renewing a document feels resolved, not just edited | completion | Emotional payoff | Relieved | P2 | S | deferred | |
| DD-368 | Power-user | Deep-linkable views (tab/filter in URL) | power-user | Shareable state | Empowered | P2 | S | partially implemented | |
| DD-369 | Completion | The product consistently rewards being *ready* | completion | Core emotional promise | At peace | P0 | M | deferred | the north star |

---

## Summary

- **Total:** 369 (DD-001 … DD-369).
- **implemented:** the motion system and its reduced-motion fallbacks, sidebar/nav
  active-state and persistence delights, and mobile/PWA hardening — directly observed in
  `globals.css`, `sidebar-nav.tsx`, `lib/navigation.ts`, and PWA components.
- **partially implemented:** delights tied to existing routes/features not verified
  end-to-end.
- **deferred:** the bulk — backlog for the implementation phases.

These statuses are a **first pass**. No delight was implemented in code on this docs-only
branch. The north star (DD-369) holds the whole ledger together: DueNest should reward
users for being **ready**.
