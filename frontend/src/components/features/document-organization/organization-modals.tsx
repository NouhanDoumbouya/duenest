"use client";

// Shared modals for Custom Document Organization V1 — folders, tags, and
// collections. These mirror the portal TemplateFormModal's DrawerBackdrop +
// DrawerPanel shell. They are surface-agnostic: each takes its data-access
// callbacks as props so the same modal serves the personal Vault and the
// organization portal.
//
// Trust model: folders are a presentation lens. Moving a document into a folder
// does NOT change who can see or access it.

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, FolderPlus, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { flattenFolderTree } from "@/lib/document-organization";
import { TAG_COLORS, tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type {
  Collection,
  CreateCollectionBody,
  CreateFolderBody,
  CreateTagBody,
  FolderNode,
  OrgTag,
} from "@/types/document-organization";

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/** A small swatch row to pick a folder/tag colour from the shared palette. */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={color}
          aria-pressed={value === color}
          className={cn(
            "size-7 rounded-full ring-offset-2 ring-offset-card transition",
            tagColorClass(color),
            value === color ? "ring-2 ring-ring" : "ring-0",
          )}
        />
      ))}
    </div>
  );
}

// ---- Create / rename folder -------------------------------------------------

export interface FolderFormModalProps {
  /** Folders for the optional parent picker (current tree). */
  folders: FolderNode[];
  /** When set, the modal renames this folder instead of creating one. */
  folder?: FolderNode | null;
  /** Pre-selected parent for a new folder (e.g. "create inside this folder"). */
  defaultParentId?: number | null;
  onClose: () => void;
  onCreate: (body: CreateFolderBody) => Promise<unknown>;
  onRename: (id: number, name: string, color: string, description: string) => Promise<unknown>;
  onDone: (message: string) => void;
}

