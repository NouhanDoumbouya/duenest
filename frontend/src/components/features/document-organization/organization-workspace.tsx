"use client";

// OrganizationWorkspace — the shared sidebar + contents experience for Custom
// Document Organization V1. Both the personal Vault Organize page and the
// organization portal Documents page render this, passing a small data-access
// adapter so the same UI serves both surfaces with their own endpoints +
// permissions.
//
// Trust model: folders are a presentation lens; placing a document in a folder
// does NOT change its sharing or access. No raw file URLs are ever rendered.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/ui/toast";
import {
  FolderSidebar,
  type OrgSelection,
} from "./folder-sidebar";
import {
  FolderContentsView,
  type DocActions,
} from "./folder-contents-view";
import {
  CollectionAssignModal,
  FolderFormModal,
  MoveToFolderModal,
  TagAssignModal,
} from "./organization-modals";
import { SMART_VIEW_PRESETS } from "@/lib/document-organization";
import type {
  Collection,
  CreateCollectionBody,
  CreateFolderBody,
  CreateTagBody,
  DocOrg,
  FolderBreadcrumbItem,
  FolderNode,
  OrgTag,
  SmartViewFilter,
} from "@/types/document-organization";

/** The endpoint adapter the workspace calls. Personal + org pages each supply one. */
export interface OrganizationDataSource {
  getFolders: () => Promise<{ folders: FolderNode[] }>;
  getTags: () => Promise<{ tags: OrgTag[] }>;
  getCollections: () => Promise<{ collections: Collection[] }>;
  getFolderContents: (
    id: number,
  ) => Promise<{
    folder: FolderNode;
    breadcrumb: FolderBreadcrumbItem[];
    documents: DocOrg[];
    count: number;
  }>;
  resolveSmartView: (
    filter: SmartViewFilter,
  ) => Promise<{ documents: DocOrg[]; count: number }>;
  getCollectionItems: (
    id: number,
  ) => Promise<{ documents: DocOrg[]; count: number }>;
  /** Admin-only writes. Omit (or pass undefined) for read-only surfaces. */
  createFolder?: (body: CreateFolderBody) => Promise<FolderNode>;
  renameFolder?: (
    id: number,
    body: { name: string; color: string; description: string },
  ) => Promise<FolderNode>;
  moveDocumentToFolder?: (
    documentId: number,
    folderId: number | null,
  ) => Promise<unknown>;
  createTag?: (body: CreateTagBody) => Promise<OrgTag>;
  assignDocumentTags?: (documentId: number, tagIds: number[]) => Promise<unknown>;
  createCollection?: (body: CreateCollectionBody) => Promise<Collection>;
  addToCollection?: (
    collectionId: number,
    documentId: number,
    remove: boolean,
  ) => Promise<unknown>;
}

interface ContentsState {
  title: string;
  description?: string;
  breadcrumb?: FolderBreadcrumbItem[];
  documents: DocOrg[];
  count: number;
  loading: boolean;
  error: string | null;
}

const EMPTY_CONTENTS: ContentsState = {
  title: "All documents",
  documents: [],
  count: 0,
  loading: false,
  error: null,
};

export interface OrganizationWorkspaceProps {
  source: OrganizationDataSource;
  /** When false, the contents list is read-only (no per-row actions). */
  canManage: boolean;
  /** Build a link to a document detail page (optional). */
  hrefForDoc?: (doc: DocOrg) => string | undefined;
}

