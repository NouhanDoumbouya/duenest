import { describe, expect, it } from "vitest";

import {
  SHARING_ROOM_ITEM_TYPE_LABELS,
  SHARING_ROOM_STATUS_LABELS,
  SHARING_ROOM_STATUS_ORDER,
  SHARING_ROOM_STATUS_TONE,
  SHARING_ROOM_TYPE_LABELS,
  SHARING_ROOM_TYPE_ORDER,
  buildPublicRoomUrl,
  publicRoomStateMessage,
} from "./sharing-rooms";
import type {
  PublicSharingRoomState,
  SharingRoomItemType,
} from "@/types/sharing-rooms";

describe("status label + tone + order maps", () => {
  it("labels and tones every status in the order list", () => {
    for (const status of SHARING_ROOM_STATUS_ORDER) {
      expect(SHARING_ROOM_STATUS_LABELS[status]).toBeTruthy();
      expect(SHARING_ROOM_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it("uses calm, owner-friendly wording", () => {
    expect(SHARING_ROOM_STATUS_LABELS.active).toBe("Active");
    expect(SHARING_ROOM_STATUS_LABELS.revoked).toBe("Revoked");
    expect(SHARING_ROOM_STATUS_LABELS.archived).toBe("Archived");
  });

  it("maps active to success and revoked to danger", () => {
    expect(SHARING_ROOM_STATUS_TONE.active).toBe("success");
    expect(SHARING_ROOM_STATUS_TONE.expired).toBe("warning");
    expect(SHARING_ROOM_STATUS_TONE.revoked).toBe("danger");
    expect(SHARING_ROOM_STATUS_TONE.archived).toBe("neutral");
  });
});

describe("type + item-type label maps", () => {
  it("labels every room type in the order list", () => {
    for (const type of SHARING_ROOM_TYPE_ORDER) {
      expect(SHARING_ROOM_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("labels every item type", () => {
    const itemTypes: SharingRoomItemType[] = ["document", "file", "request"];
    for (const type of itemTypes) {
      expect(SHARING_ROOM_ITEM_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe("buildPublicRoomUrl", () => {
  it("prefers the server-provided public_url", () => {
    expect(
      buildPublicRoomUrl({
        public_url: "https://app.certanest.com/room/abc",
        token: "abc",
      }),
    ).toBe("https://app.certanest.com/room/abc");
  });

  it("constructs the SINGULAR /room/ path from a provided origin", () => {
    expect(
      buildPublicRoomUrl(
        { public_url: "", token: "xyz" },
        "https://app.certanest.com/",
      ),
    ).toBe("https://app.certanest.com/room/xyz");
  });

  it("does not use the plural /rooms/ path of the older feature", () => {
    const url = buildPublicRoomUrl(
      { public_url: "", token: "xyz" },
      "https://app.certanest.com",
    );
    expect(url).toBe("https://app.certanest.com/room/xyz");
    expect(url).not.toContain("/rooms/");
  });

  it("returns empty string when there is nothing to build from", () => {
    expect(buildPublicRoomUrl({ public_url: "", token: "" }, "")).toBe("");
    expect(buildPublicRoomUrl({ public_url: "", token: "xyz" }, "")).toBe("");
  });
});

describe("publicRoomStateMessage", () => {
  it("returns a calm title + description for each blocked state", () => {
    const blocked: PublicSharingRoomState[] = [
      "expired",
      "revoked",
      "not_found",
    ];
    for (const state of blocked) {
      const msg = publicRoomStateMessage(state);
      expect(msg.title).toBeTruthy();
      expect(msg.description).toBeTruthy();
    }
  });

  it("uses distinct wording per blocked state", () => {
    expect(publicRoomStateMessage("expired").title).toContain("expired");
    expect(publicRoomStateMessage("revoked").title).toContain("revoked");
    expect(publicRoomStateMessage("not_found").title).toContain("couldn't find");
  });

  it("returns empty strings for the ok state", () => {
    expect(publicRoomStateMessage("ok").title).toBe("");
    expect(publicRoomStateMessage("ok").description).toBe("");
  });
});
