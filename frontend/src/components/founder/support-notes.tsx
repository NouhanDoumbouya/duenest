"use client";

// Founder-only support notes on a user or organization. Internal support
// context — never shown to the user/org. Reused by the user + org detail pages.

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createFounderSupportNote,
  updateFounderSupportNote,
} from "@/lib/founder";
import type { FounderSupportNote } from "@/types/founder";

const NOTE_TYPES = ["support", "beta", "billing", "technical", "risk"] as const;
const SELECT =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function SupportNotes({
  targetUser,
  targetOrganization,
  initialNotes,
}: {
  targetUser?: number;
  targetOrganization?: number;
  initialNotes: FounderSupportNote[];
}) {
  const [notes, setNotes] = useState<FounderSupportNote[]>(initialNotes);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<string>("support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addNote() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const note = await createFounderSupportNote({
        target_user: targetUser,
        target_organization: targetOrganization,
        note_type: noteType,
        body: body.trim(),
      });
      setNotes((n) => [note, ...n]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveNote(id: number) {
    setBusy(true);
    try {
      const updated = await updateFounderSupportNote(id, { status: "resolved" });
      setNotes((n) => n.map((note) => (note.id === id ? updated : note)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Support notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className={SELECT}
            aria-label="Note type"
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Internal support context (never shown to the user)…"
            className="flex-1"
          />
          <Button onClick={addNote} disabled={busy || !body.trim()}>
            Add note
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        {notes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No support notes yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{note.note_type}</Badge>
                    <Badge
                      variant={note.status === "resolved" ? "secondary" : "outline"}
                      className={
                        note.status === "resolved"
                          ? "bg-brand-success/15 text-brand-success"
                          : undefined
                      }
                    >
                      {note.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {note.created_by_email ?? "founder"} ·{" "}
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {note.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveNote(note.id)}
                      disabled={busy}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
