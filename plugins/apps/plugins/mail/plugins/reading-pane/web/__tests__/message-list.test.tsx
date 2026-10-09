/**
 * The reading pane's list over a thread's live window: messages render in the
 * order given (the pane hands them oldest→newest), and "Load older messages"
 * appears exactly while the window can grow — or is growing — and grows it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// A card hydrates its body through an endpoint; what it renders is not what
// this list is about.
vi.mock("../components/message-card", () => ({
  MessageCard: ({
    message,
    defaultOpen,
  }: {
    message: { id: string };
    defaultOpen: boolean;
  }) => (
    <div data-testid="card" data-open={String(defaultOpen)}>
      {message.id}
    </div>
  ),
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  mailAccountIdKind,
  type MailMessage,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import type { ResourcePaging } from "@plugins/primitives/plugins/live-state/web";
import { MessageList } from "../components/message-list";

afterEach(cleanup);

const at = new Date("2026-01-01T00:00:00Z");

function message(id: string): MailMessage {
  return {
    id,
    threadId: "t1",
    accountId: mailAccountIdKind.key("a1"),
    from: { email: "a@example.com" },
    to: [],
    cc: [],
    bcc: [],
    replyTo: null,
    subject: "Hello",
    snippet: null,
    headers: {},
    bodyText: null,
    bodyHtml: null,
    bodyFetchedAt: null,
    internalDate: at,
    unread: false,
    starred: false,
    isDraft: false,
    isSent: false,
    hasAttachments: false,
    sizeEstimate: null,
    historyId: null,
    createdAt: at,
    updatedAt: at,
  };
}

function paging(over: Partial<ResourcePaging> = {}): ResourcePaging {
  return { canGrow: false, growing: false, loadMore: vi.fn(), ...over };
}

const LOAD_OLDER = { name: /load older messages/i };
const loadOlder = () => screen.queryByRole("button", LOAD_OLDER);

describe("MessageList", () => {
  it("renders the messages in the given order, the last one open", () => {
    render(
      <MessageList
        messages={[message("m1"), message("m2"), message("m3")]}
        older={paging()}
      />,
    );
    const cards = screen.getAllByTestId("card");
    expect(cards.map((c) => c.textContent)).toEqual(["m1", "m2", "m3"]);
    expect(cards.map((c) => c.getAttribute("data-open"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  it("offers no older messages when the window holds the whole thread", () => {
    render(<MessageList messages={[message("m1")]} older={paging()} />);
    expect(loadOlder()).toBeNull();
  });

  it("grows the window when older messages can be loaded", () => {
    const older = paging({ canGrow: true });
    render(<MessageList messages={[message("m1")]} older={older} />);
    fireEvent.click(screen.getByRole("button", LOAD_OLDER));
    expect(older.loadMore).toHaveBeenCalledTimes(1);
  });

  it("keeps the button, loading, while the grown window loads", () => {
    render(
      <MessageList
        messages={[message("m1")]}
        older={paging({ growing: true })}
      />,
    );
    const button = screen.getByRole("button", LOAD_OLDER);
    expect(button.getAttribute("data-loading")).toBe("true");
  });

  it("says the thread is empty when no message is loaded", () => {
    render(<MessageList messages={[]} older={paging()} />);
    expect(screen.getByText("This thread has no messages.")).not.toBeNull();
    expect(loadOlder()).toBeNull();
  });
});
