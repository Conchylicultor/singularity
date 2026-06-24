import { useState, type ReactNode } from "react";
import { MdFilterList } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FilterController } from "../../internal/use-filter-controller";
import { FilterBuilderPopover } from "./filter-builder-popover";

/**
 * The filter pill. `Filter` (ghost) when no complete rules; `{n} rule(s)`
 * (funnel icon, secondary) when active. Opens the builder popover.
 */
export function FilterBuilderTrigger<TRow>(props: {
  controller: FilterController<TRow>;
}): ReactNode {
  const { controller } = props;
  const [open, setOpen] = useState(false);
  const active = controller.ruleCount > 0;
  const label = active
    ? `${controller.ruleCount} ${controller.ruleCount === 1 ? "rule" : "rules"}`
    : "Filter";

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="2xl"
      trigger={
        <Button
          variant={active ? "secondary" : "ghost"}
          aria-label="Filter"
        >
          <MdFilterList />
          {label}
        </Button>
      }
    >
      <FilterBuilderPopover
        controller={controller}
        onClose={() => setOpen(false)}
      />
    </InlinePopover>
  );
}
