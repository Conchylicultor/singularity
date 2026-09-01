import type { ComponentProps } from "react";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Standard-look nav link for the shared site header. Page plugins wrap it in
 * their `WebsiteHeader` contributions so every nav entry matches. Ghost only —
 * the site sells nothing, so it has no call-to-action variant to be the
 * exception.
 */
export function WebsiteNavLink({
  label,
  ...rest
}: {
  label: string;
} & Omit<ComponentProps<typeof Button>, "variant" | "children">) {
  return (
    <Button variant="ghost" {...rest}>
      {label}
    </Button>
  );
}
