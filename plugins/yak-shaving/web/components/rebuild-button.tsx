import { useState } from "react";
import { MdRefresh } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";

export function RebuildButton() {
  const [rebuilding, setRebuilding] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rebuilding}
      onClick={async () => {
        setRebuilding(true);
        try {
          const res = await fetch("/api/yak/rebuild", { method: "POST" });
          if (res.ok) {
            Shell.Toast({
              description: "Rebuilding tree — nodes will appear shortly",
              variant: "info",
            });
          } else {
            Shell.Toast({
              description: `Rebuild failed (${res.status})`,
              variant: "error",
            });
          }
        } catch {
          Shell.Toast({ description: "Rebuild request failed", variant: "error" });
        } finally {
          setRebuilding(false);
        }
      }}
    >
      <MdRefresh className={`size-4 ${rebuilding ? "animate-spin" : ""}`} />
      Rebuild
    </Button>
  );
}
