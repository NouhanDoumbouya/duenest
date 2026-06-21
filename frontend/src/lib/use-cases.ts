// Use-case content for the marketing /use-cases/* pages. Pure data so the page
// component stays a simple, statically-rendered server component. Copy mirrors
// brand/messaging-guide.md and docs/marketing/use-cases.md — honest, no fake
// proof, no official-requirement or legal claims.

export interface UseCase {
  slug: string;
  /** Small label above the title, e.g. "For students". */
  eyebrow: string;
  title: string;
  /** SEO <title> (without the " · DueNest" template suffix). */
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
}

export const USE_CASES: UseCase[] = [
  {
    slug: "students",
    eyebrow: "For students",
    title: "Keep your important documents ready",
    metaTitle: "DueNest for Students — Keep Your Documents Ready",
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
    metaTitle: "DueNest for Visa Documents — Prepare & Track",
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
    metaTitle: "DueNest for Scholarship Applications",
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
    metaTitle: "DueNest for Job Applications",
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
    trustNote: "Drafts are starting points you edit — DueNest never promises acceptance.",
  },
  {
    slug: "document-sharing",
    eyebrow: "For safe sharing",
    title: "Share sensitive documents without losing control",
    metaTitle: "DueNest for Secure Document Sharing",
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
    metaTitle: "DueNest for Agencies & Schools — Document Portals",
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
    features: ["DueNest Portals", "Document Requests", "Deadlines & Renewals", "SafeSend", "Organizations"],
    trustNote: "Upload links are scoped — recipients never see your workspace.",
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}
