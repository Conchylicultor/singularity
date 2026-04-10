import { useEffect, useState } from "react";
import { MdDeviceHub } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorktreeStatus {
  name: string;
  state: string;
  port: number;
  lastActivity: string;
  activeConns: number;
}

export function WorktreeDropdown() {
  const [worktrees, setWorktrees] = useState<WorktreeStatus[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorktrees() {
      try {
        const res = await fetch("/gateway/worktrees");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWorktrees(data);
      } catch {
        // Gateway not available — leave list empty
      }
    }

    fetchWorktrees();
    const interval = setInterval(fetchWorktrees, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const currentHost = window.location.hostname;
  const currentWorktree = currentHost.endsWith(".localhost")
    ? currentHost.replace(/\.localhost$/, "")
    : null;

  function switchTo(name: string) {
    const url = new URL(window.location.href);
    url.hostname = `${name}.localhost`;
    window.location.href = url.toString();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm">
            <MdDeviceHub className="size-4" />
            {currentWorktree ?? "head"}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {worktrees.length === 0 ? (
            <DropdownMenuItem disabled>
              No worktrees registered
            </DropdownMenuItem>
          ) : (
            worktrees.map((wt) => (
              <DropdownMenuItem
                key={wt.name}
                onClick={() => switchTo(wt.name)}
                className={wt.name === currentWorktree ? "font-semibold" : ""}
              >
                <span className="flex-1">{wt.name}</span>
                <span className="text-xs text-muted-foreground ml-4">
                  {wt.state}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
