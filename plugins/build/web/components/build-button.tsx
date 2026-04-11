import { useState } from "react";
import { Shell } from "@plugins/shell/web/commands";
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
          const res = await fetch("/api/build", { method: "POST" });
          const { exitCode } = await res.json();
          if (exitCode === 0) {
            Shell.Toast({ description: "Build succeeded", variant: "success" });
          } else {
            Shell.Toast({ description: `Build failed (exit ${exitCode})`, variant: "error" });
          }
        } catch (err) {
          Shell.Toast({ description: "Build request failed", variant: "error" });
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
