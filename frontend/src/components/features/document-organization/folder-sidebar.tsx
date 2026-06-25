"use client";

// FolderSidebar — the organizing spine for Custom Document Organization V1.
// Shows the folder tree (indented, with doc counts), an "Unfiled" entry, a
// Smart views section (SMART_VIEW_PRESETS), a Tags filter list, and a
// Collections list. Surface-agnostic: the parent owns the data and the active
// selection; this component is purely presentational + selection callbacks.

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  Layers,
  Plus,
  Sparkles,
  Tag as TagIcon,
} from "lucide-react";

import { SMART_VIEW_PRESETS } from "@/lib/document-organization";
import { tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type {
  Collection,
  FolderNode,
  OrgTag,
} from "@/types/document-organization";

/** What the sidebar currently has selected. */
export type OrgSelection =
  | { kind: "folder"; id: number }
  | { kind: "unfiled" }
  | { kind: "smart"; presetKey: string }
  | { kind: "tag"; id: number }
  | { kind: "collection"; id: number }
  | null;

export interface FolderSidebarProps {
  folders: FolderNode[];
  tags: OrgTag[];
  collections: Collection[];
  selection: OrgSelection;
  onSelect: (selection: OrgSelection) => void;
  /** When set, a "+ New folder" affordance is shown (admins / owners only). */
  onCreateFolder?: () => void;
  className?: string;
}

function sameSelection(a: OrgSelection, b: OrgSelection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "smart" && b.kind === "smart")
    return a.presetKey === b.presetKey;
  if ("id" in a && "id" in b) return a.id === b.id;
  return true;
}

function FolderRow({
  node,
  depth,
  selection,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selection: OrgSelection;
  onSelect: (s: OrgSelection) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const active = sameSelection(selection, { kind: "folder", id: node.id });

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-2 text-sm transition-colors",
          active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60",
        )}
        style={{ paddingLeft: `${0.25 + depth * 0.85}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect({ kind: "folder", id: node.id })}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          {active ? (
            <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.document_count !== null && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {node.document_count}
            </span>
          )}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SidebarSection({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" aria-hidden />
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function PlainRow({
  active,
  icon: Icon,
  label,
  count,
  onSelect,
  swatchColor,
}: {
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  onSelect: () => void;
  swatchColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60",
      )}
    >
      {Icon && (
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {swatchColor && (
        <span
          className={cn("size-3 shrink-0 rounded-full", tagColorClass(swatchColor))}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

export function FolderSidebar({
  folders,
  tags,
  collections,
  selection,
  onSelect,
  onCreateFolder,
  className,
}: FolderSidebarProps) {
  return (
    <nav
      aria-label="Organize documents"
      className={cn("space-y-5", className)}
    >
      <SidebarSection
        title="Folders"
        icon={Layers}
        action={
          onCreateFolder ? (
            <button
              type="button"
              onClick={onCreateFolder}
              aria-label="New folder"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          ) : undefined
        }
      >
        <ul className="space-y-0.5">
          <li>
            <PlainRow
              active={sameSelection(selection, { kind: "unfiled" })}
              icon={Inbox}
              label="Unfiled"
              onSelect={() => onSelect({ kind: "unfiled" })}
            />
          </li>
          {folders.length === 0 ? (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">
              No folders yet.
            </li>
          ) : (
            folders.map((node) => (
              <FolderRow
                key={node.id}
                node={node}
                depth={0}
                selection={selection}
                onSelect={onSelect}
              />
            ))
          )}
        </ul>
      </SidebarSection>

      <SidebarSection title="Smart views" icon={Sparkles}>
        <ul className="space-y-0.5">
          {SMART_VIEW_PRESETS.map((preset) => (
            <li key={preset.key}>
              <PlainRow
                active={sameSelection(selection, {
                  kind: "smart",
                  presetKey: preset.key,
                })}
                icon={Sparkles}
                label={preset.label}
                onSelect={() =>
                  onSelect({ kind: "smart", presetKey: preset.key })
                }
              />
            </li>
          ))}
        </ul>
      </SidebarSection>

      {tags.length > 0 && (
        <SidebarSection title="Tags" icon={TagIcon}>
          <ul className="space-y-0.5">
            {tags.map((tag) => (
              <li key={tag.id}>
                <PlainRow
                  active={sameSelection(selection, { kind: "tag", id: tag.id })}
                  swatchColor={tag.color}
                  label={tag.name}
                  onSelect={() => onSelect({ kind: "tag", id: tag.id })}
                />
              </li>
            ))}
          </ul>
        </SidebarSection>
      )}

      {collections.length > 0 && (
        <SidebarSection title="Collections" icon={Layers}>
          <ul className="space-y-0.5">
            {collections.map((collection) => (
              <li key={collection.id}>
                <PlainRow
                  active={sameSelection(selection, {
                    kind: "collection",
                    id: collection.id,
                  })}
                  icon={Layers}
                  label={collection.name}
                  count={collection.item_count}
                  onSelect={() =>
                    onSelect({ kind: "collection", id: collection.id })
                  }
                />
              </li>
            ))}
          </ul>
        </SidebarSection>
      )}
    </nav>
  );
}
