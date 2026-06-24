import { describe, expect, it } from "vitest";

import {
  DOCUMENT_REQUEST_BUCKET_LABELS,
  DOCUMENT_REQUEST_STATUS_LABELS,
  DOCUMENT_REQUEST_STATUS_ORDER,
  DOCUMENT_REQUEST_STATUS_TONE,
  bucketForStatus,
  buildPublicRequestUrl,
  groupRequestsByBucket,
  isAwaitingRecipient,
  isAwaitingReview,
  publicStateMessage,
} from "./document-requests";
import type {
  DocumentRequestLink,
  DocumentRequestStatus,
} from "@/types/document-requests";

function request(
  id: number,
  status: DocumentRequestStatus,
  overrides: Partial<DocumentRequestLink> = {},
): DocumentRequestLink {
  return {
    id,
    owner: 1,
    status,
    token: `tok-${id}`,
    upload_url: "",
    requested_document_title: `Doc ${id}`,
    requested_document_type: "",
    instructions: "",
    recipient_name: "",
    recipient_email: "",
    recipient_message: "",
    due_date: null,
    expires_at: null,
    max_uploads: 1,
    upload_count: 0,
    linked_bundle: null,
    linked_application: null,
    linked_requirement: null,
    uploaded_file: null,
    uploaded_file_info: null,
    created_document: null,
    rejection_reason: "",
    owner_note: "",
    is_expired: false,
    can_upload: true,
    opened_at: null,
    uploaded_at: null,
    reviewed_at: null,
    accepted_at: null,
    rejected_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("status label + tone + order maps", () => {
  it("labels every status in the order list", () => {
    for (const status of DOCUMENT_REQUEST_STATUS_ORDER) {
      expect(DOCUMENT_REQUEST_STATUS_LABELS[status]).toBeTruthy();
      expect(DOCUMENT_REQUEST_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("uses calm, recipient-friendly wording", () => {
    expect(DOCUMENT_REQUEST_STATUS_LABELS.requested).toBe("Sent");
    expect(DOCUMENT_REQUEST_STATUS_LABELS.needs_replacement).toBe(
      "Needs replacement",
    );
    expect(DOCUMENT_REQUEST_STATUS_LABELS.accepted).toBe("Accepted");
  });

  it("maps review-pending statuses to a warning tone", () => {
    expect(DOCUMENT_REQUEST_STATUS_TONE.uploaded).toBe("warning");
    expect(DOCUMENT_REQUEST_STATUS_TONE.under_review).toBe("warning");
    expect(DOCUMENT_REQUEST_STATUS_TONE.accepted).toBe("success");
    expect(DOCUMENT_REQUEST_STATUS_TONE.rejected).toBe("danger");
  });
});

describe("bucketForStatus", () => {
  it("routes uploads waiting on the owner into needs_you", () => {
    expect(bucketForStatus("uploaded")).toBe("needs_you");
    expect(bucketForStatus("under_review")).toBe("needs_you");
  });

  it("routes recipient-pending statuses into waiting", () => {
    expect(bucketForStatus("draft")).toBe("waiting");
    expect(bucketForStatus("requested")).toBe("waiting");
    expect(bucketForStatus("opened")).toBe("waiting");
    expect(bucketForStatus("needs_replacement")).toBe("waiting");
  });

  it("routes accepted on its own and ended states together", () => {
    expect(bucketForStatus("accepted")).toBe("accepted");
    expect(bucketForStatus("rejected")).toBe("ended");
    expect(bucketForStatus("expired")).toBe("ended");
    expect(bucketForStatus("cancelled")).toBe("ended");
  });
});

describe("groupRequestsByBucket", () => {
  it("groups in display order and omits empty buckets", () => {
    const list = [
      request(1, "requested"),
      request(2, "uploaded"),
      request(3, "accepted"),
    ];
    const grouped = groupRequestsByBucket(list);
    expect(grouped.map((g) => g.bucket)).toEqual([
      "needs_you",
      "waiting",
      "accepted",
    ]);
    expect(grouped[0].items.map((r) => r.id)).toEqual([2]);
  });

  it("preserves input order within a bucket", () => {
    const list = [
      request(10, "uploaded"),
      request(11, "under_review"),
      request(12, "uploaded"),
    ];
    const grouped = groupRequestsByBucket(list);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].bucket).toBe("needs_you");
    expect(grouped[0].items.map((r) => r.id)).toEqual([10, 11, 12]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupRequestsByBucket([])).toEqual([]);
  });

  it("labels every bucket it can produce", () => {
    for (const { bucket } of groupRequestsByBucket([
      request(1, "uploaded"),
      request(2, "requested"),
      request(3, "accepted"),
      request(4, "expired"),
    ])) {
      expect(DOCUMENT_REQUEST_BUCKET_LABELS[bucket]).toBeTruthy();
    }
  });
});

describe("isAwaitingRecipient / isAwaitingReview", () => {
  it("flags recipient-pending statuses", () => {
    expect(isAwaitingRecipient("requested")).toBe(true);
    expect(isAwaitingRecipient("opened")).toBe(true);
    expect(isAwaitingRecipient("needs_replacement")).toBe(true);
    expect(isAwaitingRecipient("uploaded")).toBe(false);
    expect(isAwaitingRecipient("accepted")).toBe(false);
  });

  it("flags review-pending statuses", () => {
    expect(isAwaitingReview("uploaded")).toBe(true);
    expect(isAwaitingReview("under_review")).toBe(true);
    expect(isAwaitingReview("requested")).toBe(false);
    expect(isAwaitingReview("accepted")).toBe(false);
  });
});

describe("buildPublicRequestUrl", () => {
  it("prefers the server-provided upload_url", () => {
    expect(
      buildPublicRequestUrl({
        upload_url: "https://app.certanest.com/document-request/abc",
        token: "abc",
      }),
    ).toBe("https://app.certanest.com/document-request/abc");
  });

  it("constructs from a provided origin when no upload_url", () => {
    expect(
      buildPublicRequestUrl(
        { upload_url: "", token: "xyz" },
        "https://app.certanest.com/",
      ),
    ).toBe("https://app.certanest.com/document-request/xyz");
  });

  it("returns empty string when there is nothing to build from", () => {
    expect(buildPublicRequestUrl({ upload_url: "", token: "" }, "")).toBe("");
    expect(buildPublicRequestUrl({ upload_url: "", token: "xyz" }, "")).toBe("");
  });
});

describe("publicStateMessage", () => {
  it("returns a calm title + description for each blocked state", () => {
    expect(publicStateMessage("expired").title).toContain("expired");
    expect(publicStateMessage("cancelled").title).toContain("cancelled");
    expect(publicStateMessage("closed").title).toContain("closed");
    expect(publicStateMessage("not_found").title).toContain("couldn't find");
    expect(publicStateMessage("expired").description).toBeTruthy();
  });

  it("returns the upload prompt for the ok state", () => {
    expect(publicStateMessage("ok").title).toBe("Upload your document");
  });
});
