"use client";

// Personal Vault — Organize. A folder/tag/collection/smart-view lens over the
// user's documents. The flat Documents list (and the rest of the Vault) keeps
// working unchanged; this is an additional way to browse and file documents.
//
// Trust model: folders are a private presentation lens. Filing a document does
// NOT change its sharing or access. No raw file URLs are rendered here.

import Link from "next/link";
import { FolderTree } from "lucide-react";

import { OrganizationWorkspace } from "@/components/features/document-organization/organization-workspace";
import type { OrganizationDataSource } from "@/components/features/document-organization/organization-workspace";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { TrustNotice } from "@/components/ui/product-ui";
import {
  addToCollection,
  assignDocumentTags,
  createCollection,
  createFolder,
  createTag,
  getCollectionItems,
  getCollections,
  getFolderContents,
  getFolders,
  getTags,
  moveDocumentToFolder,
  resolveSmartView,
  updateFolder,
} from "@/lib/document-organization";
import { cn } from "@/lib/utils";
import type { DocOrg } from "@/types/document-organization";

// Personal endpoint adapter. The current user always manages their own vault.
const personalSource: OrganizationDataSource = {
  getFolders: () => getFolders(false),
  getTags,
  getCollections,
  getFolderContents: (id) => getFolderContents(id),
  resolveSmartView,
  getCollectionItems,
  createFolder,
  renameFolder: (id, body) =>
    updateFolder(id, {
      name: body.name,
      color: body.color,
      description: body.description,
    }),
  moveDocumentToFolder,
  createTag,
  assignDocumentTags,
  createCollection,
  addToCollection,
};

function hrefForDoc(doc: DocOrg): string {
  return `/dashboard/documents/${doc.id}`;
}

export default function VaultOrganizePage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Vault"
        title="Organize"
        description="Folders, tags, collections, and smart views — an organizing lens over your documents."
        actions={
          <Link
            href="/dashboard/documents"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            All documents
          </Link>
        }
      />

      <TrustNotice icon={FolderTree} title="An organizing lens">
        Folders and tags help you find documents fast. They&apos;re private to
        you and don&apos;t change who can see or access a document.
      </TrustNotice>

      <OrganizationWorkspace
        source={personalSource}
        canManage
        hrefForDoc={hrefForDoc}
      />
    </PageContainer>
  );
}
