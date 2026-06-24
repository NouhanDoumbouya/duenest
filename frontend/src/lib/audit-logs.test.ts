import { describe, expect, it } from "vitest";

import {
  ACTOR_TYPE_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_TONE,
  describeAuditEvent,
  humanizeKey,
  summarizeMetadata,
} from "./audit-logs";
import type {
  AuditLogActorType,
  AuditLogCategory,
  AuditLogEntry,
  AuditLogSeverity,
} from "@/types/audit-logs";

/** Build a minimal entry, overriding only the fields a test cares about. */
function makeEntry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: 1,
    event_type: "sharing_room_opened",
    category: "sharing_room",
    severity: "info",
    actor_type: "public_link",
    actor_label: "Anonymous visitor",
    object_type: "SharingRoom",
    object_id: "10",
    object_label: "Scholarship Submission Room",
    related_object_type: "",
    related_object_id: "",
    related_object_label: "",
    country_code: "",
    metadata: {},
    created_at: "2026-06-24T10:00:00Z",
    ...overrides,
  };
}

describe("label maps", () => {
  it("labels every category in the order list", () => {
    for (const category of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("covers every category key", () => {
    const all: AuditLogCategory[] = [
      "document",
      "file",
      "document_request",
      "sharing_room",
      "protected_copy",
      "application",
      "pack",
      "security",
      "system",
    ];
    for (const category of all) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("labels and tones every severity", () => {
    for (const severity of SEVERITY_ORDER) {
      expect(SEVERITY_LABELS[severity]).toBeTruthy();
      expect(SEVERITY_TONE[severity]).toBeTruthy();
    }
  });

  it("maps severity to the expected tones", () => {
    const expected: Record<AuditLogSeverity, string> = {
      info: "info",
      warning: "warning",
      critical: "danger",
    };
    for (const severity of SEVERITY_ORDER) {
      expect(SEVERITY_TONE[severity]).toBe(expected[severity]);
    }
  });

  it("labels every actor type, with owner as 'You'", () => {
    const actors: AuditLogActorType[] = [
      "owner",
      "authenticated_user",
      "public_link",
      "system",
    ];
    for (const actor of actors) {
      expect(ACTOR_TYPE_LABELS[actor]).toBeTruthy();
    }
    expect(ACTOR_TYPE_LABELS.owner).toBe("You");
  });
});

describe("describeAuditEvent", () => {
  it("describes a public visitor opening a sharing room", () => {
    const entry = makeEntry({
      event_type: "sharing_room_opened",
      actor_type: "public_link",
      object_label: "Scholarship Submission Room",
    });
    expect(describeAuditEvent(entry)).toBe(
      "Room visitor opened Scholarship Submission Room",
    );
  });

  it("describes the owner generating a protected copy", () => {
    const entry = makeEntry({
      event_type: "protected_copy_generated",
      category: "protected_copy",
      actor_type: "owner",
      object_type: "ProtectedDocumentCopy",
      object_label: "Passport (protected)",
    });
    expect(describeAuditEvent(entry)).toBe(
      "You generated protected copy Passport (protected)",
    );
  });

  it("describes the owner revoking a room", () => {
    const entry = makeEntry({
      event_type: "sharing_room_revoked",
      actor_type: "owner",
      object_label: "Visa Renewal Room",
    });
    expect(describeAuditEvent(entry)).toBe("You revoked Visa Renewal Room");
  });

  it("describes a public visitor downloading a file", () => {
    const entry = makeEntry({
      event_type: "sharing_room_file_downloaded",
      actor_type: "public_link",
      object_label: "transcript.png",
    });
    // A download reads with the generic public subject, not "Room visitor".
    expect(describeAuditEvent(entry)).toBe(
      "Public visitor downloaded transcript.png",
    );
  });

  it("describes a document-request upload from a public link", () => {
    const entry = makeEntry({
      event_type: "document_request_file_uploaded",
      category: "document_request",
      actor_type: "public_link",
      object_type: "DocumentRequestLink",
      object_label: "Proof of address",
    });
    expect(describeAuditEvent(entry)).toBe(
      "Public visitor uploaded a file to Proof of address",
    );
  });

  it("describes a system-triggered event", () => {
    const entry = makeEntry({
      event_type: "document_request_email_sent",
      category: "document_request",
      actor_type: "system",
      object_label: "Transcript request",
    });
    expect(describeAuditEvent(entry)).toBe(
      "CertaNest emailed the request Transcript request",
    );
  });

  it("falls back to a humanized event_type for unknown events", () => {
    const entry = makeEntry({
      event_type: "sharing_room_link_rotated",
      actor_type: "owner",
      object_label: "Visa Renewal Room",
    });
    expect(describeAuditEvent(entry)).toBe(
      "You link rotated Visa Renewal Room",
    );
  });

  it("never throws and never returns empty, even with sparse data", () => {
    const entry = makeEntry({
      event_type: "totally_unknown_event",
      actor_type: "owner",
      object_label: "",
      related_object_label: "",
    });
    const sentence = describeAuditEvent(entry);
    expect(sentence.length).toBeGreaterThan(0);
    expect(sentence.startsWith("You")).toBe(true);
  });

  it("uses the related object label when the primary label is empty", () => {
    const entry = makeEntry({
      event_type: "sharing_room_item_added",
      actor_type: "owner",
      object_label: "",
      related_object_label: "transcript.pdf",
    });
    expect(describeAuditEvent(entry)).toBe("You added transcript.pdf");
  });
});

describe("summarizeMetadata", () => {
  it("returns an empty string for empty metadata", () => {
    expect(summarizeMetadata({})).toBe("");
  });

  it("joins a few key/value pairs and humanizes keys", () => {
    const summary = summarizeMetadata({
      file_name: "transcript.png",
      item_count: 3,
    });
    expect(summary).toContain("File name: transcript.png");
    expect(summary).toContain("Item count: 3");
    expect(summary).toContain(" · ");
  });

  it("joins array values and skips null/empty values", () => {
    const summary = summarizeMetadata({
      tags: ["visa", "renewal"],
      note: "",
      missing: null,
    });
    expect(summary).toBe("Tags: visa, renewal");
  });

  it("caps the number of pairs shown", () => {
    const summary = summarizeMetadata(
      { a: 1, b: 2, c: 3, d: 4 },
      2,
    );
    expect(summary.split(" · ")).toHaveLength(2);
  });
});

describe("humanizeKey", () => {
  it("turns snake_case into a capitalized label", () => {
    expect(humanizeKey("file_name")).toBe("File name");
    expect(humanizeKey("country-code")).toBe("Country code");
  });
});
