import { useState, useEffect } from "react";
import { useResource, useNotificationsChannelStatuses } from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull, MdRefresh } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { clientLog } from "@plugins/debug/plugins/logs/web";
import { mainAheadCountResource, buildHistoryResource } from "../../shared";
import { useStaleFrontend } from "../hooks/use-stale-frontend";
import { BuildPopoverContent } from "./build-popover-content";
import { buildPane, buildDetailPane } from "../panes";

export function BuildButton() {
  const [open, setOpen] = useState(false);
  const openPane = useOpenPane();

  // --- Stale-tab detection (baked build id vs server's current build id) ---
  const { stale: staleTab } = useStaleFrontend();

  // --- Main ahead count ---
  const aheadResult = useResource(mainAheadCountResource);
  const mainAheadCount = aheadResult.pending ? 0 : aheadResult.data.count;

  // --- Worktree live-state channel status (backend liveness) ---
  // During a build the `./singularity build` process restarts this very backend,
  // so the worktree channel drops to reconnecting/closed. Guarded by `building`,
  // that gap is what separates "Server restarting…" from "Building…".
  const { worktree: wsStatus } = useNotificationsChannelStatuses();

  // --- Build history ---
  const historyResult = useResource(buildHistoryResource);
  const historyData = historyResult.pending ? undefined : historyResult.data;
  const latestRun = historyData?.[0];
  const building = latestRun?.finishedAt === null;
  const failed =
    !building && latestRun != null && latestRun.exitCode !== null && latestRun.exitCode !== 0;
  const loaded = !aheadResult.pending;

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
    idle: "Build",
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
          {label}
          {status === "updated" ? (
            <WithTooltip content="Server was rebuilt — click to reload this tab">
              <span
                role="button"
                tabIndex={0}
                // eslint-disable-next-line row/no-adhoc-row -- nested interactive chip inside the build trigger button; a real button can't nest inside the Button trigger
                className="ml-0.5 inline-flex items-center gap-0.5 rounded bg-info/15 px-1.5 py-0.5 text-xs font-medium text-info hover:bg-info/25"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.reload();
                }}
              >
                <MdRefresh className="size-3" />
                Reload
              </span>
            </WithTooltip>
          ) : mainAheadCount > 0 ? (
            <WithTooltip content={`main is ${mainAheadCount} commit${mainAheadCount !== 1 ? "s" : ""} ahead of this worktree`}>
              <span className="block size-2 rounded-full bg-warning" />
            </WithTooltip>
          ) : loaded ? (
            <WithTooltip content="Synced to HEAD">
              <span className="block size-2 rounded-full bg-muted-foreground" />
            </WithTooltip>
          ) : null}
        </Button>
      }
      align="end"
      contentClassName="w-[480px] p-0"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Build</span>
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
