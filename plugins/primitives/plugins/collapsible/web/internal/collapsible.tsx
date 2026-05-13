import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCollapsible, type UseCollapsibleOptions } from "./use-collapsible";

interface CollapsibleCtx {
  open: boolean;
  toggle: () => void;
  contentId: string;
}

const Ctx = createContext<CollapsibleCtx | null>(null);

function useCtx() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "Collapsible compound components must be used inside <Collapsible>",
    );
  return ctx;
}

export interface CollapsibleProps extends UseCollapsibleOptions {
  className?: string;
  children: ReactNode;
}

export function Collapsible({
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  className,
  children,
}: CollapsibleProps) {
  const { open, toggle, contentId } = useCollapsible({
    defaultOpen,
    open: controlledOpen,
    onOpenChange,
  });

  return (
    <Ctx value={{ open, toggle, contentId }}>
      <div
        data-slot="collapsible"
        data-state={open ? "open" : "closed"}
        className={className}
      >
        {children}
      </div>
    </Ctx>
  );
}

export interface CollapsibleTriggerProps extends ComponentProps<"button"> {}

export function CollapsibleTrigger({
  className,
  ...props
}: CollapsibleTriggerProps) {
  const { open, toggle, contentId } = useCtx();

  return (
    <button
      type="button"
      data-slot="collapsible-trigger"
      data-state={open ? "open" : "closed"}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={toggle}
      className={cn("flex w-full items-center text-left", className)}
      {...props}
    />
  );
}

export interface CollapsibleContentProps extends ComponentProps<"div"> {
  forceMount?: boolean;
}

export function CollapsibleContent({
  className,
  children,
  forceMount,
  ...props
}: CollapsibleContentProps) {
  const { open, contentId } = useCtx();

  if (!forceMount && !open) return null;

  return (
    <div
      data-slot="collapsible-content"
      data-state={open ? "open" : "closed"}
      id={contentId}
      role="region"
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CollapsibleChevronProps {
  open?: boolean;
  className?: string;
}

export function CollapsibleChevron({
  open: openProp,
  className,
}: CollapsibleChevronProps) {
  const ctx = useContext(Ctx);
  const open = openProp ?? ctx?.open ?? false;

  return (
    <ChevronRight
      className={cn(
        "shrink-0 transition-transform duration-200",
        open && "rotate-90",
        className,
      )}
    />
  );
}