export function OrganizationWorkspace({
  source,
  canManage,
  hrefForDoc,
}: OrganizationWorkspaceProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [tags, setTags] = useState<OrgTag[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [shellLoading, setShellLoading] = useState(true);
  const [shellError, setShellError] = useState<string | null>(null);

  const [selection, setSelection] = useState<OrgSelection>({ kind: "unfiled" });
  const [contents, setContents] = useState<ContentsState>(EMPTY_CONTENTS);

  const [toast, setToast] = useState<ToastState | null>(null);

  // Modal state.
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moveDoc, setMoveDoc] = useState<DocOrg | null>(null);
  const [tagDoc, setTagDoc] = useState<DocOrg | null>(null);
  const [collectionDoc, setCollectionDoc] = useState<DocOrg | null>(null);

  const reloadShell = useCallback(async () => {
    setShellLoading(true);
    setShellError(null);
    try {
      const [foldersRes, tagsRes, collectionsRes] = await Promise.all([
        source.getFolders(),
        source.getTags(),
        source.getCollections(),
      ]);
      setFolders(foldersRes.folders);
      setTags(tagsRes.tags);
      setCollections(collectionsRes.collections);
    } catch (err) {
      setShellError(
        err instanceof Error ? err.message : "Could not load your folders.",
      );
    } finally {
      setShellLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void reloadShell();
  }, [reloadShell]);

  const loadContents = useCallback(
    async (sel: OrgSelection) => {
      if (sel === null) {
        setContents(EMPTY_CONTENTS);
        return;
      }
      setContents((prev) => ({ ...prev, loading: true, error: null }));
      try {
        if (sel.kind === "folder") {
          const res = await source.getFolderContents(sel.id);
          setContents({
            title: res.folder.name,
            description: res.folder.description || undefined,
            breadcrumb: res.breadcrumb,
            documents: res.documents,
            count: res.count,
            loading: false,
            error: null,
          });
          return;
        }
        if (sel.kind === "unfiled") {
          const res = await source.resolveSmartView({ unfiled: true });
          setContents({
            title: "Unfiled",
            documents: res.documents,
            count: res.count,
            loading: false,
            error: null,
          });
          return;
        }
        if (sel.kind === "smart") {
          const preset = SMART_VIEW_PRESETS.find((p) => p.key === sel.presetKey);
          const res = await source.resolveSmartView(preset?.filter ?? {});
          setContents({
            title: preset?.label ?? "Smart view",
            documents: res.documents,
            count: res.count,
            loading: false,
            error: null,
          });
          return;
        }
        if (sel.kind === "tag") {
          const tag = tags.find((t) => t.id === sel.id);
          const res = await source.resolveSmartView({ tag_id: sel.id });
          setContents({
            title: tag ? `Tag: ${tag.name}` : "Tag",
            documents: res.documents,
            count: res.count,
            loading: false,
            error: null,
          });
          return;
        }
        if (sel.kind === "collection") {
          const collection = collections.find((c) => c.id === sel.id);
          const res = await source.getCollectionItems(sel.id);
          setContents({
            title: collection?.name ?? "Collection",
            description: collection?.description || undefined,
            documents: res.documents,
            count: res.count,
            loading: false,
            error: null,
          });
          return;
        }
      } catch (err) {
        setContents((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error ? err.message : "Could not load documents.",
        }));
      }
    },
    [source, tags, collections],
  );

  useEffect(() => {
    void loadContents(selection);
  }, [selection, loadContents]);

  const emptyCopy = useMemo(() => {
    if (selection?.kind === "unfiled") {
      return {
        title: "Nothing left to file",
        description: "Unfiled documents are waiting to be organized.",
      };
    }
    if (selection?.kind === "folder") {
      return {
        title: "No documents in this folder yet",
        description:
          "Move documents into this folder to keep related records together.",
      };
    }
    return {
      title: "Nothing here yet",
      description: "Documents that match this view will show up here.",
    };
  }, [selection]);

  const rowActions: DocActions | undefined = canManage
    ? {
        onMove: source.moveDocumentToFolder ? (doc) => setMoveDoc(doc) : undefined,
        onTags: source.assignDocumentTags ? (doc) => setTagDoc(doc) : undefined,
        onCollection: source.addToCollection
          ? (doc) => setCollectionDoc(doc)
          : undefined,
      }
    : undefined;

  function notify(message: string) {
    setToast({ message, kind: "success" });
  }

  if (shellLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full rounded-md" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (shellError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        <p className="font-medium text-foreground">{shellError}</p>
        <button
          type="button"
          onClick={() => void reloadShell()}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <FolderSidebar
            folders={folders}
            tags={tags}
            collections={collections}
            selection={selection}
            onSelect={setSelection}
            onCreateFolder={
              canManage && source.createFolder
                ? () => setCreatingFolder(true)
                : undefined
            }
          />
        </aside>

        <FolderContentsView
          title={contents.title}
          description={contents.description}
          breadcrumb={contents.breadcrumb}
          documents={contents.documents}
          count={contents.count}
          loading={contents.loading}
          error={contents.error}
          onRetry={() => void loadContents(selection)}
          actions={rowActions}
          hrefForDoc={hrefForDoc}
          emptyTitle={emptyCopy.title}
          emptyDescription={emptyCopy.description}
          onBreadcrumbSelect={(id) => setSelection({ kind: "folder", id })}
        />
      </div>

      {creatingFolder && source.createFolder && (
        <FolderFormModal
          folders={folders}
          defaultParentId={
            selection?.kind === "folder" ? selection.id : null
          }
          onClose={() => setCreatingFolder(false)}
          onCreate={source.createFolder}
          onRename={async (id, name, color, description) => {
            if (!source.renameFolder) return;
            await source.renameFolder(id, { name, color, description });
          }}
          onDone={(message) => {
            setCreatingFolder(false);
            notify(message);
            void reloadShell();
          }}
        />
      )}

      {moveDoc && source.moveDocumentToFolder && (
        <MoveToFolderModal
          documentTitle={moveDoc.title}
          folders={folders}
          currentFolderId={moveDoc.primary_folder_id}
          onClose={() => setMoveDoc(null)}
          onMove={(folderId) =>
            source.moveDocumentToFolder!(moveDoc.id, folderId)
          }
          onDone={(message) => {
            setMoveDoc(null);
            notify(message);
            void reloadShell();
            void loadContents(selection);
          }}
        />
      )}

      {tagDoc && source.assignDocumentTags && (
        <TagAssignModal
          documentTitle={tagDoc.title}
          tags={tags}
          selectedTagIds={tags
            .filter((t) => tagDoc.tags.includes(t.name))
            .map((t) => t.id)}
          onClose={() => setTagDoc(null)}
          onCreateTag={
            source.createTag ??
            (async () => {
              throw new Error("Tags can't be created here.");
            })
          }
          onAssign={(tagIds) => source.assignDocumentTags!(tagDoc.id, tagIds)}
          onDone={(message) => {
            setTagDoc(null);
            notify(message);
            void reloadShell();
            void loadContents(selection);
          }}
        />
      )}

      {collectionDoc && source.addToCollection && (
        <CollectionAssignModal
          documentTitle={collectionDoc.title}
          documentId={collectionDoc.id}
          collections={collections}
          onClose={() => setCollectionDoc(null)}
          onCreateCollection={
            source.createCollection ??
            (async () => {
              throw new Error("Collections can't be created here.");
            })
          }
          onAdd={(collectionId, documentId, remove) =>
            source.addToCollection!(collectionId, documentId, remove)
          }
          onDone={(message) => {
            setCollectionDoc(null);
            notify(message);
            void reloadShell();
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
