"use client";

// A single person row in the portal's People list. Expands to show/edit the
// org's custom fields for that person. Custom fields (schema + values) are
// lazily fetched on first expand, so the list stays light until a row is
// opened. Custom field data is internal only — never shown on public pages.

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/product-ui";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CustomFieldsEditModal,
  CustomFieldsView,
} from "@/components/features/portals/custom-fields-section";
import { ApiError } from "@/lib/api";
import {
  PORTAL_PERSON_STATUS_LABELS,
  PORTAL_PERSON_STATUS_TONE,
  PORTAL_PERSON_TYPE_LABELS,
  getPersonCustomFields,
  setPersonCustomFields,
} from "@/lib/portals";
import type {
  CustomField,
  CustomFieldValues,
  PortalPerson,
} from "@/types/portals";

export function PersonCard({
  orgId,
  person,
  canManage,
}: {
  orgId: number;
  person: PortalPerson;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<CustomField[] | null>(null);
  const [values, setValues] = useState<CustomFieldValues>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const loadFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPersonCustomFields(orgId, person.id);
      setSchema(res.schema);
      setValues(res.values);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load custom fields.",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, person.id]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && schema === null && !loading) void loadFields();
  }

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{person.full_name}</h3>
            <StatusBadge
              tone={PORTAL_PERSON_STATUS_TONE[person.status]}
              withDot={false}
            >
              {PORTAL_PERSON_STATUS_LABELS[person.status]}
            </StatusBadge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {PORTAL_PERSON_TYPE_LABELS[person.person_type]}
            </span>
            {person.email && <span className="truncate">{person.email}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {person.active_cases} active case
            {person.active_cases === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {open ? "Hide details" : "Details"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading details…
            </p>
          ) : error ? (
            <InlineAlert>{error}</InlineAlert>
          ) : schema && schema.length > 0 ? (
            <div className="space-y-3">
              <CustomFieldsView schema={schema} values={values} />
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  Edit details
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No custom fields are set up for people yet. Add some under
              Settings to capture details like a reference number or program.
            </p>
          )}
        </div>
      )}

      {editing && canManage && schema && (
        <CustomFieldsEditModal
          title={`Edit details — ${person.full_name}`}
          description="These details stay internal to your team — they are never shown on public pages."
          schema={schema}
          values={values}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            const res = await setPersonCustomFields(orgId, person.id, next);
            setValues(res.values);
            setEditing(false);
          }}
        />
      )}
    </article>
  );
}
