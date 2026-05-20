import { useState, useEffect, useRef } from "react";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { mainAheadCountResource, buildHistoryResource, frontendHashResource } from "../../shared";
import { BuildPopoverContent } from "./build-popover-content";
import { buildPane, buildDetailPane } from "../panes";

export function BuildButton() {
  const [open, setOpen] = useState(false);
  const [staleTab, setStaleTab] = useState(false);
  const openPane = useOpenPane();

  // --- Frontend hash (stale-tab detection) ---
  const hashResult = useResource(frontendHashResource);
  const currentHash = hashResult.pending ? "" : hashResult.data.hash;
  const initialHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (hashResult.pending) return;
    if (!currentHash) return;
    if (initialHashRef.current === null) {
      initialHashRef.current = currentHash;
    } else if (currentHash !== initialHashRef.current) {
      setStaleTab(true);
    }
  }, [hashResult.pending, currentHash]);

  // --- Main ahead count ---
  const aheadResult = useResource(mainAheadCountResource);
  const mainAheadCount = aheadResult.pending ? 0 : (aheadResult.data?.count ?? 0);

  // --- Build history ---
  const historyResult = useResource(buildHistoryResource);
  const historyData = historyResult.pending ? undefined : historyResult.data;
  const latestRun = historyData?.[0];
  const building = latestRun?.finishedAt === null;
  const trackedBuildRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // Build completion toast
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

  // Auto-build toast — detect new in-flight auto-triggered row
  const lastSeenAutoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!historyData) return;

    // Mark initialized after first non-pending delivery to suppress toast on load
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Seed the ref with the current auto-build id (if any) so we don't toast on load
      const currentAuto = historyData.find(
        (r) => r.trigger === "auto" && r.finishedAt === null,
      );
      lastSeenAutoRef.current = currentAuto?.id ?? null;
      return;
    }

    const autoRun = historyData.find(
      (r) => r.trigger === "auto" && r.finishedAt === null,
    );
    if (autoRun && autoRun.id !== lastSeenAutoRef.current) {
      lastSeenAutoRef.current = autoRun.id;
      toast({ type: "build", description: "Auto-build triggered by new push", variant: "info" });
    }
  }, [historyData]);

  const loaded = !hashResult.pending;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
          <Spinner spinning={building} className="size-4" />
          {building ? "Building…" : "Build"}
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
