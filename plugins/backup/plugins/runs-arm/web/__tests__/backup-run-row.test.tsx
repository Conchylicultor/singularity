import { afterEach, describe, expect, it, vi } from "vitest";

// Mounting NotificationsProvider otherwise schedules real fetch flushes at
// module eval — the convention the live-state hazard suites established.
vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  NotificationsProvider,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { authStateResource } from "@plugins/auth/core";
import type { UnionRun } from "@plugins/runs/core";
import { BackupRunRow } from "../components/backup-run-row";

/**
 * The backup row is the backup panel's old card, moved. This proves the two
 * things a field-driven row would have dropped silently:
 *
 * - the **Grant access** button on a target that failed for want of an OAuth
 *   scope, which is the only in-app repair path for a Drive backup whose token
 *   expired;
 * - the manifest's source reports and their items.
 *
 * Both live inside the disclosure, so each test opens it first — which also
 * proves the disclosure itself works, and that its trigger and the grant button
 * are real, clickable buttons (they can only be, because this arm contributes no
 * row activation and the list therefore renders the row as a plain container).
 */

function backupRun(overrides: Record<string, unknown> = {}): UnionRun {
  return {
    kind: "backup",
    id: "run-1",
    label: "Backup · 2 sources",
    outcome: "partial",
    trigger: "manual",
    startedAt: new Date("2026-08-20T09:30:00Z"),
    finishedAt: new Date("2026-08-20T09:31:40Z"),
    duration: 100_000,
    namespace: null,
    message: null,
    "backup.status": "partial",
    "backup.archiveSize": 5 * 1024 * 1024,
    "backup.sourceCount": 2,
    "backup.targetCount": 2,
    "backup.targetResults": [
      { targetId: "local", ok: true, detail: "/backups/2026-08-20" },
      {
        targetId: "google-drive",
        ok: false,
        detail: "insufficient permissions",
        needsConsent: true,
        consent: {
          providerId: "google",
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        },
      },
    ],
    "backup.sources": [
      {
        id: "config",
        name: "Config",
        skipped: false,
        items: [{ label: "config/", detail: "12 files" }],
        sizeBytes: 2048,
      },
      {
        id: "secrets",
        name: "Secrets",
        skipped: false,
        items: [{ label: "secrets.json.enc" }],
        sizeBytes: 512,
      },
      // Skipped sources are dropped by the decoder, not by the row — the same
      // reading the `sourceCount` column takes, so the two cannot disagree.
      {
        id: "databases",
        name: "Databases",
        skipped: true,
        items: [],
        sizeBytes: 0,
      },
    ],
    ...overrides,
  } as unknown as UnionRun;
}

/**
 * The Grant access button reads the shared auth state through `useResource`, so
 * the row genuinely needs a live-state host. Seeding the query with the resource's
 * own empty value settles it without a server: the button does not depend on the
 * state to render, only to merge already-granted scopes when it is pressed.
 */
function renderRow(run: UnionRun): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false, staleTime: Infinity },
    },
  });
  client.setQueryData(queryKeyFor(authStateResource.key, undefined), {
    providers: {},
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NotificationsProvider queryClient={client}>
      {children}
    </NotificationsProvider>
  );
  render(<BackupRunRow run={run} />, { wrapper });
}

function expand(): void {
  // The disclosure trigger is the collapsed header line; it is the only button
  // rendered while the row is closed.
  fireEvent.click(screen.getAllByRole("button")[0]!);
}

afterEach(cleanup);

describe("BackupRunRow", () => {
  it("offers Grant access on a target that failed for want of a scope", () => {
    renderRow(backupRun());

    // Closed: the card body is unmounted, so the button is genuinely absent
    // rather than merely hidden.
    expect(screen.queryByRole("button", { name: /grant access/i })).toBeNull();

    expand();

    const grant = screen.getByRole("button", { name: /grant access/i });
    expect(grant).not.toBeNull();
    // A real, enabled control — not a label styled like one.
    expect(grant.tagName).toBe("BUTTON");
    expect((grant as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers no Grant access when every target succeeded", () => {
    renderRow(
      backupRun({
        outcome: "succeeded",
        "backup.status": "ok",
        "backup.targetResults": [{ targetId: "local", ok: true }],
      }),
    );
    expand();

    expect(screen.queryByRole("button", { name: /grant access/i })).toBeNull();
    expect(screen.getByText("local")).not.toBeNull();
  });

  it("carries the manifest's non-skipped sources and their items", () => {
    renderRow(backupRun());
    expand();

    expect(screen.getByText("Config")).not.toBeNull();
    expect(screen.getByText("Secrets")).not.toBeNull();
    expect(screen.queryByText("Databases")).toBeNull();
    expect(screen.getByText(/config\/ — 12 files/)).not.toBeNull();
    expect(screen.getByText("secrets.json.enc")).not.toBeNull();
  });

  it("shows the source count, the archive size and an absolute start time", () => {
    renderRow(backupRun());

    expect(screen.getByText("2 sources")).not.toBeNull();
    expect(screen.getByText("5.0 MB")).not.toBeNull();
    // The mixed feed sorts on relative time; a backup is audited after the fact,
    // and "3 days ago" is not a date.
    expect(
      screen.getByText(
        new RegExp(new Date("2026-08-20T09:30:00Z").getFullYear().toString()),
      ),
    ).not.toBeNull();
  });

  it("states nothing about the size, or the lifecycle, when no archive exists", () => {
    // The 18 real rows behind this case are all FINISHED: 17 stamped `failed` by
    // the boot reconcile sweep ("the server was restarted mid-run") and one that
    // hit its job deadline. None has an archive, so none has a size — and the
    // row must not read that as "still going". Lifecycle is `outcome`'s to state.
    renderRow(
      backupRun({
        outcome: "failed",
        "backup.status": "failed",
        "backup.archiveSize": null,
        "backup.sourceCount": null,
        "backup.targetCount": null,
        "backup.targetResults": [
          {
            targetId: "reconcile",
            ok: false,
            detail: "Backup interrupted — the server was restarted mid-run.",
          },
        ],
        "backup.sources": null,
      }),
    );

    // The label the old card printed here, and the reason this test exists.
    expect(screen.queryByText(/in progress/i)).toBeNull();
    // Nor a fabricated size standing in for the missing one.
    expect(screen.queryByText(/\bB$|KB|MB|GB/)).toBeNull();
    // No `?? 0`: a run with no recorded targets is not a run with zero targets,
    // and a run with no archive is not a run whose archive is empty.
    expect(screen.queryByText("0 sources")).toBeNull();
    expect(screen.queryByText("0 B")).toBeNull();
  });
});
