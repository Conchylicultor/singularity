import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { ConversationStatus } from "@plugins/tasks/plugins/tasks-core/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  defineTurnDelivery,
  reconcilePendingTurns,
  sendConversationTurn,
  useOptimisticConversationStatus,
} from "../index";

// The header chip reads `useOptimisticConversationStatus`: a send flips a
// `waiting` conversation to `working` at once, and the server's own status takes
// back over as soon as its row moves (`updatedAt` is touched on entering and
// leaving `working`).

let failNext = false;
const delivery = defineTurnDelivery<{ text: string }>({
  id: "optimistic-status-test",
  async send() {
    if (failNext) throw new Error("offline");
    return { resolvedText: null, held: false };
  },
});

let seq = 0;
function freshId(): string {
  seq += 1;
  return `optimistic-conv-${seq}`;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function send(id: string, text: string): void {
  act(() => {
    sendConversationTurn(id, { text, delivery, payload: { text } });
  });
}

function userText(text: string, atMs: number): JsonlEvent {
  return { kind: "user-text", at: new Date(atMs).toISOString(), text };
}

function render(id: string, status: ConversationStatus, updatedAt: Date) {
  return renderHook(
    (props: { status: ConversationStatus; updatedAt: Date }) =>
      useOptimisticConversationStatus({ id, ...props }),
    { initialProps: { status, updatedAt } },
  );
}

beforeEach(() => {
  localStorage.clear();
  failNext = false;
});

afterEach(() => {
  failNext = false;
});

describe("useOptimisticConversationStatus", () => {
  it("passes the server status through when nothing was sent", () => {
    const { result } = render(
      freshId(),
      "waiting",
      new Date(Date.now() - 1000),
    );
    expect(result.current).toBe("waiting");
  });

  it("reads working from the instant a turn is sent", async () => {
    const id = freshId();
    const { result } = render(id, "waiting", new Date(Date.now() - 1000));
    send(id, "go");
    expect(result.current).toBe("working");
    await settle();
    expect(result.current).toBe("working");
  });

  it("stays working after the transcript confirms, until the server row moves", async () => {
    const id = freshId();
    const before = new Date(Date.now() - 1000);
    const { result, rerender } = render(id, "waiting", before);
    send(id, "go");
    await settle();
    act(() => reconcilePendingTurns(id, [userText("go", Date.now() + 10)]));
    // The record is dropped, but the server has not caught up yet.
    expect(result.current).toBe("working");

    // The server finished the turn: its row moved after the send.
    rerender({ status: "waiting", updatedAt: new Date(Date.now() + 5_000) });
    expect(result.current).toBe("waiting");
  });

  it("does not override statuses other than waiting", () => {
    const id = freshId();
    const { result } = render(id, "starting", new Date(Date.now() - 1000));
    send(id, "go");
    expect(result.current).toBe("starting");
  });

  it("retracts the override when the send fails", async () => {
    const id = freshId();
    const { result } = render(id, "waiting", new Date(Date.now() - 1000));
    failNext = true;
    send(id, "go");
    expect(result.current).toBe("working");
    await settle();
    expect(result.current).toBe("waiting");
  });
});
