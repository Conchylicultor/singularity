import { useState, type ReactNode } from "react";
import { MdFilterList } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { FilterController } from "../../internal/use-filter-controller";
import type { FilterPresetsController } from "../../internal/use-filter-presets";
import { FilterBuilderPopover } from "./filter-builder-popover";

/**
 * The filter pill. `Filter` (ghost) when no complete rules; `{n} rule(s)`
 * (funnel icon, secondary) when active. Opens the builder popover (which also
 * hosts the saved presets).
 */
export function FilterBuilderTrigger<TRow>(props: {
  controller: FilterController<TRow>;
  presets: FilterPresetsController;
}): ReactNode {
  const { controller, presets } = props;
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
      width="fit"
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
        presets={presets}
        onClose={() => setOpen(false)}
      />
    </InlinePopover>
  );
}
