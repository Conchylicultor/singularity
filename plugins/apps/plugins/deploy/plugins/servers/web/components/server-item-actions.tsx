import { type ReactElement } from "react";
import { MdOpenInNew } from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import type { Server } from "../../shared";

/** Per-consumer trailing-action slot for the deploy Servers list rows. */
export const ServerItemActions = defineItemActions<Server>(
  "deploy.servers.item-actions",
);

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
    <RowActionButton
      icon={MdOpenInNew}
      label="Open console"
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    />
  );
}
