import { useState, useEffect, useRef } from "react";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { getHealth, waitForRestart } from "@plugins/health/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { MdRefresh } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { mainAheadCountResource } from "../../shared/resources";

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
  const [building, setBuilding] = useState(false);
  const [autoBuilding, setAutoBuilding] = useState(false);
  const [staleTab, setStaleTab] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initialHashRef = useRef<string | null>(null);
  const lastAutoBuildAtRef = useRef<string | null | undefined>(undefined);

  const { data: aheadData } = useResource(mainAheadCountResource);
  const mainAheadCount = aheadData?.count ?? 0;

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
      Shell.Toast({ description: "Auto-build triggered by new push", variant: "info" });
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

  async function handleBuild() {
    setBuilding(true);
    try {
      const before = await getHealth();
      if (!before) {
        Shell.Toast({ description: "Server unreachable", variant: "error" });
        return;
      }

      fetch("/api/build", { method: "POST" }).catch(() => {});

      const restarted = await waitForRestart(before.startedAt);
      if (restarted) {
        Shell.Toast({ description: "Build succeeded", variant: "success" });
      } else {
        Shell.Toast({ description: "Build timed out", variant: "error" });
      }

      const status = await getBuildStatus();
      if (status) applyStatus(status);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="outline" size="sm" disabled={building} onClick={handleBuild}>
            <MdRefresh className={`size-4 ${building || autoBuilding ? "animate-spin" : ""}`} />
            Build
            {mainAheadCount > 0 ? (
              <Tooltip>
                <TooltipTrigger render={<span className="block size-2 rounded-full bg-amber-400" />} />
                <TooltipContent>
                  main is {mainAheadCount} commit{mainAheadCount !== 1 ? "s" : ""} ahead of this worktree
                </TooltipContent>
              </Tooltip>
            ) : loaded && !staleTab ? (
              <Tooltip>
                <TooltipTrigger render={<span className="block size-2 rounded-full bg-zinc-400" />} />
                <TooltipContent>Synced to HEAD</TooltipContent>
              </Tooltip>
            ) : null}
            {staleTab && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      className="block size-2 rounded-full bg-sky-400 hover:bg-sky-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.reload();
                      }}
                    />
                  }
                />
                <TooltipContent>Server was rebuilt — click to reload this tab</TooltipContent>
              </Tooltip>
            )}
          </Button>
        }
      />
      <TooltipContent>Build project</TooltipContent>
    </Tooltip>
  );
}
