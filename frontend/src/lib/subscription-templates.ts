// Curated quick-add templates for common subscriptions. Selecting one pre-fills
// the add form (never the price — amounts vary by plan/region) and records a
// stable `provider_key` so the subscription can show a brand accent/logo later.
//
// Brand colors and names are used purely as visual identifiers for the user's
// own tracking. DueNest is not affiliated with any of these brands.

import type { BillingCycle, SubscriptionInput } from "@/types/subscriptions";

// Display groups shown in the picker, in the order they should appear.
export const TEMPLATE_GROUPS = [
  "Streaming",
  "AI & productivity",
  "Cloud & storage",
  "Developer & tools",
  "Domains & hosting",
  "Bills & life",
  "Education",
  "Insurance",
] as const;

export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

export interface SubscriptionTemplate {
  /** Stable key stored on the subscription as `provider_key`. */
  key: string;
  name: string;
  provider: string;
  /** Extra search terms so "office" finds Microsoft 365, etc. */
  aliases: string[];
  /** Category slug — matched to a seeded SubscriptionCategory at prefill time. */
  categorySlug: string;
  group: TemplateGroup;
  website_url: string;
  billing_cycle: BillingCycle;
  reminder_days_before: number;
  auto_renew: boolean;
  /** Brand accent (hex) used for a subtle, calm avatar tint. */
  brandColor: string;
  /** Optional local SVG, served from /public. Falls back to a monogram. */
  logoPath?: string;
  isPopular?: boolean;
}

