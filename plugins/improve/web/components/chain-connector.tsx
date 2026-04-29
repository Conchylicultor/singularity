import { MdAdd, MdArrowDownward } from "react-icons/md";

export interface ChainConnectorProps {
  // The "blocks" label only appears between cards (not above the first).
  showBlocksLabel: boolean;
  disabled?: boolean;
  onInsert: () => void;
}

// Slim row between cards. Hovering the row reveals an inline "+" that inserts
// a new card at this position. Between-card variants also show a faint
// "↓ blocks" label so the chain direction is unambiguous.
export function ChainConnector({
  showBlocksLabel,
  disabled,
  onInsert,
}: ChainConnectorProps) {
  return (
    <div className="group/connector relative flex h-3 items-center justify-center">
      {showBlocksLabel ? (
        <div className="text-muted-foreground/60 flex items-center gap-0.5 text-[10px] uppercase tracking-wider transition-opacity group-hover/connector:opacity-0">
          <MdArrowDownward className="size-3" />
          <span>blocks</span>
        </div>
      ) : (
        // First-position connector: invisible spacer until hovered.
        <div className="h-px w-full" />
      )}
      <button
        type="button"
        onClick={onInsert}
        disabled={disabled}
        aria-label="Insert task here"
        title="Insert task here"
        className="bg-primary text-primary-foreground absolute flex size-5 items-center justify-center rounded-full opacity-0 shadow transition-opacity group-hover/connector:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none"
      >
        <MdAdd className="size-3.5" />
      </button>
    </div>
  );
}
