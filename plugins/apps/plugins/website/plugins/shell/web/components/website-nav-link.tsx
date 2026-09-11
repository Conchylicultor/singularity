import type { ComponentProps, ReactNode } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Standard-look nav link for the shared site header. Page plugins wrap it in
 * their `WebsiteHeader` contributions so every nav entry matches.
 *
 * Two emphases, and the split is about role rather than importance: `quiet`
 * (the default) is a place on this site, and there are several of them, so they
 * must not compete with each other — they sit in the secondary grey and come up
 * to full foreground under the pointer, with no hover box: the colour change is
 * the whole affordance, as in running text. `strong` is the header's one call to
 * action — the thing the site asks a reader to DO rather than somewhere it offers
 * to take them — and there is exactly one of it, which is what earns it a filled
 * pill.
 *
 * The filled pill is the site's INVERTED fill (the foreground colour, with dark
 * type), which the site's palette carries as `secondary`; the brand accent
 * (`primary`) is reserved for identity and hover. The one exception is the pill
 * while a popup it opened is showing (`aria-expanded`, which the popover trigger
 * sets): it takes the accent fill, so the button and the panel hanging off it
 * read as one open thing.
 */
export function WebsiteNavLink({
  label,
  emphasis = "quiet",
  icon,
  ...rest
}: {
  label: string;
  /** `quiet` = a page of this site. `strong` = the header's one call to action. */
  emphasis?: "quiet" | "strong";
  /** A leading glyph, sized by the button (a `react-icons` element). */
  icon?: ReactNode;
} & Omit<ComponentProps<typeof Button>, "variant" | "shape" | "children">) {
  return emphasis === "strong" ? (
    <Button
      variant="secondary"
      shape="pill"
      className="font-semibold aria-expanded:bg-primary aria-expanded:text-primary-foreground"
      {...rest}
    >
      {icon}
      {label}
    </Button>
  ) : (
    <Button
      variant="ghost"
      className="text-muted-foreground hover:text-foreground hover:bg-transparent"
      {...rest}
    >
      {icon}
      {label}
    </Button>
  );
}
