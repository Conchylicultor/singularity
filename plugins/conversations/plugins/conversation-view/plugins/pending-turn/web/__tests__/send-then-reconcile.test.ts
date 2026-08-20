import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  defineTurnDelivery,
  reconcilePendingTurns,
  retryPendingTurn,
  sendConversationTurn,
  type PendingTurnRecord,
} from "../index";
import { CONFIRM_DEADLINE_MS } from "../internal/reconcile";
import { pendingTurnsKey } from "../internal/persist";

// The SEAM test: store × matcher, driven through the real public entry points.
//
// `reconcile.test.ts` covers the matcher as a pure function and cannot express
// the defect this file exists for. That defect was never about which rows match
// — it was about WHEN the matcher first ran. The pure test hands the matcher its
// passes, so "this record's very first pass already contained its own delivered
// row" is not a sentence it can say. Only a real `sendConversationTurn`, which
// mints the record, stamps its watermark and dispatches the delivery, followed
// by a real `reconcilePendingTurns`, puts the two halves in the order the
// incident happened in.
//
// So every case below goes through the module's own doors — no record literals,
// no direct `matchPendingTurns` call, no reaching into store internals. The
// observation channel is the persisted record itself (localStorage, written on
// every commit) plus the network: the delivery registered here is offline, so a
// `fetch` during a test can only be the `turn-unconfirmed` report beacon.

const OFFLINE_DELIVERY_ID = "seam-test-offline";

// Registered at MODULE LOAD, which is the contract a real delivery has to meet
// (see delivery.ts): a record outlives the tab that made it, so Retry looks the
// delivery back up by id. Registering it inside a test would also silently let
// `deliveryFor` fall back to the network-backed `postConversationTurn`.
const offlineDelivery = defineTurnDelivery<{ text: string }>({
  id: OFFLINE_DELIVERY_ID,
  async send() {
    // Accepted, and the endpoint rewrote nothing — the record keeps matching on
    // its own echoed text.
    return { resolvedText: null };
  },
});

let conversationSeq = 0;
/** A fresh conversation per test: the store caches an entry per id for the module's life. */
function freshConversationId(): string {
  conversationSeq += 1;
  return `seam-conv-${conversationSeq}`;
}

/** Every fetch this test file saw. The delivery is offline, so these are report beacons. */
let fetchUrls: string[] = [];

function reportBeacons(): string[] {
  return fetchUrls.filter((url) => url.includes("/api/reports"));
}

/** The durable records, read the way a reloading tab would read them. */
function persisted(conversationId: string): PendingTurnRecord[] {
  const raw = localStorage.getItem(pendingTurnsKey(conversationId));
  if (raw === null) return [];
  return (JSON.parse(raw) as { v: PendingTurnRecord[] }).v;
}

function theRecord(conversationId: string): PendingTurnRecord {
  const all = persisted(conversationId);
  expect(all).toHaveLength(1);
  return all[0]!;
}

/**
 * Let the dispatched delivery settle. `sendConversationTurn` returns before its
 * delivery promise resolves, and a real macrotask boundary drains every
 * microtask behind it — the store's `posted` commit included. `setTimeout` is
 * NOT faked by the shared setup (only `Date` is), so this is a genuine tick.
 */
async function settleDelivery(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function userText(text: string, atMs: number): JsonlEvent {
  return { kind: "user-text", at: new Date(atMs).toISOString(), text };
}

beforeEach(() => {
  localStorage.clear();
  fetchUrls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      fetchUrls.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reportId: null,
          taskId: null,
          rateLimited: false,
        }),
        text: async () => "",
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("send → reconcile", () => {
  it("retires a turn whose own row is already in the record's FIRST pass", async () => {
    // THE INCIDENT (conv-1786969506-7e03): the turn was delivered and the agent
    // answered it, but the pane's first reconcile for this record ran after the
    // CLI had already written the row. The old per-record baseline was stamped
    // in that same pass, at `userTexts.length`, so the record's own row sat
    // below its own threshold and could never match — 90 s later the card said
    // "the agent may not have received this message" and the user re-sent it.
    const conversationId = freshConversationId();
    const sentAt = Date.now();

    sendConversationTurn(conversationId, {
      text: "Answering your questions:\n- yes\n- no",
      delivery: offlineDelivery,
      payload: { text: "Answering your questions:\n- yes\n- no" },
    });
    await settleDelivery();
    expect(theRecord(conversationId).state).toBe("posted");

    // The pane's FIRST pass for this record, and it already carries the row the
    // send produced. Nothing reconciled in between — that is the whole point.
    reconcilePendingTurns(conversationId, [
      userText("an earlier, unrelated message", sentAt - 5 * 60_000),
      userText("Answering your questions: - yes - no", sentAt + 1_000),
    ]);

    // Matched (→ `sent`) and dropped by the sweep in the same pass: the real
    // user-text row IS the feedback, so nothing is left to render.
    expect(persisted(conversationId)).toEqual([]);
    expect(reportBeacons()).toEqual([]);
  });

  it("keeps the original watermark across Retry, so the FIRST send's row still retires the record", async () => {
    const conversationId = freshConversationId();
    const sentAt = Date.now();
    const text = "Go";

    sendConversationTurn(conversationId, {
      text,
      delivery: offlineDelivery,
      payload: { text },
    });
    await settleDelivery();
    const posted = theRecord(conversationId);
    expect(posted.state).toBe("posted");

    // Drive the confirmation deadline: the delivery was accepted, the row was
    // written, but this tab never saw a transcript carrying it.
    vi.setSystemTime(sentAt + CONFIRM_DEADLINE_MS + 1_000);
    reconcilePendingTurns(conversationId, []);
    const unconfirmed = theRecord(conversationId);
    expect(unconfirmed.state).toBe("unconfirmed");
    expect(reportBeacons()).toHaveLength(1);

    // The user presses Retry.
    retryPendingTurn(conversationId, unconfirmed.id);
    expect(theRecord(conversationId).createdAt).toBe(posted.createdAt);
    await settleDelivery();
    const retried = theRecord(conversationId);
    expect(retried.state).toBe("posted");
    // The watermark is the record's for life — a re-stamp here would move it 91 s
    // forward and make the first send's row, below, unmatchable.
    expect(retried.createdAt).toBe(posted.createdAt);

    // The transcript now arrives, holding ONLY the row the ORIGINAL send wrote.
    // That send did land; only our verification of it failed. It is the truth the
    // card owes the user, so it must retire the record.
    reconcilePendingTurns(conversationId, [userText(text, sentAt + 1_000)]);
    expect(persisted(conversationId)).toEqual([]);
  });

  it("does not let a pre-existing identical row resolve a fresh send", async () => {
    // The other direction of the same gate. "Go" and "continue" repeat all the
    // time, so an older identical row must never stand in for this send — that
    // would be a silent false "delivered", which is worse than a false warning.
    const conversationId = freshConversationId();
    const sentAt = Date.now();
    const text = "continue";

    sendConversationTurn(conversationId, {
      text,
      delivery: offlineDelivery,
      payload: { text },
    });
    await settleDelivery();
    expect(theRecord(conversationId).state).toBe("posted");

    reconcilePendingTurns(conversationId, [
      userText(text, sentAt - 10 * 60_000),
    ]);

    expect(theRecord(conversationId).state).toBe("posted");
    expect(reportBeacons()).toEqual([]);
  });
});
