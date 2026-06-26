// Use-case content for the marketing /use-cases/* pages. Pure data so the page
// component stays a simple, statically-rendered server component. Copy mirrors
// brand/messaging-guide.md and docs/marketing/use-cases.md — honest, no fake
// proof, no official-requirement or legal claims.

import type { Metadata } from "next";

export interface UseCase {
  slug: string;
  /** Small label above the title, e.g. "For students". */
  eyebrow: string;
  title: string;
  /** SEO <title> (without the " · CertaNest" template suffix). */
  metaTitle: string;
  metaDescription: string;
  pain: string;
  solution: string;
  /** Ordered workflow steps. */
  workflow: string[];
  /** Canonical feature names this segment leans on. */
  features: string[];
  /** A single honest trust line shown near the CTA. */
  trustNote: string;
  /** Optional visible FAQ (also emitted as FAQPage JSON-LD — must match copy). */
  faqs?: { q: string; a: string }[];
  /** Related use-case slugs for internal linking (descriptive anchors). */
  related?: string[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "students",
    eyebrow: "For students",
    title: "Keep your important documents ready",
    metaTitle: "CertaNest for Students — Keep Your Documents Ready",
    metaDescription:
      "Academic, visa, scholarship, and job documents in one private place — organized, tracked before they expire, and ready to share safely.",
    pain: "Academic, visa, scholarship, and job documents are scattered across phone, email, WhatsApp, and Drive — and something always expires at the worst time.",
    solution:
      "Keep every important document ready in one private Vault, with reminders before anything expires.",
    workflow: [
      "Scan or upload a document",
      "Organize it in your Vault",
      "Track deadlines and renewals",
      "Build application packs",
      "Share safely when you need to",
    ],
    features: ["Vault", "Scan", "Application Packs", "Deadlines & Renewals", "Document Generation", "SafeSend"],
    trustNote: "Private until shared. Your original files are preserved.",
  },
  {
    slug: "visa-documents",
    eyebrow: "For visa applicants",
    title: "Prepare and track your visa documents",
    metaTitle: "CertaNest for Visa Documents — Prepare & Track",
    metaDescription:
      "Prepare a complete visa document pack, track passport and visa expiry, and share safely with expiry and revocation — not a public link.",
    pain: "A missing or expired document can delay or derail a visa application.",
    solution:
      "Prepare a complete visa pack, track expiry dates, and share safely.",
    workflow: [
      "Build a visa pack from an editable checklist",
      "Attach or scan each document",
      "Set passport and visa expiry reminders",
      "Fill and sign where needed",
      "Share with expiry, access rules, and a QR",
    ],
    features: ["Application Packs", "Deadlines & Renewals", "Fill & Sign", "SafeSend", "Custom QR"],
    trustNote: "Requirements vary — always verify with the official source.",
  },
  {
    slug: "scholarship-applications",
    eyebrow: "For scholarship applicants",
    title: "Build a complete scholarship pack",
    metaTitle: "CertaNest for Scholarship Applications",
    metaDescription:
      "Build a complete scholarship pack with an editable checklist, document drafts, and deadline tracking — so nothing is missing at submission.",
    pain: "Scholarship packs come together last-minute and incomplete.",
    solution:
      "Build a complete scholarship pack with a checklist and document drafts.",
    workflow: [
      "Choose a scholarship pack template",
      "Work through the required and optional checklist",
      "Attach documents from your Vault or scan new ones",
      "Generate statements and letters to edit",
      "Track the deadline",
    ],
    features: ["Application Packs", "Document Generation", "Deadlines & Renewals", "SafeSend"],
    trustNote: "Templates are generic and editable. Verify requirements with the source.",
  },
  {
    slug: "job-applications",
    eyebrow: "For job applicants",
    title: "Build a job application pack",
    metaTitle: "CertaNest for Job Applications",
    metaDescription:
      "Build a job application pack with CV and cover-letter drafts, supporting documents, deadline tracking, and secure sharing — all in one place.",
    pain: "Every role needs a tailored CV, cover letter, certificates, and its own deadline.",
    solution:
      "Build a job application pack with drafts, supporting documents, and deadline tracking.",
    workflow: [
      "Create a job pack",
      "Generate CV and cover-letter drafts to edit (review-first)",
      "Attach certificates and supporting documents",
      "Track the deadline",
      "Export or share securely",
    ],
    features: ["Application Packs", "Document Generation", "Deadlines & Renewals", "Document Tools", "SafeSend"],
    trustNote: "Drafts are starting points you edit — CertaNest never promises acceptance.",
  },
  {
    slug: "document-sharing",
    eyebrow: "For safe sharing",
    title: "Share sensitive documents without losing control",
    metaTitle: "CertaNest for Secure Document Sharing",
    metaDescription:
      "Share sensitive documents with expiry, access rules, QR, and revocation. No public link is created without your confirmation.",
    pain: "Sensitive documents get shared over email and WhatsApp and can't be taken back.",
    solution:
      "Share with expiry, access rules, QR, and revocation — never a public link by accident.",
    workflow: [
      "Select a document or application pack",
      "Open SafeSend and set expiry and access rules",
      "Confirm before any link is created",
      "Share the link or a Custom QR",
      "Revoke access anytime",
    ],
    features: ["SafeSend", "Custom QR", "Document Tools"],
    trustNote: "No public link is created without your confirmation. Revoke anytime.",
  },
  {
    slug: "agencies-schools",
    eyebrow: "For agencies & schools",
    title: "Collect and track documents from many people",
    metaTitle: "CertaNest for Agencies & Schools — Document Portals",
    metaDescription:
      "Request, review, track, and safely manage document submissions from applicants, clients, and students — without email and WhatsApp chaos.",
    pain: "Collecting documents from many applicants, clients, or students is chaotic.",
    solution:
      "Request, review, track, and safely manage submissions in one place.",
    workflow: [
      "Create a workspace for your team",
      "Request specific documents via secure upload links",
      "Review what's complete and what's missing",
      "Send reminders",
      "Organize received documents safely",
    ],
    features: ["CertaNest Portals", "Document Requests", "Deadlines & Renewals", "SafeSend", "Organizations"],
    trustNote: "Upload links are scoped — recipients never see your workspace.",
  },
  {
    slug: "families",
    eyebrow: "For families",
    title: "Keep your family's documents ready",
    metaTitle: "CertaNest for Families — Documents Ready for Emergencies",
    metaDescription:
      "Keep your family's important documents organized in one private place, and prepare read-only emergency access for the people you trust.",
    pain: "Everyone's important documents are spread out — and impossible to find in an emergency.",
    solution:
      "Keep the family's critical documents organized and prepare read-only emergency access for trusted people.",
    workflow: [
      "Scan or upload each person's key documents",
      "Organize them in your Vault by person and category",
      "Track expiry dates and renewals",
      "Prepare an emergency pack of critical documents",
      "Give trusted people read-only emergency access",
    ],
    features: ["Vault", "Scan", "Deadlines & Renewals", "Emergency Access", "SafeSend"],
    trustNote: "Emergency access is read-only and revocable. Nothing is shared publicly.",
  },
  {
    slug: "client-document-collection",
    eyebrow: "For teams & agencies",
    title: "Collect documents from clients without email chaos",
    metaTitle: "Client Document Collection Software Without Email Chaos",
    metaDescription:
      "Collect documents from clients with secure request links, review workflows, reminders, and organized case folders — instead of messy email threads.",
    pain: "Email is a poor document collection system: attachments get buried in threads, you lose track of who sent what, and chasing missing files eats your week.",
    solution:
      "Send a secure request link, let recipients upload without an account, then review and track every submission from one place.",
    workflow: [
      "Create a reusable request template for a case type",
      "Send a secure file request link to each client",
      "Recipients upload through the link — no account needed",
      "Review uploads: accept, reject, or ask for a replacement",
      "Keep missing files visible and send reminders",
      "Share selected proof back through an expiring room",
    ],
    features: ["Document Requests", "CertaNest Portals", "Review workflow", "Deadlines & Renewals", "SafeSend"],
    trustNote: "Request links are scoped to one case — recipients never see your workspace or other clients.",
    faqs: [
      {
        q: "Do clients need an account to upload?",
        a: "No. Each client gets a secure request link and uploads directly — no sign-up, no app to install.",
      },
      {
        q: "How do I know what's still missing?",
        a: "Every request shows what's received, accepted, or still outstanding, so nothing slips through. You can send a reminder in one click.",
      },
      {
        q: "Is this enterprise software?",
        a: "CertaNest is built for small teams and is in private beta. It doesn't offer enterprise compliance certifications or single sign-on yet — we're honest about what exists today.",
      },
    ],
    related: ["agencies-schools", "secure-document-sharing", "visa-documents"],
  },
  {
    slug: "secure-document-sharing",
    eyebrow: "For secure sharing",
    title: "Share proof without oversharing",
    metaTitle: "Secure Document Sharing — Share Proof Without Oversharing",
    metaDescription:
      "Share selected documents with expiring access, revocation controls, audit history, and private-by-default storage — never a public link to your whole vault.",
    pain: "Sharing a document by email or a public link exposes more than you intended, and you can't take it back once it's out.",
    solution:
      "Share only the items you choose, with an expiry, an optional access code, and a full activity log — and revoke access whenever you want.",
    workflow: [
      "Pick only the documents you need to share",
      "Add an expiry and, optionally, an access code",
      "Send a secure link, QR, or code — never the original file",
      "Watch the activity log as it's opened",
      "Revoke access anytime",
    ],
    features: ["SafeSend", "Redaction & Watermarking", "Audit logs", "Custom QR", "Sharing Rooms"],
    trustNote: "Private until shared. Revoked and expired links are blocked server-side, not just hidden.",
    faqs: [
      {
        q: "Can I take back access after sharing?",
        a: "Yes. Revoke a share at any time, and expiring links close automatically. Both are enforced on the server, not just hidden in the UI.",
      },
      {
        q: "Does the recipient see my whole vault?",
        a: "No. A share exposes only the specific items you select. Everything else stays private.",
      },
      {
        q: "Is the storage secure?",
        a: "Files are encrypted at rest and private by default. We describe our protections plainly, without exaggerated security claims.",
      },
    ],
    related: ["client-document-collection", "families", "visa-documents"],
  },
  {
    slug: "passport-renewal-reminders",
    eyebrow: "For deadlines & renewals",
    title: "Never miss a passport or visa expiry",
    metaTitle: "Passport Expiry Reminder App — Never Miss a Renewal",
    metaDescription:
      "Track passport, visa, and ID expiry dates and get reminders before they lapse — derived from your real documents, not a calendar you have to maintain.",
    pain: "An expired passport or visa is discovered at the worst possible moment — at the airport, mid-application, or right before a deadline.",
    solution:
      "CertaNest reads the expiry dates on your documents and surfaces renewals before they lapse, with reminders 7, 30, 60, or 90 days ahead.",
    workflow: [
      "Add or scan your passport, visa, and ID documents",
      "Set the expiry and renewal dates (or confirm the detected ones)",
      "Choose how far ahead you want reminders",
      "Let Life Radar surface what needs attention first",
      "Renew with time to spare and keep proof ready",
    ],
    features: ["Deadlines & Renewals", "Life Radar", "Vault", "Scan", "Application Packs"],
    trustNote: "Reminders are rule-based on dates you control — no guesswork, and your documents stay private.",
    faqs: [
      {
        q: "How far ahead do reminders arrive?",
        a: "You choose — typically 7, 30, 60, or 90 days before an expiry or renewal date, and you can set recurring reminders.",
      },
      {
        q: "Does CertaNest renew my passport for me?",
        a: "No. CertaNest helps you stay ready and on time. It doesn't submit applications for you, and it isn't legal or immigration advice.",
      },
    ],
    related: ["visa-documents", "students", "families"],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}

// Full per-page metadata so a shared use-case link previews with that segment's
// own title/description (instead of inheriting the site-wide Open Graph title).
export function buildUseCaseMetadata(slug: string): Metadata {
  const u = getUseCase(slug);
  if (!u) return {};
  const path = `/use-cases/${u.slug}`;
  return {
    title: { absolute: u.metaTitle },
    description: u.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: u.metaTitle,
      description: u.metaDescription,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: u.metaTitle,
      description: u.metaDescription,
    },
  };
}
