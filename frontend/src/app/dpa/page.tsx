import type { Metadata } from "next";

import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description:
    "How CertaNest processes documents and personal data on behalf of organizations that collect records from their clients, applicants, or students. A private-beta draft, reviewed before public launch.",
  alternates: { canonical: "/dpa" },
};

const sections: LegalSection[] = [
  {
    title: "1. Purpose and scope",
    body: "This Data Processing Addendum (DPA) describes how CertaNest handles personal data when an organization uses CertaNest to collect, store, review, and share documents from its own clients, applicants, students, or members. It supplements the Terms and applies when you use organization, portal, or document-request features. It is a private-beta draft and will be finalized with legal review.",
  },
  {
    title: "2. Roles of the parties",
    body: "For the documents and personal data an organization collects from its own people, the organization is the data controller (it decides why and how the data is collected) and CertaNest is the data processor (it processes that data on the organization's instructions to operate the service). Each party is responsible for its own compliance obligations in its role.",
  },
  {
    title: "3. Nature and purpose of processing",
    body: "CertaNest processes the data to provide its features: receiving uploads through request links and portals, storing files encrypted at rest, letting authorized staff review and organize submissions, sending operational emails such as reminders, and enabling controlled sharing. CertaNest does not use organization-collected documents for advertising and does not sell them.",
  },
  {
    title: "4. Types of data and data subjects",
    body: "Depending on what an organization collects, the data may include identity and contact details, document files (such as IDs, certificates, and proof documents), and submission metadata. Data subjects are the individuals the organization collects from, such as its clients, applicants, students, or members.",
  },
  {
    title: "5. Organization (controller) responsibilities",
    body: [
      "Have a lawful basis to collect documents from your people and tell them how their data is used.",
      "Request only the documents you actually need, and avoid collecting more than necessary.",
      "Manage who on your team has access, and remove access when it is no longer needed.",
      "Respond to your people's requests about their data, using CertaNest's tools where applicable.",
    ],
  },
  {
    title: "6. CertaNest (processor) commitments",
    body: [
      "Process organization data only to provide the service and on the organization's instructions, not for unrelated purposes.",
      "Keep documents private by default — submissions are scoped to the organization and its authorized members, never public unless the organization shares them.",
      "Apply security measures including encryption of files at rest, scoped access control, hashed access codes, and server-side checks on expired or revoked access.",
      "Limit staff access to what is needed to operate and support the service.",
    ],
  },
  {
    title: "7. Subprocessors",
    body: "CertaNest uses a limited set of service providers to operate, including cloud hosting, object storage (Cloudflare R2) for encrypted files, email delivery (Resend), and payment processing (Stripe) for the organization's own subscription. AI providers are used only if the organization enables AI features and only for the content selected for an AI action. These providers process data to support the service and are expected to maintain appropriate safeguards. The current list is maintained in the Privacy page.",
  },
  {
    title: "8. Security measures",
    body: "CertaNest applies technical and organizational measures appropriate to the data, including encryption of uploaded files at rest, account- and organization-scoped access, hashed access codes with rate limiting and lockout, malware scanning of uploads, audit trails for sensitive actions, and server-side enforcement of expiry and revocation. No system can guarantee perfect security.",
  },
  {
    title: "9. Personal data breach",
    body: "If CertaNest becomes aware of a personal data breach affecting an organization's data, it will notify the organization without undue delay and share the information reasonably available to help the organization meet its own notification obligations. Specific timelines will be confirmed with legal review.",
  },
  {
    title: "10. Data subject requests",
    body: "If a data subject contacts CertaNest directly about organization-collected data, CertaNest will, where appropriate, direct them to the controlling organization. CertaNest provides tools that help organizations review, export, and delete submissions so they can respond to such requests.",
  },
  {
    title: "11. Return and deletion of data",
    body: "On termination of an organization's use of the service, or on request, CertaNest will, within a reasonable period and subject to operational and legal retention needs, delete or return the organization's data. Deleted items follow the deletion behavior described on the Data & Deletion page.",
  },
  {
    title: "12. Confidentiality",
    body: "CertaNest treats organization-collected data as confidential and limits access to personnel who need it to operate or support the service.",
  },
  {
    title: "13. International transfers",
    body: "Data may be processed in the locations where CertaNest and its providers operate. Appropriate transfer safeguards will be confirmed with legal review before public launch.",
  },
  {
    title: "14. Changes and contact",
    body: "This DPA draft may change as the product and its compliance posture mature, and will be reviewed before a public production launch. Questions, or a request for a signed DPA, can be sent through the Contact page.",
  },
];

export default function DpaPage() {
  return (
    <LegalShell
      eyebrow="Data Processing Addendum"
      title="Data Processing Addendum draft"
      intro="How CertaNest processes documents and personal data on behalf of organizations that collect records from their clients, applicants, students, or members. This is a product draft for clarity, not final legal text."
      sections={sections}
      footerLinks={[
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Trust & Security", href: "/security" },
        { label: "Data & Deletion", href: "/data-deletion" },
        { label: "Contact", href: "/contact" },
      ]}
    />
  );
}
