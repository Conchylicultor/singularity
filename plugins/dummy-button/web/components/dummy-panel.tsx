import { useState } from "react";

export function DummyPanel() {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold mb-3">Dummy</h2>
      <button
        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        onClick={() => setCount((c) => c + 1)}
      >
        Clicked {count} times
      </button>
    </div>
  );
}
