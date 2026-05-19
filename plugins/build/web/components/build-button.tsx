import { useState, useEffect, useRef } from "react";
import { toast } from "@plugins/notifications/web";
import { getHealth, waitForRestart } from "@plugins/health/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { mainAheadCountResource, buildHistoryResource } from "../../shared";
import { BuildPopoverContent } from "./build-popover-content";
import { buildPane, buildDetailPane } from "../panes";

interface BuildStatus {
  frontendHash: string;
  autoBuildAt: string | null;
}

async function getBuildStatus(): Promise<BuildStatus | null> {
  try {
    const res = await fetch("/api/build/status");
    if (!res.ok) return null;
    return res.json() as Promise<BuildStatus>;
  } catch {
    return null;
  }
}

export function BuildButton() {
  const [open, setOpen] = useState(false);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [staleTab, setStaleTab] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const openPane = useOpenPane();
  const initialHashRef = useRef<string | null>(null);
  const lastAutoBuildAtRef = useRef<string | null | undefined>(undefined);

  const aheadResult = useResource(mainAheadCountResource);
  const mainAheadCount = aheadResult.pending ? 0 : (aheadResult.data?.count ?? 0);

  const historyResult = useResource(buildHistoryResource);
  const latestRun = historyResult.pending ? undefined : historyResult.data[0];
  const building = latestRun?.finishedAt === null;
  const trackedBuildRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestRun) return;

    if (latestRun.finishedAt === null) {
      trackedBuildRef.current = latestRun.id;
      return;
    }

    if (trackedBuildRef.current === latestRun.id) {
      trackedBuildRef.current = null;
      if (latestRun.exitCode === 0) {
        toast({ type: "build", description: "Build succeeded", variant: "success" });
      } else {
        toast({ type: "build", description: `Build failed (exit ${latestRun.exitCode})`, variant: "error" });
      }
    }
  }, [latestRun?.id, latestRun?.finishedAt]);

  function applyStatus(status: BuildStatus) {
    if (initialHashRef.current === null) {
      initialHashRef.current = status.frontendHash;
      setLoaded(true);
    } else if (status.frontendHash && status.frontendHash !== initialHashRef.current) {
      setStaleTab(true);
    }
    if (lastAutoBuildAtRef.current === undefined) {
      lastAutoBuildAtRef.current = status.autoBuildAt;
    } else if (status.autoBuildAt && status.autoBuildAt !== lastAutoBuildAtRef.current) {
      lastAutoBuildAtRef.current = status.autoBuildAt;
      toast({ type: "build", description: "Auto-build triggered by new push", variant: "info" });
      setAutoBuilding(true);
      getHealth().then((before) => {
        if (!before) { setAutoBuilding(false); return; }
        waitForRestart(before.startedAt).then(() => setAutoBuilding(false));
      });
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const status = await getBuildStatus();
      if (status && !cancelled) applyStatus(status);
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const spinning = building || autoBuilding;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
          <Spinner spinning={spinning} className="size-4" />
          {spinning ? "Building…" : "Build"}
          {mainAheadCount > 0 ? (
            <WithTooltip content={`main is ${mainAheadCount} commit${mainAheadCount !== 1 ? "s" : ""} ahead of this worktree`}>
              <span className="block size-2 rounded-full bg-amber-400" />
            </WithTooltip>
          ) : loaded && !staleTab ? (
            <WithTooltip content="Synced to HEAD">
              <span className="block size-2 rounded-full bg-zinc-400" />
            </WithTooltip>
          ) : null}
          {staleTab && (
            <WithTooltip content="Server was rebuilt — click to reload this tab">
              <button
                className="block size-2 rounded-full bg-sky-400 hover:bg-sky-500"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.reload();
                }}
              />
            </WithTooltip>
          )}
        </button>
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
