import type { ReactNode } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSection,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ViewActionsCore } from "../internal/use-view-model";

/**
 * The "add a view" menu rows, shared by both switchers (the chip strip's `+`
 * menu and the collapsed chip's "Add view" submenu) so which types a surface
 * offers, and how they are grouped, is decided in one place.
 *
 * - One implicit source (no title) → a flat list of view types.
 * - Several sources → one labelled section per source (the composed
 *   Group+GroupLabel primitive — a groupless label would crash).
 *
 * Renders menu ITEMS only: the caller owns the `DropdownMenuContent` (or
 * sub-menu content) they sit in.
 */
export function AddViewMenuItems({
  actions,
}: {
  actions: ViewActionsCore;
}): ReactNode {
  const sources = actions.availableSources;
  if (sources.length === 1 && !sources[0]!.title) {
    return sources[0]!.types.map((v) => {
      const Icon = v.icon;
      return (
        <DropdownMenuItem key={v.type} onClick={() => actions.addView(v.type)}>
          <Icon className="size-4" />
          {v.title}
        </DropdownMenuItem>
      );
    });
  }
  return sources.map((source) => (
    <DropdownMenuSection
      key={source.sourceId ?? ""}
      label={source.title ?? source.sourceId ?? "Views"}
    >
      {source.types.map((v) => {
        const Icon = v.icon;
        return (
          <DropdownMenuItem
            key={v.type}
            onClick={() => actions.addView(v.type, source.sourceId)}
          >
            <Icon className="size-4" />
            {v.title}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuSection>
  ));
}
