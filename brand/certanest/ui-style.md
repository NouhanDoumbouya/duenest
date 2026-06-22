# CertaNest — UI Style

> Foundation only. Direction for the product UI once the rebrand is approved. The
> live design system has not been changed.

## Feel

Premium · calm · organized · trustworthy · warm. Surfaces breathe. One obvious
next action per screen. Security communicated through structure and clarity, not
clutter or alarm.

## Surfaces & color

- **Page background:** Warm Ivory `#F8F6F1` (never pure white).
- **Cards / elevated:** White `#FFFFFF`, rounded, soft shadow, `#E2E8F0` border.
- **Warm fills / sections:** Soft Sand `#EFE7DA` for grouping without hard borders.
- **Text:** Primary Ink `#0B1220`; secondary Slate `#64748B`.
- **Primary action:** Certa Teal `#0F766E`.
- **Success / ready:** Secure Emerald `#10B981`.
- **Premium accent:** Premium Gold `#D6A85A`, thin and rare.
- **Destructive / overdue:** Danger Red `#DC2626`, rare and meaningful.

## Radii & spacing

- Radii: inputs/buttons ~10px, cards ~16px, large surfaces ~20–24px. Soft, rounded,
  never sharp.
- Spacing on an 4/8px rhythm. Prefer more whitespace than less.
- Shadows: layered and subtle (`0 1px 3px` for cards, soft elevation on hover).
  No harsh or colored shadows.

## Components

### Buttons
- **Primary:** Teal fill, White text, rounded 10px, medium weight. Hover: slightly
  darker teal. One per screen.
- **Secondary:** White fill, Ink text, `#E2E8F0` border. Hover: Soft Sand tint.
- **Ghost:** transparent, Ink/Slate text, subtle hover fill.
- **Success:** Emerald fill for confirmation moments only.
- **Destructive:** Danger Red — confirm before irreversible actions.

### Cards
- White, rounded 16px, soft shadow, `#E2E8F0` hairline. Clear title (Manrope 600),
  supporting text (Slate), one obvious action. Avoid badge soup and dense meta.

### Inputs
- White field, `#E2E8F0` border, rounded 10px, Ink text, Slate placeholder.
- Focus: Certa Teal ring (2px, low opacity halo). Error: Danger Red border + helper.
- Always labeled; helper/trust text in Slate beneath.

### Status badges
- **Ready / Verified:** Emerald text on emerald-tint background.
- **Due soon:** Gold/amber-tint background, Ink text.
- **Overdue / Error:** Danger Red text on red-tint background.
- **Neutral / Draft:** Slate text on Sand/mist background.
- Small, rounded-full, quiet. Status communicates state — it does not decorate.

## Progressive disclosure

- Don't show every file, tool, and setting at once. Surface the most important
  action first; reveal advanced options on demand.
- Use review steps before sensitive actions (share, send, delete, emergency).
- Recent-first and search-first for file selection.
- On mobile, use focused flows / bottom sheets — never a squeezed desktop layout.

## Trust patterns

- Show sharing state explicitly: "Private until shared", "No public link yet".
- Preserve originals; label edited/converted/signed copies as copies.
- Review-before-share and review-before-save for anything sensitive or AI-assisted.
- Let users revoke access; make the control visible.

## Don'ts

- ❌ Heavy gradients, neon, random animations.
- ❌ Generic dashboard cards with no next action.
- ❌ Badge overload, cheap shadows, or pure-white anxious backgrounds.
- ❌ Gold as a button or large fill. ❌ Red as decoration.
- ❌ Childish illustrations or literal security clip-art.
