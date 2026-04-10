import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shell } from "@plugins/shell/web/commands";

export function DummyPanel() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <Button variant="secondary" size="sm" onClick={() => {
        setCount((c) => c + 1);
        Shell.Toast({ description: `Clicked ${count + 1} times` });
      }}>
        Clicked {count} times
      </Button>
      <Button variant="secondary" size="sm" onClick={() => {
        Shell.Toast({ title: "Oops", description: "Something went wrong", variant: "error" });
      }}>
        Error toast
      </Button>
    </div>
  );
}
