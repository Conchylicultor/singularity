import { useState, type ReactNode } from "react";
import { MdSwapVert } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import type { SortController } from "../../internal/use-sort-controller";
import type { SortPresetsController } from "../../internal/use-sort-presets";
import { SortBuilderPopover } from "./sort-builder-popover";

/**
 * The sort pill. `Sort` (ghost) when no rules; `{n} sort(s)` (secondary) when
 * active. Opens the builder popover (which also hosts the saved presets). The
 * label still counts only the live rules.
 */
export function SortBuilderTrigger<TRow>(props: {
  controller: SortController<TRow>;
  presets: SortPresetsController;
}): ReactNode {
  const { controller, presets } = props;
  const [open, setOpen] = useState(false);
  const active = controller.ruleCount > 0;
  const label = active
    ? `${controller.ruleCount} ${controller.ruleCount === 1 ? "sort" : "sorts"}`
    : "Sort";

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="2xl"
      tooltip={label}
      trigger={
        <Button
          variant={active ? "secondary" : "ghost"}
          aspect="icon"
          aria-label={label}
        >
          <MdSwapVert />
        </Button>
      }
    >
      <SortBuilderPopover
        controller={controller}
        presets={presets}
        onClose={() => setOpen(false)}
      />
    </InlinePopover>
  );
}
