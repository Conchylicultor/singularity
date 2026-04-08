import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DummyPanel() {
  const [count, setCount] = useState(0);

  return (
    <div className="px-4 pb-3">
      <Button variant="secondary" size="sm" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </Button>
    </div>
  );
}
