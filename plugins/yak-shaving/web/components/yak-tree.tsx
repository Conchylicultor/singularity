import { useResource } from "@core";
import { yakShavingNodesResource } from "../../shared/resources";

// Placeholder tree. Sub-task C will land the `renderLabel` enhancement on
// TreeList; sub-task E populates the rows. For now we render a flat list
// of node IDs so the resource wiring is exercised end-to-end.
export function YakTree({ selectedConvId }: { selectedConvId?: string }) {
  const { data } = useResource(yakShavingNodesResource);
  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-2 py-1 text-sm">
        No nodes yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((n) => (
        <li
          key={n.id}
          className={
            "rounded px-2 py-1 text-sm " +
            (n.conversationId === selectedConvId ? "bg-accent" : "")
          }
        >
          <span className="font-mono text-xs">{n.conversationId}</span>
        </li>
      ))}
    </ul>
  );
}
