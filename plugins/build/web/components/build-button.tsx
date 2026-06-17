import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useEffect } from "react";
import { useResource, useNotificationsChannelStatuses } from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull, MdRefresh, MdBuild } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import { buildHistoryResource, type BuildRun } from "../../shared";
import { useStaleFrontend } from "../hooks/use-stale-frontend";
import { BuildPopoverContent } from "./build-popover-content";
import { buildPane, buildDetailPane } from "../panes";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/** Inner component: receives settled history data so hooks run unconditionally with real values. */
function BuildButtonInner({
  open,
  setOpen,
  openPane,
  staleTab,
  wsStatus,
  historyData,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  openPane: ReturnType<typeof useOpenPane>;
  staleTab: boolean;
  wsStatus: string;
  historyData: BuildRun[];
}) {
  const latestRun = historyData[0];
  const building = latestRun?.finishedAt === null;
  const failed =
    !building && latestRun != null && latestRun.exitCode !== null && latestRun.exitCode !== 0;

  // Priority: a stale tab (new frontend already served) needs a reload regardless
  // of build state; otherwise reflect the active build, then the last outcome.
  const status: "idle" | "building" | "restarting" | "updated" | "failed" = staleTab
    ? "updated"
    : building && wsStatus !== "open"
      ? "restarting"
      : building
        ? "building"
        : failed
          ? "failed"
          : "idle";

  const label = {
    idle: "Builds",
    building: "Building…",
    restarting: "Server restarting…",
    updated: "Server updated",
    failed: "Build failed",
  }[status];
  const spinning = status === "building" || status === "restarting";

  // Trace the client-side derivation an agent can read without a browser (see
  // plugins/debug/plugins/logs). Captures whether wsStatus ever leaves "open"
  // while building — the original "Server restarting…" investigation.
  useEffect(() => {
    clientLog(
      "build-btn",
      JSON.stringify({ status, building, wsStatus, staleTab, finishedAt: latestRun?.finishedAt }),
    );
  }, [status, building, wsStatus, staleTab, latestRun?.finishedAt]);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className={status === "failed" ? "text-destructive" : undefined}
        >
          {spinning && <Spinner spinning className="size-4" />}
          {status === "idle" && <MdBuild className="size-4" />}
          {label}
          {status === "updated" && (
            <WithTooltip content="Server was rebuilt — click to reload this tab">
              <span
                role="button"
                tabIndex={0}
                // eslint-disable-next-line row/no-adhoc-row, spacing/no-adhoc-spacing -- nested interactive chip inside the build trigger button (a real button can't nest inside the Button trigger); ml-0.5 inline offset from preceding button label, no flex parent to own a gap
                className="ml-0.5 inline-flex items-center gap-2xs rounded-md bg-info/15 px-xs py-2xs text-label text-info hover:bg-info/25"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.reload();
                }}
              >
                <MdRefresh className="size-3" />
                Reload
              </span>
            </WithTooltip>
          )}
        </Button>
      }
      align="end"
      contentClassName="w-[480px] p-none"
    >
      <div className="flex items-center justify-between border-b px-md py-sm">
        <Text as="span" variant="label">Builds</Text>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => {
            setOpen(false);
            openPane(buildPane, {}, { mode: "root" });
          }}
          aria-label="Open in pane"
        >
          <MdOpenInFull className="size-3" />
        </Button>
      </div>
      <BuildPopoverContent
        variant="popover"
        onRunClick={(runId) => {
          setOpen(false);
          openPane(buildPane, {}, { mode: "root" });
          openPane(buildDetailPane, { runId }, { mode: "push" });
        }}
      />
    </InlinePopover>
  );
}

export function BuildButton() {
  const [open, setOpen] = useState(false);
  const openPane = useOpenPane();

  // --- Stale-tab detection (baked build id vs server's current build id) ---
  const { stale: staleTab } = useStaleFrontend();

  // --- Worktree live-state channel status (backend liveness) ---
  // During a build the `./singularity build` process restarts this very backend,
  // so the worktree channel drops to reconnecting/closed. Guarded by `building`,
  // that gap is what separates "Server restarting…" from "Building…".
  const { worktree: wsStatus } = useNotificationsChannelStatuses();

  // --- Build history ---
  const historyResult = useResource(buildHistoryResource);

  // Render a neutral "Builds" button while the history resource is still loading —
  // no fake "idle" status and no misleading useEffect trace before data arrives.
  if (historyResult.pending) {
    return (
      <Button variant="outline" size="sm">
        <MdBuild className="size-4" />
        Builds
      </Button>
    );
  }

  return (
    <BuildButtonInner
      open={open}
      setOpen={setOpen}
      openPane={openPane}
      staleTab={staleTab}
      wsStatus={wsStatus}
      historyData={historyResult.data}
    />
  );
}
