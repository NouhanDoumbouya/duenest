# Subscription brand logos

Drop-in folder for curated subscription logos used by the Subscription Radar.

## How it works

Each curated template in `src/lib/subscription-templates.ts` has a stable `key`
(e.g. `netflix`, `spotify`, `microsoft-365`). To show a real logo for a
template:

1. Add an SVG (or PNG) here named after the key, e.g. `brand-logos/netflix.svg`.
2. Set `logoPath: "/brand-logos/netflix.svg"` on that template.

`SubscriptionAvatar` will render the asset and automatically fall back to a calm
brand-colored monogram if the file is missing or fails to load — so the UI never
shows a broken image.

## Important

- Use only logo assets you are licensed to use. **Do not hotlink** logos from
  external sites, and do not commit trademarked assets you don't have rights to.
- Logos are used purely as visual identifiers for a user's own subscription
  tracking. **CertaNest is not affiliated with these brands.**
- Until a real asset is added, templates display a brand-colored monogram, which
  is intentional and fully supported.

## Recommended format

- SVG, square viewbox, transparent background, ~24–48px optical size.
- Keep file size small; prefer simple marks over full lockups.
