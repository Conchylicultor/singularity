import { afterEach, describe, expect, it, vi } from "vitest";

// Mounting NotificationsProvider otherwise schedules real fetch flushes at
// module eval — the convention the live-state hazard suites established.
vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  NotificationsProvider,
  queryKeyFor,
} from "@plugins/primitives/plugins/live-state/web";
import { authStateResource } from "@plugins/auth/core";
import type { UnionRun } from "@plugins/runs/core";
import {
  BackupSourcesSection,
  BackupTargetsSection,
} from "../components/backup-run-sections";

/**
 * The two sections of the backup run-detail pane. This proves the two things a
 * field-driven row would have dropped silently when the old expand/collapse row
 * was deleted:
 *
 * - the **Grant access** button on a target that failed for want of an OAuth
 *   scope, which is the only in-app repair path for a Drive backup whose token
 *   expired;
 * - the manifest's source reports and their items.
 *
 * There is no disclosure to open any more: the section host owns that, and the
 * bodies are rendered directly. What the row's own tests asserted about the
 * collapsed line (chips, an absolute start time, no fabricated "in progress")
 * is not restated here — those values are ordinary declared fields now, and the
 * list renders them from the schema.
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
      // Skipped sources are dropped by the decoder, not by the section — the
      // same reading the `sourceCount` column takes, so the two cannot disagree.
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
 * the section genuinely needs a live-state host. Seeding the query with the
 * resource's own empty value settles it without a server: the button does not
 * depend on the state to render, only to merge already-granted scopes when it is
 * pressed.
 */
function renderSection(node: ReactNode): void {
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
  render(<>{node}</>, { wrapper });
}

afterEach(cleanup);

describe("backup run detail sections", () => {
  it("offers Grant access on a target that failed for want of a scope", () => {
    renderSection(<BackupTargetsSection run={backupRun()} />);

    const grant = screen.getByRole("button", { name: /grant access/i });
    expect(grant).not.toBeNull();
    // A real, enabled control — not a label styled like one.
    expect(grant.tagName).toBe("BUTTON");
    expect((grant as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers no Grant access when every target succeeded", () => {
    renderSection(
      <BackupTargetsSection
        run={backupRun({
          outcome: "succeeded",
          "backup.status": "ok",
          "backup.targetResults": [{ targetId: "local", ok: true }],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /grant access/i })).toBeNull();
    expect(screen.getByText("local")).not.toBeNull();
  });

  it("carries the manifest's non-skipped sources and their items", () => {
    renderSection(<BackupSourcesSection run={backupRun()} />);

    expect(screen.getByText("Config")).not.toBeNull();
    expect(screen.getByText("Secrets")).not.toBeNull();
    expect(screen.queryByText("Databases")).toBeNull();
    expect(screen.getByText(/config\/ — 12 files/)).not.toBeNull();
    expect(screen.getByText("secrets.json.enc")).not.toBeNull();
  });
});