// Two-letter monogram for the fallback avatar.
function monogram(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const SUBSCRIPTION_TEMPLATES: SubscriptionTemplate[] = [
  // Streaming
  { key: "netflix", name: "Netflix", provider: "Netflix", aliases: ["netflix"], categorySlug: "streaming", group: "Streaming", website_url: "https://www.netflix.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#E50914", isPopular: true },
  { key: "spotify", name: "Spotify", provider: "Spotify", aliases: ["spotify", "spot"], categorySlug: "streaming", group: "Streaming", website_url: "https://www.spotify.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#1DB954", isPopular: true },
  { key: "youtube-premium", name: "YouTube Premium", provider: "Google", aliases: ["youtube", "yt", "youtube premium"], categorySlug: "streaming", group: "Streaming", website_url: "https://www.youtube.com/premium", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#FF0000", isPopular: true },
  { key: "disney-plus", name: "Disney+", provider: "Disney", aliases: ["disney", "disney plus", "disney+"], categorySlug: "streaming", group: "Streaming", website_url: "https://www.disneyplus.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#1A3FCB" },
  { key: "prime-video", name: "Amazon Prime Video", provider: "Amazon", aliases: ["prime", "amazon prime", "prime video"], categorySlug: "streaming", group: "Streaming", website_url: "https://www.primevideo.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#1FAAE2" },
  { key: "apple-music", name: "Apple Music", provider: "Apple", aliases: ["apple music", "music"], categorySlug: "streaming", group: "Streaming", website_url: "https://music.apple.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#FA2D48" },

  // AI & productivity
  { key: "chatgpt", name: "ChatGPT", provider: "OpenAI", aliases: ["chatgpt", "openai", "gpt", "chat gpt"], categorySlug: "software", group: "AI & productivity", website_url: "https://chatgpt.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#10A37F", isPopular: true },
  { key: "canva", name: "Canva", provider: "Canva", aliases: ["canva"], categorySlug: "software", group: "AI & productivity", website_url: "https://www.canva.com", billing_cycle: "yearly", reminder_days_before: 14, auto_renew: true, brandColor: "#00C4CC", isPopular: true },
  { key: "notion", name: "Notion", provider: "Notion", aliases: ["notion"], categorySlug: "software", group: "AI & productivity", website_url: "https://www.notion.so", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#111111" },
  { key: "figma", name: "Figma", provider: "Figma", aliases: ["figma", "design"], categorySlug: "software", group: "AI & productivity", website_url: "https://www.figma.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#F24E1E" },
  { key: "adobe", name: "Adobe Creative Cloud", provider: "Adobe", aliases: ["adobe", "photoshop", "creative cloud"], categorySlug: "software", group: "AI & productivity", website_url: "https://www.adobe.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#ED1C24" },
  { key: "microsoft-365", name: "Microsoft 365", provider: "Microsoft", aliases: ["microsoft 365", "office 365", "m365", "office"], categorySlug: "software", group: "AI & productivity", website_url: "https://www.microsoft.com/microsoft-365", billing_cycle: "yearly", reminder_days_before: 14, auto_renew: true, brandColor: "#D83B01" },
  { key: "google-workspace", name: "Google Workspace", provider: "Google", aliases: ["google workspace", "gsuite", "workspace"], categorySlug: "software", group: "AI & productivity", website_url: "https://workspace.google.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#1A73E8" },

  // Cloud & storage
  { key: "icloud", name: "iCloud+", provider: "Apple", aliases: ["icloud", "apple", "apple storage"], categorySlug: "cloud-hosting", group: "Cloud & storage", website_url: "https://www.icloud.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#3B82F6", isPopular: true },
  { key: "google-one", name: "Google One", provider: "Google", aliases: ["google one", "google drive", "google storage"], categorySlug: "cloud-hosting", group: "Cloud & storage", website_url: "https://one.google.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#1A73E8" },
  { key: "dropbox", name: "Dropbox", provider: "Dropbox", aliases: ["dropbox"], categorySlug: "cloud-hosting", group: "Cloud & storage", website_url: "https://www.dropbox.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#0061FF" },
  { key: "onedrive", name: "OneDrive", provider: "Microsoft", aliases: ["onedrive", "one drive"], categorySlug: "cloud-hosting", group: "Cloud & storage", website_url: "https://www.microsoft.com/microsoft-365/onedrive", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#0078D4" },

  // Developer & tools
  { key: "github", name: "GitHub", provider: "GitHub", aliases: ["github", "git"], categorySlug: "software", group: "Developer & tools", website_url: "https://github.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#111111" },
  { key: "vercel", name: "Vercel", provider: "Vercel", aliases: ["vercel", "hosting"], categorySlug: "cloud-hosting", group: "Developer & tools", website_url: "https://vercel.com", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#111111" },
  { key: "railway", name: "Railway", provider: "Railway", aliases: ["railway", "hosting"], categorySlug: "cloud-hosting", group: "Developer & tools", website_url: "https://railway.app", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#8B5CF6" },
  { key: "cloudflare", name: "Cloudflare", provider: "Cloudflare", aliases: ["cloudflare", "dns", "domain"], categorySlug: "cloud-hosting", group: "Developer & tools", website_url: "https://www.cloudflare.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#F38020" },
  { key: "aws", name: "AWS", provider: "Amazon Web Services", aliases: ["aws", "amazon web services"], categorySlug: "cloud-hosting", group: "Developer & tools", website_url: "https://aws.amazon.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#FF9900" },
  { key: "digitalocean", name: "DigitalOcean", provider: "DigitalOcean", aliases: ["digitalocean", "do", "hosting"], categorySlug: "cloud-hosting", group: "Developer & tools", website_url: "https://www.digitalocean.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, brandColor: "#0080FF" },

  // Domains & hosting
  { key: "namecheap", name: "Namecheap", provider: "Namecheap", aliases: ["namecheap", "domain"], categorySlug: "domain", group: "Domains & hosting", website_url: "https://www.namecheap.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#DE3723" },
  { key: "godaddy", name: "GoDaddy", provider: "GoDaddy", aliases: ["godaddy", "domain"], categorySlug: "domain", group: "Domains & hosting", website_url: "https://www.godaddy.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#111111" },
  { key: "hostinger", name: "Hostinger", provider: "Hostinger", aliases: ["hostinger", "hosting"], categorySlug: "cloud-hosting", group: "Domains & hosting", website_url: "https://www.hostinger.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#673DE6" },
  { key: "bluehost", name: "Bluehost", provider: "Bluehost", aliases: ["bluehost", "hosting"], categorySlug: "cloud-hosting", group: "Domains & hosting", website_url: "https://www.bluehost.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#2179D4" },

  // Bills & life
  { key: "phone-plan", name: "Phone plan", provider: "", aliases: ["phone", "mobile", "cell", "sim"], categorySlug: "telecom", group: "Bills & life", website_url: "", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#F59E0B" },
  { key: "internet-bill", name: "Internet bill", provider: "", aliases: ["internet", "wifi", "broadband", "fibre"], categorySlug: "telecom", group: "Bills & life", website_url: "", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#0EA5E9" },
  { key: "gym", name: "Gym membership", provider: "", aliases: ["gym", "fitness", "membership"], categorySlug: "gym-health", group: "Bills & life", website_url: "", billing_cycle: "monthly", reminder_days_before: 3, auto_renew: true, brandColor: "#EC4899" },
  { key: "rent", name: "Rent", provider: "", aliases: ["rent", "apartment", "housing"], categorySlug: "other", group: "Bills & life", website_url: "", billing_cycle: "monthly", reminder_days_before: 5, auto_renew: false, brandColor: "#64748B" },
  { key: "loan", name: "Loan repayment", provider: "", aliases: ["loan", "mortgage", "repayment"], categorySlug: "finance", group: "Bills & life", website_url: "", billing_cycle: "monthly", reminder_days_before: 5, auto_renew: false, brandColor: "#0D9488" },

  // Education
  { key: "school-fees", name: "School / tuition fees", provider: "", aliases: ["school", "university", "tuition", "fees"], categorySlug: "education", group: "Education", website_url: "", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: false, brandColor: "#8B5CF6" },

  // Insurance
  { key: "health-insurance", name: "Health insurance", provider: "", aliases: ["health insurance", "medical", "insurance"], categorySlug: "insurance", group: "Insurance", website_url: "", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#22C55E" },
  { key: "vehicle-insurance", name: "Vehicle insurance", provider: "", aliases: ["car insurance", "vehicle insurance", "auto insurance", "insurance"], categorySlug: "insurance", group: "Insurance", website_url: "", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, brandColor: "#F97316" },
];

const TEMPLATE_BY_KEY = new Map(SUBSCRIPTION_TEMPLATES.map((t) => [t.key, t]));

/** Look up a curated template by its stable key. Safe for unknown keys. */
export function getSubscriptionTemplateByKey(
  key: string | null | undefined,
): SubscriptionTemplate | null {
  if (!key) return null;
  return TEMPLATE_BY_KEY.get(key) ?? null;
}

/** Search templates by name, provider, key, or alias (case-insensitive). */
export function findSubscriptionTemplates(query: string): SubscriptionTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return SUBSCRIPTION_TEMPLATES;
  return SUBSCRIPTION_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.provider.toLowerCase().includes(q) ||
      t.key.includes(q) ||
      t.aliases.some((a) => a.includes(q)),
  );
}

/**
 * Best-effort match for a free-typed name/provider, so existing subscriptions
 * (and manually typed ones) can still show a brand accent. Exact key/name/alias
 * matches win; otherwise no forced guess.
 */
export function matchTemplateByName(
  name: string,
  provider?: string,
): SubscriptionTemplate | null {
  const hay = `${name} ${provider ?? ""}`.toLowerCase();
  for (const t of SUBSCRIPTION_TEMPLATES) {
    if (!t.provider && t.aliases.every((a) => a.length < 4)) continue;
    if (
      hay.includes(t.name.toLowerCase()) ||
      (t.provider && hay.includes(t.provider.toLowerCase())) ||
      t.aliases.some((a) => a.length >= 4 && hay.includes(a))
    ) {
      return t;
    }
  }
  return null;
}

/** Resolve the logo asset path for a provider key, if the template defines one. */
export function getSubscriptionLogo(
  key: string | null | undefined,
): string | null {
  return getSubscriptionTemplateByKey(key)?.logoPath ?? null;
}

/** Neutral two-letter avatar text for any subscription name. */
export function getSubscriptionFallbackAvatar(name: string): string {
  return monogram(name);
}

/** Map a template to the form/create defaults it should pre-fill. */
export function applyTemplateDefaults(
  template: SubscriptionTemplate,
): Partial<SubscriptionInput> {
  return {
    name: template.name,
    provider: template.provider,
    provider_key: template.key,
    website_url: template.website_url,
    billing_cycle: template.billing_cycle,
    reminder_days_before: template.reminder_days_before,
    auto_renew: template.auto_renew,
  };
}

/** Templates grouped for display, preserving TEMPLATE_GROUPS order and dropping
 * empty groups (e.g. after a search filter). */
export function groupTemplates(
  templates: SubscriptionTemplate[],
): { group: TemplateGroup; items: SubscriptionTemplate[] }[] {
  return TEMPLATE_GROUPS.map((group) => ({
    group,
    items: templates.filter((t) => t.group === group),
  })).filter((section) => section.items.length > 0);
}
