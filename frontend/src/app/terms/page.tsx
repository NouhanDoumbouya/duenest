import type { Metadata } from "next";

import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using CertaNest, including plans, billing, and cancellation. A product draft, reviewed before public launch.",
  alternates: { canonical: "/terms" },
};

const sections: LegalSection[] = [
  {
    title: "1. Acceptance of terms",
    body: "By using CertaNest, you agree to this draft. If you do not agree, please do not use the service. This is a private-beta draft and may change as the product matures.",
  },
  {
    title: "2. Description of service",
    body: "CertaNest helps you organize and track important documents, dates, renewals, application bundles, reminders, and controlled sharing. It is a document organization and readiness tool.",
  },
  {
    title: "3. Beta status",
    body: "CertaNest is in a private beta. Features may change, break, or be removed, and access is rolled out gradually to selected users. Do not rely on the beta as your only copy of critical documents.",
  },
  {
    title: "4. User accounts",
    body: "You are responsible for keeping your account credentials secure and for activity under your account. Notify support if you believe your account has been compromised.",
  },
  {
    title: "5. Plans and free tier",
    body: "CertaNest offers a free tier and paid plans (such as Pro, Family, and Organization). Some features and higher usage limits require a paid plan. The specific features and limits of each plan are shown on the Pricing page and may change as the product evolves.",
  },
  {
    title: "6. Billing and auto-renewal",
    body: "Paid plans are billed in advance on a recurring basis — monthly or annually, as you choose at checkout — through our payment processor. By subscribing, you authorize recurring charges to your payment method for each billing period until you cancel. You are responsible for keeping a valid payment method on file.",
  },
  {
    title: "7. Cancellation",
    body: "You can cancel a paid plan at any time from your billing settings. Cancellation stops future renewals; your paid access continues until the end of the billing period you have already paid for, after which the account returns to the free tier. Cancelling does not delete your documents.",
  },
  {
    title: "8. Refunds (draft)",
    body: "Except where required by law, payments are generally non-refundable, and partial billing periods are not refunded on cancellation. Any specific refund or trial terms will be stated at checkout. This clause is a draft and will be finalized with legal review.",
  },
  {
    title: "9. Failed payments and downgrades",
    body: "If a renewal payment fails, we may retry the charge and notify you to update your payment method. If payment is not completed within a reasonable grace period, paid features may be paused and the account may return to the free tier. Your documents remain available within free-tier limits.",
  },
  {
    title: "10. Price changes and taxes",
    body: "Prices may change over time; we will give reasonable advance notice of changes that affect your renewals, and changes take effect on your next billing period. Listed prices may exclude applicable taxes, which are added where required.",
  },
  {
    title: "11. User content and files",
    body: "You retain ownership of the documents and files you add. You grant CertaNest the permissions needed to store, process, display, and share them as you direct, in order to operate the service.",
  },
  {
    title: "12. Responsibility for uploaded content",
    body: "You should upload only records you are allowed to store and share. You are responsible for the legality and accuracy of what you upload and for choosing what you share and with whom.",
  },
  {
    title: "13. Prohibited use",
    body: [
      "Do not upload unlawful content or content you have no right to store or share.",
      "Do not use CertaNest to infringe others' rights or to harass, defraud, or harm.",
      "Do not attempt to break, overload, probe, or circumvent the security of the service.",
    ],
  },
  {
    title: "14. Sharing and public links",
    body: "SafeSend and similar links expose only the items you select. Create them carefully, use access codes and expiry where appropriate, and revoke them when no longer needed. Watermarking can discourage misuse but cannot fully prevent screenshots.",
  },
  {
    title: "15. Emergency access limitation",
    body: "Emergency Access is a document access aid that exposes selected items you prepare in advance. It is not a medical, legal, or emergency response service, and must not be relied on as one.",
  },
  {
    title: "16. Renewal and deadline tracking limitation",
    body: "CertaNest helps you track renewals, expiries, and deadlines by sending reminders. It does not process payments to third parties on your behalf, connect to your bank or card accounts, or act on your behalf with any provider or institution. You remain responsible for completing renewals and applications with the relevant providers.",
  },
  {
    title: "17. Document intelligence limitation",
    body: "Any automated date extraction or classification is provided to assist you and may be inaccurate or incomplete. You should verify important dates and details yourself. AI-assisted processing is being introduced gradually and may not be available.",
  },
  {
    title: "18. Organization / workspace responsibilities",
    body: "If you create or join an organization workspace, you are responsible for using shared documents and member data appropriately and in line with applicable rules and the workspace's settings. If you collect documents from other people, you are responsible for having a lawful basis to do so. See the Data Processing Addendum for organization data handling.",
  },
  {
    title: "19. Feedback",
    body: "If you send feedback or suggestions, CertaNest may use them to improve the product without obligation to you. Do not include passwords, access codes, or sensitive document contents in feedback.",
  },
  {
    title: "20. Service availability",
    body: "CertaNest is provided on an 'as available' basis during beta and may be unavailable, interrupted, or changed at any time. Keep your own copies of documents you cannot afford to lose.",
  },
  {
    title: "21. Data deletion and termination",
    body: "You can request a data export and account deletion through the product; deletion is handled as a reviewable, cancellable request while pending. CertaNest may suspend or end access that violates these terms.",
  },
  {
    title: "22. Disclaimers",
    body: "CertaNest helps you organize and track information. It does not provide legal, immigration, tax, insurance, medical, or financial advice, and does not guarantee that deadlines or official requirements will be met. Verify official requirements with the relevant authority.",
  },
  {
    title: "23. Limitation of liability (draft)",
    body: "To the extent permitted by law, CertaNest is provided without warranties, and the team is not liable for indirect or consequential losses arising from use of the beta. This clause is a draft and will be finalized with legal review.",
  },
  {
    title: "24. Governing law and disputes (draft)",
    body: "The governing law and dispute-resolution process for these terms will be set with legal review before public launch and stated here. Until then, this draft does not specify a jurisdiction.",
  },
  {
    title: "25. Changes to terms",
    body: "These terms may be updated as CertaNest evolves. Continued use after changes means you accept the updated draft. The terms will be reviewed before a public production launch.",
  },
  {
    title: "26. Contact",
    body: "Questions about these terms can be sent through the Contact page.",
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms"
      title="Terms draft"
      intro="The terms for using CertaNest during its private beta, including plans, billing, and cancellation. This is a product draft for clarity, not final legal text."
      sections={sections}
      footerLinks={[
        { label: "Privacy", href: "/privacy" },
        { label: "Data Processing Addendum", href: "/dpa" },
        { label: "Trust & Security", href: "/security" },
        { label: "Data & Deletion", href: "/data-deletion" },
        { label: "Contact", href: "/contact" },
      ]}
    />
  );
}
