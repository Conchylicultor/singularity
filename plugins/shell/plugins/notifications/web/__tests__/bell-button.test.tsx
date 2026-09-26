/**
 * The bell's badge reads the `notifications.unread` VALUE (a whole-table
 * count), not the loaded window: pending paints a neutral bell, settled paints
 * the count (label exact, badge capped at "9+") in red only while an error is
 * among them. Data is driven with `client.setQueryData` on the exact tuples.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { notifications, notificationsUnread } from "../../shared/resources";
import { BellButton } from "../components/bell-button";

afterEach(cleanup);

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
}

function mount(client: QueryClient) {
  const rendered = render(
    <NotificationsProvider queryClient={client}>
      <BellButton />
    </NotificationsProvider>,
  );
  const live = getNotificationsClient();
  if (!live) throw new Error("NotificationsClient not created");
  vi.spyOn(live, "hasEverBeenReady").mockReturnValue(true);
  return rendered;
}

const windowKey = () => {
  if (!notifications.window.defaultParams) {
    throw new Error("notifications window has no default tuple");
  }
  return queryKeyFor(notifications.key, notifications.window.defaultParams);
};
const unreadKey = () => queryKeyFor(notificationsUnread.key, {});

function settled(unread: { errors: number; warnings: number }): QueryClient {
  const client = makeClient();
  client.setQueryData(windowKey(), []);
  client.setQueryData(unreadKey(), unread);
  return client;
}

describe("BellButton — unread badge", () => {
  it("paints a neutral bell (no count) while the unread value is pending", () => {
    const client = makeClient();
    client.setQueryData(windowKey(), []);
    mount(client);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByText(/^\d|9\+/)).toBeNull();
  });

  it("labels the exact count, caps the badge at 9+, and is red with an error", () => {
    mount(settled({ errors: 3, warnings: 250 }));
    expect(
      screen.getByRole("button", { name: "Notifications, 253 unread" }),
    ).toBeTruthy();
    const badge = screen.getByText("9+");
    expect(badge.className).toContain("bg-destructive");
  });

  it("is orange when only warnings are unread", () => {
    mount(settled({ errors: 0, warnings: 2 }));
    expect(
      screen.getByRole("button", { name: "Notifications, 2 unread" }),
    ).toBeTruthy();
    expect(screen.getByText("2").className).toContain("bg-warning");
  });

  it("shows no badge at zero", () => {
    mount(settled({ errors: 0, warnings: 0 }));
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
