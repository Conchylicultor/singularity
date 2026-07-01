import { describe, expect, test } from "bun:test";
import { deriveMailSyncView } from "./sync-view";
import type { MailSyncState } from "./types";

function row(overrides: Partial<MailSyncState>): MailSyncState {
  return {
    accountId: "a1",
    historyId: "100",
    lastFullSyncAt: null,
    lastDeltaSyncAt: null,
    status: "delta",
    errorCode: null,
    lastError: null,
    lastErrorAt: null,
    resyncCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("deriveMailSyncView", () => {
  test("empty rows → idle", () => {
    expect(deriveMailSyncView([])).toEqual({ phase: "idle", lastSyncedAt: null });
  });

  test("status error → error phase with terminal error", () => {
    const v = deriveMailSyncView([
      row({ status: "error", errorCode: "auth", lastError: "Sign in again" }),
    ]);
    expect(v.phase).toBe("error");
    expect(v.error).toEqual({
      code: "auth",
      message: "Sign in again",
      terminal: true,
    });
  });

  test("resync-loop escalation → error phase with resync_loop code", () => {
    const v = deriveMailSyncView([
      row({
        status: "error",
        errorCode: "resync_loop",
        lastError: "Mailbox re-synced 3 times without catching up",
        resyncCount: 3,
      }),
    ]);
    expect(v.phase).toBe("error");
    expect(v.error?.code).toBe("resync_loop");
    expect(v.error?.terminal).toBe(true);
  });

  test("error with null code/message falls back to unknown + copy", () => {
    const v = deriveMailSyncView([row({ status: "error" })]);
    expect(v.error?.code).toBe("unknown");
    expect(v.error?.message).toContain("Something went wrong");
  });

  test("backfilling → syncing", () => {
    expect(deriveMailSyncView([row({ status: "backfilling" })]).phase).toBe(
      "syncing",
    );
  });

  test("delta with a delta timestamp → healthy", () => {
    const v = deriveMailSyncView([
      row({ status: "delta", lastDeltaSyncAt: new Date("2026-01-02T00:00:00Z") }),
    ]);
    expect(v.phase).toBe("healthy");
    expect(v.lastSyncedAt).toBe(new Date("2026-01-02T00:00:00Z").toISOString());
  });

  test("delta with only a full-sync timestamp → healthy", () => {
    const v = deriveMailSyncView([
      row({ status: "delta", lastFullSyncAt: new Date("2026-01-02T00:00:00Z") }),
    ]);
    expect(v.phase).toBe("healthy");
  });

  test("delta with no timestamps → idle", () => {
    expect(deriveMailSyncView([row({ status: "idle" })]).phase).toBe("idle");
  });

  test("fresh error (newer than last delta) → non-terminal warning", () => {
    const v = deriveMailSyncView([
      row({
        status: "delta",
        lastDeltaSyncAt: new Date("2026-01-02T00:00:00Z"),
        lastErrorAt: new Date("2026-01-03T00:00:00Z"),
        errorCode: "quota",
        lastError: "rate limited",
      }),
    ]);
    expect(v.phase).toBe("warning");
    expect(v.error).toEqual({
      code: "quota",
      message: "rate limited",
      terminal: false,
    });
  });

  test("stale error (older than last delta) → healthy, no error", () => {
    const v = deriveMailSyncView([
      row({
        status: "delta",
        lastDeltaSyncAt: new Date("2026-01-03T00:00:00Z"),
        lastErrorAt: new Date("2026-01-02T00:00:00Z"),
        errorCode: "quota",
        lastError: "old",
      }),
    ]);
    expect(v.phase).toBe("healthy");
    expect(v.error).toBeUndefined();
  });

  test("error with no prior delta (lastDeltaSyncAt null) → warning", () => {
    const v = deriveMailSyncView([
      row({
        status: "delta",
        lastDeltaSyncAt: null,
        lastErrorAt: new Date("2026-01-02T00:00:00Z"),
      }),
    ]);
    expect(v.phase).toBe("warning");
  });

  test("worst phase wins across rows; lastSyncedAt is the max", () => {
    const v = deriveMailSyncView([
      row({
        accountId: "a1",
        status: "delta",
        lastDeltaSyncAt: new Date("2026-01-05T00:00:00Z"),
      }),
      row({ accountId: "a2", status: "error", errorCode: "api_disabled" }),
    ]);
    expect(v.phase).toBe("error");
    expect(v.error?.code).toBe("api_disabled");
    expect(v.lastSyncedAt).toBe(new Date("2026-01-05T00:00:00Z").toISOString());
  });
});
