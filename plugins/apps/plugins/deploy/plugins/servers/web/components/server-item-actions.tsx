import { type ReactElement } from "react";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import type { Server } from "../../shared";
import { navIcons } from "@plugins/ui/plugins/icons/core";

/** Per-consumer trailing-action slot for the deploy Servers list rows. */
export const ServerItemActions = defineItemActions<Server>();

/**
 * Opens the server's provider management console in a new tab. Rendered only
 * for rows that carry a `consoleUrl`; a server without one contributes no action.
 */
export function OpenConsoleAction({
  row,
}: ItemActionProps<Server>): ReactElement | null {
  const url = row.consoleUrl;
  if (!url) return null;
  return (
    <IconButton
      icon={navIcons.newTab}
      label="Open console"
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    />
  );
}
