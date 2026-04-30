import { MdAdd, MdArrowDownward } from "react-icons/md";

export interface ChainConnectorProps {
  showBlocksLabel: boolean;
  disabled?: boolean;
  onInsert: () => void;
}

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
