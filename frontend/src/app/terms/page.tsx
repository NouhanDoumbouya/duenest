import type { Metadata } from "next";

import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using DueNest during its private beta. A product draft, reviewed before public launch.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    title: "1. Acceptance of terms",
    body: "By using DueNest, you agree to this draft. If you do not agree, please do not use the service. This is a private-beta draft and may change as the product matures.",
  },
  {
    title: "2. Description of service",
    body: "DueNest helps you organize and track important documents, dates, renewals, application bundles, reminders, and controlled sharing. It is a document organization and readiness tool.",
  },
  {
    title: "3. Beta status",
    body: "DueNest is in a private beta. Features may change, break, or be removed, and access is rolled out gradually to selected users. Do not rely on the beta as your only copy of critical documents.",
  },
  {
    title: "4. User accounts",
    body: "You are responsible for keeping your account credentials secure and for activity under your account. Notify support if you believe your account has been compromised.",
  },
  {
    title: "5. User content and files",
    body: "You retain ownership of the documents and files you add. You grant DueNest the permissions needed to store, process, display, and share them as you direct, in order to operate the service.",
  },
  {
    title: "6. Responsibility for uploaded content",
    body: "You should upload only records you are allowed to store and share. You are responsible for the legality and accuracy of what you upload and for choosing what you share and with whom.",
  },
  {
    title: "7. Prohibited use",
    body: [
      "Do not upload unlawful content or content you have no right to store or share.",
      "Do not use DueNest to infringe others' rights or to harass, defraud, or harm.",
      "Do not attempt to break, overload, probe, or circumvent the security of the service.",
    ],
  },
  {
    title: "8. Sharing and public links",
    body: "SafeSend and similar links expose only the items you select. Create them carefully, use access codes and expiry where appropriate, and revoke them when no longer needed. Watermarking can discourage misuse but cannot fully prevent screenshots.",
  },
  {
    title: "9. Emergency access limitation",
    body: "Emergency Access is a document access aid that exposes selected items you prepare in advance. It is not a medical, legal, or emergency response service, and must not be relied on as one.",
  },
  {
    title: "10. Renewal and deadline tracking limitation",
    body: "DueNest helps you track renewals, expiries, and deadlines by sending reminders. It does not process payments, connect to your bank or card accounts, or act on your behalf with any provider or institution. You remain responsible for completing renewals and applications with the relevant providers.",
  },
  {
    title: "11. Document intelligence limitation",
    body: "Any automated date extraction or classification is provided to assist you and may be inaccurate or incomplete. You should verify important dates and details yourself. AI-assisted processing is being introduced gradually and may not be available.",
  },
  {
    title: "12. Organization / workspace responsibilities",
    body: "If you create or join an organization workspace, you are responsible for using shared documents and member data appropriately and in line with applicable rules and the workspace's settings.",
  },
  {
    title: "13. Feedback",
    body: "If you send feedback or suggestions, DueNest may use them to improve the product without obligation to you. Do not include passwords, access codes, or sensitive document contents in feedback.",
  },
  {
    title: "14. Service availability",
    body: "DueNest is provided on an 'as available' basis during beta and may be unavailable, interrupted, or changed at any time. Keep your own copies of documents you cannot afford to lose.",
  },
  {
    title: "15. Data deletion and termination",
    body: "You can request a data export and account deletion through the product; deletion is handled as a reviewable, cancellable request while pending. DueNest may suspend or end access that violates these terms.",
  },
  {
    title: "16. Disclaimers",
    body: "DueNest helps you organize and track information. It does not provide legal, immigration, tax, insurance, medical, or financial advice, and does not guarantee that deadlines or official requirements will be met. Verify official requirements with the relevant authority.",
  },
  {
    title: "17. Limitation of liability (draft)",
    body: "To the extent permitted by law, DueNest is provided without warranties, and the team is not liable for indirect or consequential losses arising from use of the beta. This clause is a draft and will be finalized with legal review.",
  },
  {
    title: "18. Changes to terms",
    body: "These terms may be updated as DueNest evolves. Continued use after changes means you accept the updated draft. The terms will be reviewed before a public production launch.",
  },
  {
    title: "19. Contact",
    body: "Questions about these terms can be sent through the Contact page.",
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms"
      title="Terms draft"
      intro="The terms for using DueNest during its private beta. This is a product draft for clarity, not final legal text."
      sections={sections}
      footerLinks={[
        { label: "Privacy", href: "/privacy" },
        { label: "Trust & Security", href: "/security" },
        { label: "Data & Deletion", href: "/data-deletion" },
        { label: "Contact", href: "/contact" },
      ]}
    />
  );
}
