import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import { MdChevronRight } from "react-icons/md";
import { useCollapsible, type UseCollapsibleOptions } from "./use-collapsible";

export interface CollapsibleCtx {
  open: boolean;
  toggle: () => void;
  contentId: string;
}

const CollapsibleContext = createContext<CollapsibleCtx | null>(null);

function useCtx() {
  const ctx = useContext(CollapsibleContext);
  if (!ctx)
    throw new Error(
      "Collapsible compound components must be used inside <Collapsible>",
    );
  return ctx;
}

/**
 * Reads the compound collapsible context WITHOUT throwing when absent.
 * Returns null outside a <Collapsible>. Lets context-aware components (e.g.
 * SectionHeaderRow) integrate with the compound pattern's open/toggle/aria
 * wiring while still working standalone. The raw Ctx stays private.
 */
export function useCollapsibleContext(): CollapsibleCtx | null {
  return useContext(CollapsibleContext);
}

export interface CollapsibleProviderProps extends UseCollapsibleOptions {
  children: ReactNode;
}

/**
 * The open/toggle/aria state of a collapsible, WITHOUT the wrapper element —
 * `Collapsible` minus its `<div>`. Reach for it when the trigger and the content
 * must be **siblings in the parent's own layout** rather than nested inside a box
 * of the collapsible's making: a subgrid row (a wrapper would displace the
 * `col-span-full` children out of the grid), or a sticky stack (a wrapper becomes
 * each header's containing block, so the header un-pins when its own section
 * scrolls away — exactly what a stack must not do). Everything else should use
 * `Collapsible`, whose `<div>` gives the group a real box and the `data-state`
 * hook.
 */
export function CollapsibleProvider({
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  children,
}: CollapsibleProviderProps) {
  const { open, toggle, contentId } = useCollapsible({
    defaultOpen,
    open: controlledOpen,
    onOpenChange,
  });

  const ctxValue = useMemo(
    () => ({ open, toggle, contentId }),
    [open, toggle, contentId],
  );

  return <CollapsibleContext value={ctxValue}>{children}</CollapsibleContext>;
}

export interface CollapsibleProps extends CollapsibleProviderProps {
  className?: string;
}

/** The standard collapsible: `CollapsibleProvider` plus the wrapper element that
 *  gives the group a box, a `data-state` styling hook, and (for a plain sticky
 *  header inside it) its own sticky containing block. */
export function Collapsible({ className, children, ...options }: CollapsibleProps) {
  return (
    <CollapsibleProvider {...options}>
      <CollapsibleBox className={className}>{children}</CollapsibleBox>
    </CollapsibleProvider>
  );
}

/** The wrapper `Collapsible` adds over the provider. Private: it reads the context
 *  the provider just published, so `data-state` stays on the same element it
 *  always was. */
function CollapsibleBox({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { open } = useCtx();
  return (
    <div
      data-slot="collapsible"
      data-state={open ? "open" : "closed"}
      className={className}
    >
      {children}
    </div>
  );
}

export interface CollapsibleTriggerProps extends ComponentProps<"button"> {}

export function CollapsibleTrigger({
  className,
  ...props
}: CollapsibleTriggerProps) {
  const { open, toggle, contentId } = useCtx();

  return (
    // Line container: single-line by contract (the `region-line` root already
    // carries the structural `whitespace-nowrap`; this adds the leaf ellipsis layer).
    <SingleLineProvider value={true}>
      <button
        type="button"
        data-slot="collapsible-trigger"
        data-state={open ? "open" : "closed"}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
        // eslint-disable-next-line layout/no-adhoc-layout -- the trigger is a real <button> (needs type=button); Stack/Frame can't carry button-only attrs, so the flex row stays here
        className={cn("flex w-full region-line text-left", className)}
        {...props}
      />
    </SingleLineProvider>
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
  const ctx = useContext(CollapsibleContext);
  const open = openProp ?? ctx?.open ?? false;

  return (
    <MdChevronRight
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid chevron indicator placed in arbitrary trigger rows; must never shrink
      className={cn(
        "shrink-0 transition-transform duration-200",
        open && "rotate-90",
        className,
      )}
    />
  );
}
