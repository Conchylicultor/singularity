import { useState } from "react";
import { Shell } from "@plugins/shell/web/commands";
import { getHealth, waitForRestart } from "@plugins/health/web/api";
import { MdRefresh } from "react-icons/md";
import { Button } from "@/components/ui/button";

export function BuildButton() {
  const [building, setBuilding] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={building}
      onClick={async () => {
        setBuilding(true);
        try {
          const before = await getHealth();
          if (!before) {
            Shell.Toast({ description: "Server unreachable", variant: "error" });
            return;
          }

          // Fire-and-forget — the build restarts the server, so the response
          // will usually never arrive. We swallow the error and poll instead.
          fetch("/api/build", { method: "POST" }).catch(() => {});

          const restarted = await waitForRestart(before.startedAt);
          if (restarted) {
            Shell.Toast({ description: "Build succeeded", variant: "success" });
          } else {
            Shell.Toast({ description: "Build timed out", variant: "error" });
          }
        } finally {
          setBuilding(false);
        }
      }}
    >
      <MdRefresh className={`size-4 ${building ? "animate-spin" : ""}`} />
      Build
    </Button>
  );
}
