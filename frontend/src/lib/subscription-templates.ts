// Quick-add templates for common subscriptions. These pre-fill the add form so
// users don't have to type everything. We intentionally do NOT include prices -
// amounts vary by plan/region and faking them would be misleading; the user
// always enters their own amount and currency.

import type { BillingCycle } from "@/types/subscriptions";

export interface SubscriptionTemplate {
  name: string;
  provider: string;
  // Category slug - matched to a seeded SubscriptionCategory at prefill time.
  categorySlug: string;
  website_url: string;
  billing_cycle: BillingCycle;
  reminder_days_before: number;
  auto_renew: boolean;
  shortLabel: string;
}

export const SUBSCRIPTION_TEMPLATES: SubscriptionTemplate[] = [
  { name: "Netflix", provider: "Netflix", categorySlug: "streaming", website_url: "https://www.netflix.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "NF" },
  { name: "Spotify", provider: "Spotify", categorySlug: "streaming", website_url: "https://www.spotify.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "SP" },
  { name: "YouTube Premium", provider: "Google", categorySlug: "streaming", website_url: "https://www.youtube.com/premium", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "YT" },
  { name: "ChatGPT", provider: "OpenAI", categorySlug: "software", website_url: "https://chatgpt.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "AI" },
  { name: "Canva", provider: "Canva", categorySlug: "software", website_url: "https://www.canva.com", billing_cycle: "yearly", reminder_days_before: 14, auto_renew: true, shortLabel: "CV" },
  { name: "Google Drive", provider: "Google", categorySlug: "cloud-hosting", website_url: "https://one.google.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "GD" },
  { name: "iCloud", provider: "Apple", categorySlug: "cloud-hosting", website_url: "https://www.icloud.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "IC" },
  { name: "Microsoft 365", provider: "Microsoft", categorySlug: "software", website_url: "https://www.microsoft.com/microsoft-365", billing_cycle: "yearly", reminder_days_before: 14, auto_renew: true, shortLabel: "M365" },
  { name: "Adobe", provider: "Adobe", categorySlug: "software", website_url: "https://www.adobe.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "AD" },
  { name: "Notion", provider: "Notion", categorySlug: "software", website_url: "https://www.notion.so", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "NO" },
  { name: "GitHub", provider: "GitHub", categorySlug: "software", website_url: "https://github.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "GH" },
  { name: "Namecheap Domain", provider: "Namecheap", categorySlug: "domain", website_url: "https://www.namecheap.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, shortLabel: "NC" },
  { name: "Hostinger Hosting", provider: "Hostinger", categorySlug: "cloud-hosting", website_url: "https://www.hostinger.com", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, shortLabel: "HO" },
  { name: "AWS", provider: "Amazon Web Services", categorySlug: "cloud-hosting", website_url: "https://aws.amazon.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "AWS" },
  { name: "DigitalOcean", provider: "DigitalOcean", categorySlug: "cloud-hosting", website_url: "https://www.digitalocean.com", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "DO" },
  { name: "Phone Bill", provider: "", categorySlug: "telecom", website_url: "", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "PH" },
  { name: "Internet Bill", provider: "", categorySlug: "telecom", website_url: "", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "NET" },
  { name: "Gym Membership", provider: "", categorySlug: "gym-health", website_url: "", billing_cycle: "monthly", reminder_days_before: 7, auto_renew: true, shortLabel: "GYM" },
  { name: "Insurance", provider: "", categorySlug: "insurance", website_url: "", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: true, shortLabel: "INS" },
  { name: "University Payment", provider: "", categorySlug: "education", website_url: "", billing_cycle: "yearly", reminder_days_before: 30, auto_renew: false, shortLabel: "EDU" },
];
