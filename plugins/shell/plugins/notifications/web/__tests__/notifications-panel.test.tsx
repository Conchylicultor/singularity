/**
 * The bell popover's chip row over a real NotificationsProvider + QueryClient
 * (the live `use-live.test.tsx` harness): groupings are driven with
 * `client.setQueryData` on the exact tuple the codec encodes.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import {
  NotificationsProvider,
  getNotificationsClient,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { notifications } from "../../shared/resources";
import { NotificationsPanel } from "../components/notifications-panel";

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
      <NotificationsPanel empty={false} onClose={() => {}} />
    </NotificationsProvider>,
  );
  const live = getNotificationsClient();
  if (!live) throw new Error("NotificationsClient not created");
  vi.spyOn(live, "hasEverBeenReady").mockReturnValue(true);
  return rendered;
}

const groupsKey = (groupBy: "type" | "variant") =>
  queryKeyFor(
    `${notifications.key}:groups`,
    notifications.groups.groups.encode({
      groupBy,
      limit: notifications.groups.groups.defaultLimit,
    }),
  );

describe("NotificationsPanel — chip row", () => {
  it("shows a loading state (never an empty row) while the groupings are pending", () => {
    mount(makeClient());
    const chips = screen.getByTestId("notification-chips");
    expect(within(chips).getByRole("status").textContent).toContain(
      "Loading filters",
    );
    expect(within(chips).queryAllByRole("button")).toHaveLength(0);
  });

  it("renders a chip per server group, plus Errors when an error group exists", async () => {
    const client = makeClient();
    client.setQueryData(groupsKey("type"), [
      { value: "build", count: 3 },
      { value: "old-type", count: 2 },
    ]);
    client.setQueryData(groupsKey("variant"), [
      { value: "info", count: 4 },
      { value: "error", count: 1 },
    ]);
    mount(client);
    await waitFor(() => {
      const chips = screen.getByTestId("notification-chips");
      expect(
        within(chips)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["All", "Errors", "Build 3", "Old-type 2"]);
    });
  });
});
