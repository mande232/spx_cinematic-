import { describe, expect, it } from "vitest";

import { getPhoneUrlFromToken } from "./pairing";
import { createDefaultStore, migrateStoreData } from "./shared-types";
import { isSessionBusy } from "./session-utils";

describe("pairing", () => {
  it("builds absolute phone URL with session token", () => {
    const url = getPhoneUrlFromToken("https://example.com/phone", "abc123");
    expect(url).toBe("https://example.com/phone?session=abc123");
  });

  it("keeps absolute origin when base is a path", () => {
    const url = getPhoneUrlFromToken("/phone", "abc123");
    expect(url).toMatch(/^https?:\/\/.+\/phone\?session=abc123$/);
  });
});

describe("shared-types", () => {
  it("migrates legacy store data", () => {
    const store = migrateStoreData({
      session: { state: "idle", capturedImage: null, visitorName: "", chapterIndex: 0, updatedAt: 1 },
      visitors: [],
    });
    expect(store.pairingToken).toBeTruthy();
    expect(store.maintenanceMode).toBe(false);
    expect(store.session.processedImage).toBeNull();
  });

  it("creates default store with pairing token", () => {
    const store = createDefaultStore();
    expect(store.pairingToken.length).toBeGreaterThan(8);
    expect(store.analytics).toEqual([]);
  });
});

describe("session-utils", () => {
  it("detects busy session states", () => {
    expect(isSessionBusy("playing")).toBe(true);
    expect(isSessionBusy("idle")).toBe(false);
    expect(isSessionBusy("scanned")).toBe(false);
  });
});
