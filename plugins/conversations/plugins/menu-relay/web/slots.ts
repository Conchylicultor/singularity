import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import { GenericMenu } from "./components/generic-menu";
import type { MenuVariantProps } from "./variant-props";

export const MenuRelay = {
  /**
   * A dedicated look for a menu the generic card would draw as plain option
   * buttons: a contribution's `match` predicate is handed the props and claims
   * the menus it knows (first match wins); any other menu falls back to one
   * button per option. Variants never answer the menu themselves: the card owns
   * the endpoint and hands them `choose` / `cancel`.
   */
  Variant: defineDispatchSlot<MenuVariantProps>({
    // Menus have no key to dispatch on — they are claimed by predicate alone.
    key: () => "",
    fallback: GenericMenu,
  }),
};
