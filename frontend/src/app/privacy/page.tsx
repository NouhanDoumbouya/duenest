import type { Metadata } from "next";

import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How CertaNest handles your documents, account, billing, sharing, and analytics data, and the service providers it uses. A private-beta draft, reviewed before public launch.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    title: "1. Introduction",
    body: "This Privacy draft explains what information CertaNest collects, how it is used, and the choices you have. CertaNest is a tool for organizing important documents, renewals, applications, and secure sharing. This draft is product-specific but not final legal text.",
  },
  {
    title: "2. Information you provide",
    body: "Account details you enter (such as name and email), the document records, dates, notes, and files you create or upload, reminders and application packs you build, and any feedback or support messages you send.",
  },
  {
    title: "3. Files and documents",
    body: "Files you upload are stored to power your vault, previews, exports, and the sharing you choose. Uploaded files are encrypted at rest, and CertaNest decrypts a file only after its permission checks pass. CertaNest does not sell your documents.",
  },
  {
    title: "4. Account information",
    body: "Authentication details are used to sign you in and protect your account. Passwords are hashed and never stored in plain text, and access codes for shared items are stored hashed.",
  },
  {
    title: "5. Payment and billing information",
    body: "When you subscribe to a paid plan, payments are processed by our payment provider (Stripe). CertaNest does not receive or store your full card number — card details are handled by the provider. CertaNest stores limited billing information such as your plan, subscription status, billing period, and invoices/receipts so it can manage your subscription.",
  },
  {
    title: "6. Waitlist and beta information",
    body: "If you join the waitlist, CertaNest stores the details you submit (such as name, email, country, persona, and any message) to evaluate and roll out private-beta access.",
  },
  {
    title: "7. Reminders and deadline information",
    body: "Dates you add (such as document expiry, renewal, and application deadlines) are used to remind you before they pass. CertaNest does not process third-party payments and does not connect to your bank or card accounts.",
  },
  {
    title: "8. Organization / workspace information",
    body: "If you use organization or workspace features, documents and requests shared within that context are handled according to the workspace's settings and the choices of its members and owners. Where an organization collects documents from other people, see the Data Processing Addendum.",
  },
  {
    title: "9. Feedback and support information",
    body: "Messages you send through feedback or support are stored so the team can respond and improve the product. Please do not include passwords, access codes, or sensitive document contents in support messages.",
  },
  {
    title: "10. Usage analytics",
    body: "CertaNest may collect privacy-conscious usage and operational analytics to understand product use, reliability, and abuse prevention. These are designed to avoid exposing your private document contents.",
  },
  {
    title: "11. Country-level and security metadata",
    body: "CertaNest may derive coarse, country-level activity from request metadata (such as IP) for security and product operations. Raw IP addresses and user-agents from sharing activity are stored as salted hashes, not in plain text, and are not shown in normal product views.",
  },
  {
    title: "12. Cookies and sign-in",
    body: "CertaNest uses cookies and browser storage to keep you signed in and to remember interface preferences. Authentication uses secure, HttpOnly session cookies so your sign-in tokens are not exposed to page scripts. CertaNest does not use third-party advertising cookies.",
  },
  {
    title: "13. How information is used",
    body: "To provide and secure the service: display your vault, calculate attention states, build timelines and reminders, prepare exports, power the sharing you request, manage your subscription, evaluate beta access, and keep the service reliable and protected from abuse.",
  },
  {
    title: "14. How information is shared",
    body: [
      "CertaNest does not sell user documents.",
      "Documents are not shared by default. A share link or emergency access exposes only the items you select, according to the settings you choose.",
      "Selected recipients may view selected items depending on your share settings; you are responsible for choosing what you share and with whom.",
      "Limited service providers process data on CertaNest's behalf to operate the service, as listed below.",
    ],
  },
  {
    title: "15. Service providers (subprocessors)",
    body: [
      "Cloud hosting — runs the CertaNest application and database.",
      "Object storage (Cloudflare R2) — stores your uploaded files, encrypted at rest.",
      "Email delivery (Resend) — sends account, reminder, and billing emails.",
      "Payments (Stripe) — processes subscription billing; handles card details directly.",
      "Google — only if you sign in with Google or choose to import from Google Drive, Gmail, or Calendar; used to verify your identity and access only the items you select to import.",
      "AI provider (Anthropic) — only if AI features are enabled and you use them, and only the specific content you select for an AI action is sent. AI is off unless explicitly enabled.",
    ],
  },
  {
    title: "16. Public sharing links and emergency access",
    body: "SafeSend and Emergency Access expose only the items you select. Access can require a code, expire, and be revoked. CertaNest does not intentionally expose your full vault through these features. Watermarking can discourage misuse but cannot fully prevent screenshots on every device.",
  },
  {
    title: "17. Data retention",
    body: "Information is retained while your account is active and as needed to provide the service, meet operational and security needs, and honor your requests. Deleted items follow the Trash and deletion behavior described on the Data & Deletion page.",
  },
  {
    title: "18. Data deletion and your choices",
    body: "You can delete files and request a data export and account deletion from your account's data controls. Account deletion is handled as a request that can be reviewed and cancelled while pending. See the Data & Deletion page for details.",
  },
  {
    title: "19. Security measures",
    body: "CertaNest is designed with access control in mind: records are scoped to your account, files are encrypted at rest, access codes are hashed, and revoked or expired access is blocked server-side. No system can guarantee perfect security.",
  },
  {
    title: "20. International users",
    body: "CertaNest may be used from many countries, and information may be processed in locations where the service and its providers operate. Use the service only if you are comfortable with this.",
  },
  {
    title: "21. Children and minors",
    body: "CertaNest is intended for adults managing their own or their household's documents and is not directed at young children.",
  },
  {
    title: "22. Changes to this policy",
    body: "This draft may change as the product matures. Material changes will be reflected here, and the policy will be reviewed before a public production launch.",
  },
  {
    title: "23. Contact",
    body: "Questions about privacy can be sent through the Contact page. Please do not include passwords, access codes, or sensitive document contents in your message.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Privacy"
      title="Privacy draft"
      intro="How CertaNest handles your documents, account, billing, sharing, and analytics data, and the service providers it relies on. This is a beta-ready product draft, not final legal policy."
      sections={sections}
      footerLinks={[
        { label: "Trust & Security", href: "/security" },
        { label: "Terms", href: "/terms" },
        { label: "Data Processing Addendum", href: "/dpa" },
        { label: "Data & Deletion", href: "/data-deletion" },
        { label: "Contact", href: "/contact" },
      ]}
    />
  );
}
