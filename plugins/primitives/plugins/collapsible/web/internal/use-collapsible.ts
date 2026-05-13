import { useCallback, useId, useMemo, useState } from "react";

export interface UseCollapsibleOptions {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface UseCollapsibleReturn {
  open: boolean;
  toggle: () => void;
  triggerProps: {
    type: "button";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
  };
  contentId: string;
  chevronClassName: string;
}

export function useCollapsible({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: UseCollapsibleOptions = {}): UseCollapsibleReturn {
  const contentId = useId();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = useCallback(() => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [open, isControlled, onOpenChange]);

  return useMemo(
    () => ({
      open,
      toggle,
      triggerProps: {
        type: "button" as const,
        "aria-expanded": open,
        "aria-controls": contentId,
        onClick: toggle,
      },
      contentId,
      chevronClassName: open
        ? "transition-transform duration-200 rotate-90"
        : "transition-transform duration-200",
    }),
    [open, toggle, contentId],
  );
}