export function FolderFormModal({
  folders,
  folder,
  defaultParentId = null,
  onClose,
  onCreate,
  onRename,
  onDone,
}: FolderFormModalProps) {
  const isEdit = Boolean(folder);
  const [name, setName] = useState(folder?.name ?? "");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [color, setColor] = useState(folder?.color || "slate");
  const [parentId, setParentId] = useState<number | "">(
    defaultParentId ?? "",
  );
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const trimmed = name.trim();
  const nameEmpty = trimmed.length === 0;

  // When editing, the folder can't be its own parent — exclude its subtree.
  const parentOptions = flattenFolderTree(folders).filter(
    (f) => !folder || f.node.id !== folder.id,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameEmpty) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && folder) {
        await onRename(folder.id, trimmed, color, description.trim());
        onDone("Folder updated.");
      } else {
        await onCreate({
          name: trimmed,
          parent: parentId === "" ? null : parentId,
          color,
          description: description.trim() || undefined,
        });
        onDone("Folder created.");
      }
    } catch (err) {
      setError(errorMessage(err, "Could not save the folder."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={isEdit ? "Rename folder" : "Create folder"}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title={isEdit ? "Rename folder" : "New folder"}
          description={
            isEdit
              ? "Update this folder's name, colour, or description."
              : "Group related documents. Folders are a private organizing lens."
          }
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Travel, Visas, Insurance"
              aria-invalid={touched && nameEmpty}
            />
            {touched && nameEmpty && (
              <p className="text-xs text-destructive">A folder name is required.</p>
            )}
          </div>

          {!isEdit && parentOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="folder-parent">Parent folder (optional)</Label>
              <select
                id="folder-parent"
                value={parentId}
                onChange={(e) =>
                  setParentId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No parent (top level)</option>
                {parentOptions.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {`${"  ".repeat(depth)}${node.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folder-desc">Description (optional)</Label>
            <Textarea
              id="folder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What belongs in this folder?"
            />
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || nameEmpty}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderPlus className="size-4" aria-hidden />
              )}
              {isEdit ? "Save changes" : "Create folder"}
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Move document to folder ------------------------------------------------

export interface MoveToFolderModalProps {
  documentTitle: string;
  folders: FolderNode[];
  /** The document's current folder (to mark it / default selection). */
  currentFolderId: number | null;
  onClose: () => void;
  onMove: (folderId: number | null) => Promise<unknown>;
  onDone: (message: string) => void;
}

export function MoveToFolderModal({
  documentTitle,
  folders,
  currentFolderId,
  onClose,
  onMove,
  onDone,
}: MoveToFolderModalProps) {
  const [selected, setSelected] = useState<number | null>(currentFolderId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);

  const flat = flattenFolderTree(folders);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onMove(selected);
      onDone(selected === null ? "Document unfiled." : "Document moved.");
    } catch (err) {
      setError(errorMessage(err, "Could not move the document."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label="Move to folder" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Move to folder"
          description={documentTitle}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <TrustNotice icon={FolderPlus} title="Organizing only">
            Folders organize your view. Moving a document here does not change who
            can see or access it.
          </TrustNotice>

          <ul className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
            <li>
              <FolderRadio
                checked={selected === null}
                label="Unfiled"
                depth={0}
                onSelect={() => setSelected(null)}
              />
            </li>
            {flat.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No folders yet. Create one to start filing documents.
              </li>
            ) : (
              flat.map(({ node, depth }) => (
                <li key={node.id}>
                  <FolderRadio
                    checked={selected === node.id}
                    label={node.name}
                    depth={depth}
                    onSelect={() => setSelected(node.id)}
                  />
                </li>
              ))
            )}
          </ul>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Move
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function FolderRadio({
  checked,
  label,
  depth,
  onSelect,
}: {
  checked: boolean;
  label: string;
  depth: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        checked ? "bg-primary/10 text-foreground" : "hover:bg-muted/60",
      )}
      style={{ paddingLeft: `${0.625 + depth * 0.9}rem` }}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
        aria-hidden
      >
        {checked && <CheckCircle2 className="size-3" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ---- Add tags ---------------------------------------------------------------

export interface TagAssignModalProps {
  documentTitle: string;
  tags: OrgTag[];
  /** Tag ids currently on the document. */
  selectedTagIds: number[];
  onClose: () => void;
  onCreateTag: (body: CreateTagBody) => Promise<OrgTag>;
  onAssign: (tagIds: number[]) => Promise<unknown>;
  onDone: (message: string) => void;
}

export function TagAssignModal({
  documentTitle,
  tags,
  selectedTagIds,
  onClose,
  onCreateTag,
  onAssign,
  onDone,
}: TagAssignModalProps) {
  const [allTags, setAllTags] = useState<OrgTag[]>(tags);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(selectedTagIds),
  );
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const tag = await onCreateTag({ name });
      setAllTags((prev) => [...prev, tag]);
      setSelected((prev) => new Set(prev).add(tag.id));
      setNewTagName("");
    } catch (err) {
      setError(errorMessage(err, "Could not create the tag."));
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onAssign(Array.from(selected));
      onDone("Tags updated.");
    } catch (err) {
      setError(errorMessage(err, "Could not update tags."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label="Add tags" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Tags"
          description={documentTitle}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {allTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tags yet. Create one below.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const on = selected.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium ring-offset-2 ring-offset-card transition",
                      tagColorClass(tag.color),
                      on ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-tag">New tag</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g. Urgent"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateTag();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCreateTag()}
                disabled={creating || newTagName.trim().length === 0}
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Save tags
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Add to collection ------------------------------------------------------

export interface CollectionAssignModalProps {
  documentTitle: string;
  documentId: number;
  collections: Collection[];
  onClose: () => void;
  onCreateCollection: (body: CreateCollectionBody) => Promise<Collection>;
  onAdd: (collectionId: number, documentId: number, remove: boolean) => Promise<unknown>;
  onDone: (message: string) => void;
}

export function CollectionAssignModal({
  documentTitle,
  documentId,
  collections,
  onClose,
  onCreateCollection,
  onAdd,
  onDone,
}: CollectionAssignModalProps) {
  // Only manual collections accept ad-hoc items; smart/saved views are derived.
  const [allCollections, setAllCollections] = useState<Collection[]>(
    collections.filter((c) => c.collection_type === "manual"),
  );
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEscapeClose(onClose);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const collection = await onCreateCollection({
        name,
        collection_type: "manual",
      });
      setAllCollections((prev) => [...prev, collection]);
      setNewName("");
    } catch (err) {
      setError(errorMessage(err, "Could not create the collection."));
    } finally {
      setCreating(false);
    }
  }

  async function handleAdd(collectionId: number) {
    setBusyId(collectionId);
    setError(null);
    try {
      await onAdd(collectionId, documentId, false);
      onDone("Added to collection.");
    } catch (err) {
      setError(errorMessage(err, "Could not add to the collection."));
      setBusyId(null);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel label="Add to collection" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Add to collection"
          description={documentTitle}
          onClose={onClose}
        />
        <div className="mt-5 space-y-4">
          {allCollections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No collections yet. Create one below.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {allCollections.map((collection) => (
                <li
                  key={collection.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {collection.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleAdd(collection.id)}
                    disabled={busyId === collection.id}
                  >
                    {busyId === collection.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-collection">New collection</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-collection"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Scholarship pack"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCreate()}
                disabled={creating || newName.trim().length === 0}
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}
