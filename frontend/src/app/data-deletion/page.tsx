import type { Metadata } from "next";

import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";

export const metadata: Metadata = {
  title: "Data & Deletion",
  description:
    "How to delete files, request a data export, and request account deletion in DueNest. A private-beta draft.",
  alternates: { canonical: "/data-deletion" },
};

const sections: LegalSection[] = [
  {
    title: "Deleting files",
    body: "You can delete individual files and documents from your vault. Deleting moves an item to Trash so it can be recovered if you change your mind.",
  },
  {
    title: "Trash and restore",
    body: "Items in Trash remain recoverable until you permanently delete them or they are cleared. Restoring an item returns it to your vault.",
  },
  {
    title: "Permanent deletion",
    body: "Permanently deleting an item removes it from your vault. Once permanently deleted, an item cannot be restored, so confirm before doing so.",
  },
  {
    title: "Requesting a data export",
    body: "You can request a structured export of your data from your account's data controls. Exports include your document metadata and related summaries, not raw storage paths or share access codes.",
  },
  {
    title: "Requesting account deletion",
    body: "You can request account deletion from your account's data controls. Deletion is handled as a request that can be reviewed and cancelled while it is pending, so an accidental request can be reversed before it is finalized.",
  },
  {
    title: "Shared links after deletion",
    body: "Deleting or revoking a shared item stops new access through its link. Once a share is revoked or expired, it no longer grants access.",
  },
  {
    title: "Emergency access after deletion",
    body: "Emergency Access exposes only the items you select. Removing those items or revoking the access prevents them from being viewed through it.",
  },
  {
    title: "Recipients who already saved a copy",
    body: "If you allowed a recipient to save their own copy of a shared file, that saved copy becomes theirs and cannot be revoked after the fact. Only allow save-a-copy when you intend the recipient to keep it.",
  },
  {
    title: "Organization data",
    body: "Documents and requests shared within an organization workspace may be retained according to that workspace's settings and the needs of its members and owners, separate from your personal vault.",
  },
  {
    title: "Backups and retention",
    body: "Operational backups and logs may retain some information for a limited period for reliability and security before being cycled out. This draft will be finalized with specific retention windows before public launch.",
  },
  {
    title: "Need help?",
    body: "If you need assistance with deletion or a data request, contact support through the Contact page. Please do not include passwords, access codes, or sensitive document contents in your message.",
  },
];

export default function DataDeletionPage() {
  return (
    <LegalShell
      eyebrow="Data & Deletion"
      title="Your data and deletion"
      intro="How to delete files, request a data export, and request account deletion in DueNest. You stay in control of your records."
      sections={sections}
      footerLinks={[
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Trust & Security", href: "/security" },
        { label: "Contact", href: "/contact" },
      ]}
    />
  );
}
