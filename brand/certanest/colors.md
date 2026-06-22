# CertaNest — Color Palette

> Foundation only. These tokens are previewed in the internal brand-preview route
> but are **not** yet wired into the production design system (`globals.css`).

## Core palette

| Token | Name | Hex | Role |
| --- | --- | --- | --- |
| `--ink` | Primary Ink | `#0B1220` | Primary text, headings, dark surfaces |
| `--teal` | Certa Teal | `#0F766E` | Primary brand, primary buttons, links |
| `--emerald` | Secure Emerald | `#10B981` | Success, "ready", verified, proof |
| `--ivory` | Warm Ivory | `#F8F6F1` | Default page background |
| `--sand` | Soft Sand | `#EFE7DA` | Subtle section fills, warm cards |
| `--slate` | Slate Text | `#64748B` | Secondary / muted text |
| `--mist` | Border Mist | `#E2E8F0` | Borders, dividers, hairlines |
| `--gold` | Premium Gold | `#D6A85A` | Premium accent — sparingly only |
| `--danger` | Danger Red | `#DC2626` | Errors, destructive, overdue |
| `--white` | White | `#FFFFFF` | Cards, elevated surfaces |

## Usage rules

- **Backgrounds are Warm Ivory**, not pure white. White is reserved for cards and
  elevated surfaces so the UI feels layered and calm.
- **Teal is the primary action color.** Use it for primary buttons, active states,
  and links. Do not overuse — one obvious primary action per screen.
- **Emerald means "ready / proven / success."** Reserve it for positive,
  confirmed, secure states (ready, verified, sent safely, completed).
- **Gold is a whisper, not a shout.** Use only as a thin accent for premium tiers,
  highlights, or small marks. Never as a button fill or large area.
- **Danger Red is rare and meaningful** — overdue deadlines, destructive actions,
  validation errors. Never decorative.
- **Slate for secondary text**, Border Mist for hairlines. Keep contrast high
  enough for accessibility (body text on ivory should be Ink or Slate, not lighter).

## Suggested semantic mapping (for a future design-system pass)

```txt
background        → Warm Ivory   #F8F6F1
surface / card    → White        #FFFFFF
surface-muted     → Soft Sand    #EFE7DA
foreground        → Primary Ink  #0B1220
muted-foreground  → Slate Text   #64748B
border            → Border Mist  #E2E8F0
primary           → Certa Teal   #0F766E
primary-foreground→ White        #FFFFFF
success           → Secure Emerald #10B981
accent (premium)  → Premium Gold #D6A85A
destructive       → Danger Red   #DC2626
```

## Accessibility notes

- Ink `#0B1220` on Ivory `#F8F6F1` → very high contrast (body & headings ✓).
- Slate `#64748B` on Ivory → use for secondary text at ≥14px; avoid for tiny text.
- White text on Teal `#0F766E` → passes for buttons/labels ✓.
- White text on Emerald `#10B981` → acceptable for badges; for body prefer Ink.
- Gold `#D6A85A` is a low-contrast accent — never use for essential text.
