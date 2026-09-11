import {
  both,
  type TokenGroupFragment,
} from "@plugins/ui/plugins/theme-engine/core";
import { shapeGroup } from "../core";

/** "Fill from…" shortcuts for the shape group: whole-group value sets, not settings. */
export const shapeShortcuts: {
  id: string;
  label: string;
  fragment: TokenGroupFragment;
}[] = [
  {
    id: "default",
    label: "Default",
    fragment: shapeGroup.fragment(
      both({ radius: "0.625rem", spacing: "0.25rem" }),
    ),
  },
  {
    id: "sharp",
    label: "Sharp",
    fragment: shapeGroup.fragment(both({ radius: "0rem", spacing: "0.25rem" })),
  },
  {
    id: "rounded",
    label: "Rounded",
    fragment: shapeGroup.fragment(
      both({ radius: "0.75rem", spacing: "0.25rem" }),
    ),
  },
  {
    id: "pill",
    label: "Pill",
    fragment: shapeGroup.fragment(
      both({ radius: "9999px", spacing: "0.25rem" }),
    ),
  },
];
